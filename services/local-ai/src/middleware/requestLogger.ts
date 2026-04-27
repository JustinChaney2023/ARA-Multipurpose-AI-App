/**
 * Request Logging Middleware
 * Enhanced logging with timing, body size, and response status
 */

import type { Request, Response, NextFunction } from 'express';

import { logger } from '../logger.js';

interface RequestTiming {
  startTime: number;
  endTime?: number;
  duration?: number;
}

// Store timing info per request
const requestTimings = new WeakMap<Request, RequestTiming>();

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip health checks in non-debug mode
  if (req.path === '/health' && process.env.LOG_LEVEL !== 'debug') {
    return next();
  }

  // Start timing
  requestTimings.set(req, { startTime: Date.now() });

  // Capture response finish
  const originalEnd = res.end.bind(res);

  res.end = function (
    chunk?: unknown,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void
  ): Response {
    // Calculate duration
    const timing = requestTimings.get(req);
    if (timing) {
      timing.endTime = Date.now();
      timing.duration = timing.endTime - timing.startTime;
    }

    // Log the request
    logRequest(req, res, chunk, timing);

    // Restore original end before calling it
    res.end = originalEnd;

    // Call original end with proper argument handling
    if (typeof encoding === 'function') {
      // encoding is actually the callback
      return res.end(chunk, encoding);
    }
    if (cb && encoding) {
      return res.end(chunk, encoding, cb);
    }
    if (encoding) {
      return res.end(chunk, encoding);
    }
    return res.end(chunk);
  };

  next();
}

/**
 * Log a completed request
 */
function logRequest(req: Request, res: Response, chunk: unknown, timing?: RequestTiming): void {
  const status = res.statusCode;
  const method = req.method;
  const path = req.path;
  const duration = timing?.duration || 0;

  // Calculate response size
  let responseSize = 0;
  if (chunk) {
    if (Buffer.isBuffer(chunk)) {
      responseSize = chunk.length;
    } else if (typeof chunk === 'string') {
      responseSize = Buffer.byteLength(chunk);
    }
  }

  // Get content length header if available
  const contentLength = res.getHeader('content-length');
  if (contentLength && !responseSize) {
    responseSize = parseInt(contentLength as string, 10) || 0;
  }

  // Get request size
  const requestSize = parseInt(req.headers['content-length'] || '0', 10);

  // Build log message
  const logData = {
    method,
    path,
    status,
    duration: `${duration}ms`,
    requestSize: formatBytes(requestSize),
    responseSize: formatBytes(responseSize),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    userAgent: req.headers['user-agent']?.split(' ')[0],
  };

  // Log based on status
  if (status >= 500) {
    logger.error(`Request failed`, logData);
  } else if (status >= 400) {
    logger.warn(`Request error`, logData);
  } else {
    logger.info(`${method} ${path} ${status} ${duration}ms`, logData);
  }
}

/**
 * Performance logging middleware - logs slow requests
 */
export function performanceLogger(thresholdMs: number = 5000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      if (duration > thresholdMs) {
        logger.warn('Slow request detected', {
          method: req.method,
          path: req.path,
          duration: `${duration}ms`,
          threshold: `${thresholdMs}ms`,
        });
      }
    });

    next();
  };
}
