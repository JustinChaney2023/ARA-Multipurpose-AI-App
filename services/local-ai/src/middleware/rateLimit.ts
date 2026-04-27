/**
 * Rate Limiting Middleware
 * Prevents abuse and protects resources
 */

import type { Request, Response, NextFunction } from 'express';

import { logger } from '../logger.js';

// ============================================================================
// Rate Limiting Store
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
  windowStart: number;
}

class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60000) {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Global store instance
const rateLimitStore = new RateLimitStore();

// ============================================================================
// Rate Limit Configuration
// ============================================================================

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  handler?: (req: Request, res: Response) => void;
}

// Default configurations for different endpoints
export const RATE_LIMITS = {
  // Strict limits for expensive operations
  extraction: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 requests per minute
  },
  // Moderate limits for PDF export
  export: {
    windowMs: 60 * 1000,
    maxRequests: 10,
  },
  // Lenient for health checks
  health: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  // Default for other endpoints
  default: {
    windowMs: 60 * 1000,
    maxRequests: 20,
  },
};

// ============================================================================
// Key Generators
// ============================================================================

function defaultKeyGenerator(req: Request): string {
  // Use IP address + path as key
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const path = req.path;
  return `${ip}:${path}`;
}

function ipKeyGenerator(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ============================================================================
// Rate Limit Middleware
// ============================================================================

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator = defaultKeyGenerator, handler } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Create new entry or reset expired window
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
        windowStart: now,
      };
    }

    // Increment count
    entry.count++;
    rateLimitStore.set(key, entry);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      logger.warn('Rate limit exceeded', {
        key,
        path: req.path,
        count: entry.count,
        limit: maxRequests,
      });

      if (handler) {
        handler(req, res);
        return;
      }

      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          status: 429,
          details: {
            retryAfter: Math.ceil((entry.resetTime - now) / 1000),
            limit: maxRequests,
            window: `${windowMs / 1000}s`,
          },
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
}

// ============================================================================
// Pre-configured Middlewares
// ============================================================================

export const extractionRateLimit = rateLimit({
  ...RATE_LIMITS.extraction,
  keyGenerator: ipKeyGenerator,
});

export const exportRateLimit = rateLimit({
  ...RATE_LIMITS.export,
  keyGenerator: ipKeyGenerator,
});

export const healthRateLimit = rateLimit({
  ...RATE_LIMITS.health,
  keyGenerator: ipKeyGenerator,
});

export const defaultRateLimit = rateLimit(RATE_LIMITS.default);

// ============================================================================
// Burst Protection
// ============================================================================

interface BurstConfig {
  burstLimit: number; // Max requests in burst window
  burstWindowMs: number; // Burst window (shorter than main window)
  cooldownMs: number; // Cooldown after burst exceeded
}

export function burstProtection(config: BurstConfig) {
  const { burstLimit, burstWindowMs, cooldownMs } = config;
  const burstStore = new Map<
    string,
    { count: number; resetTime: number; cooldownUntil?: number }
  >();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `burst:${req.ip || 'unknown'}`;
    const now = Date.now();

    let entry = burstStore.get(key);

    // Check if in cooldown
    if (entry?.cooldownUntil && entry.cooldownUntil > now) {
      const waitSeconds = Math.ceil((entry.cooldownUntil - now) / 1000);
      res.status(429).json({
        error: {
          code: 'BURST_LIMIT_EXCEEDED',
          message: `Burst limit exceeded. Please wait ${waitSeconds}s before retrying.`,
          status: 429,
          details: { retryAfter: waitSeconds },
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Reset or create entry
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + burstWindowMs };
    }

    entry.count++;

    // Check burst limit
    if (entry.count > burstLimit) {
      entry.cooldownUntil = now + cooldownMs;
      burstStore.set(key, entry);

      logger.warn('Burst protection triggered', {
        key,
        path: req.path,
        count: entry.count,
      });

      res.status(429).json({
        error: {
          code: 'BURST_LIMIT_EXCEEDED',
          message: 'Too many requests in short time. Cooldown activated.',
          status: 429,
          details: { retryAfter: Math.ceil(cooldownMs / 1000) },
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    burstStore.set(key, entry);
    next();
  };
}

// ============================================================================
// Circuit Breaker for LLM calls
// ============================================================================

enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening
  successThreshold: number; // Successes needed to close
  timeoutMs: number; // Time before half-open
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private nextAttempt?: number;

  constructor(private config: CircuitBreakerConfig) {}

  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      if (this.nextAttempt && Date.now() >= this.nextAttempt) {
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
        return true;
      }
      return false;
    }

    return true; // HALF_OPEN
  }

  recordSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successes = 0;
        logger.info('Circuit breaker closed - service recovered');
      }
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN || this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeoutMs;
    logger.warn('Circuit breaker opened - LLM service failing', {
      failures: this.failures,
      retryAfter: this.config.timeoutMs,
    });
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Global circuit breaker for LLM
export const llmCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 60000, // 1 minute
});

export function circuitBreakerMiddleware(
  breaker: CircuitBreaker,
  handler?: (req: Request, res: Response) => void
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!breaker.canExecute()) {
      if (handler) {
        handler(req, res);
        return;
      }

      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'LLM service temporarily unavailable. Please try again later.',
          status: 503,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Attach breaker to request for result tracking
    (req as unknown as Record<string, unknown>).circuitBreaker = breaker;
    next();
  };
}

export { CircuitBreaker, CircuitState };
