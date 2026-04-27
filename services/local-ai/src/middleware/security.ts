/**
 * Security Middleware
 * Security headers and protection
 */

import type { Request, Response, NextFunction } from 'express';

import { logger } from '../logger.js';

// ============================================================================
// Security Headers
// ============================================================================

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS Protection (legacy browsers)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  // Permissions Policy
  res.setHeader('Permissions-Policy', 
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );

  // Strict Transport Security (HTTPS only)
  // Uncomment in production with HTTPS:
  // res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  next();
}

// ============================================================================
// CORS Configuration
// ============================================================================

export function configureCors(options?: { allowedOrigins?: string[]; maxAge?: number }) {
  const { allowedOrigins = ['http://localhost:1420'], maxAge = 86400 } = options || {};

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    // Check if origin is allowed
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    res.setHeader('Access-Control-Max-Age', maxAge.toString());
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

// ============================================================================
// Request Size Limiter
// ============================================================================

export function limitRequestSize(maxSize: number = 10 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > maxSize) {
      logger.warn('Request too large', {
        path: req.path,
        size: contentLength,
        maxSize,
      });

      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Request body too large. Max: ${Math.round(maxSize / 1024 / 1024)}MB`,
          status: 413,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
}

// ============================================================================
// IP Whitelist/Blacklist
// ============================================================================

interface IPFilterConfig {
  whitelist?: string[];
  blacklist?: string[];
}

export function ipFilter(config: IPFilterConfig) {
  const { whitelist, blacklist } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = req.ip || req.socket.remoteAddress || '';

    // Check blacklist
    if (blacklist && blacklist.includes(clientIp)) {
      logger.warn('Blocked request from blacklisted IP', { ip: clientIp });
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Check whitelist
    if (whitelist && !whitelist.includes(clientIp)) {
      logger.warn('Blocked request from non-whitelisted IP', { ip: clientIp });
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          status: 403,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
}

// ============================================================================
// Request ID Middleware
// ============================================================================

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const requestId = 
    (req.headers['x-request-id'] as string) ||
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Make request ID available throughout request
  (req as unknown as Record<string, unknown>).id = requestId;

  // Add to response headers
  res.setHeader('X-Request-ID', requestId);

  next();
}

// ============================================================================
// Security Audit Logger
// ============================================================================

export function securityAudit(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId: (req as unknown as Record<string, unknown>).id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Log security-relevant events
    if (res.statusCode === 401 || res.statusCode === 403) {
      logger.warn('Authentication/Authorization failure', logData);
    } else if (res.statusCode === 429) {
      logger.warn('Rate limit hit', logData);
    } else if (res.statusCode >= 500) {
      logger.error('Server error', logData);
    }
  });

  next();
}
