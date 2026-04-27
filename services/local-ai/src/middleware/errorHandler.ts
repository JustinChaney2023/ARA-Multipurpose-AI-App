/**
 * Global Error Handler Middleware
 * Standardizes error responses across all endpoints
 */

import { AppError, isAppError, Errors } from '@ara/shared';
import type { Request, Response, NextFunction } from 'express';

import { logger } from '../logger.js';

/**
 * Generate a trace ID for error tracking
 */
function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Express error handler middleware
 */
export function errorHandler(
  err: Error | AppError | unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const traceId = generateTraceId();

  // Log the error
  logger.error('Request error', {
    traceId,
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });

  // Handle AppErrors (our standardized errors)
  if (isAppError(err)) {
    res.status(err.status || 500).json({
      error: {
        code: err.code,
        message: err.message,
        status: err.status,
        timestamp: new Date().toISOString(),
        traceId,
        details: err.details,
        path: req.path,
      },
    });
    return;
  }

  // Handle standard Error objects
  if (err instanceof Error) {
    // Map common error types
    if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
      const timeoutError = Errors.llmTimeout(traceId);
      res.status(timeoutError.status).json(timeoutError.toJSON());
      return;
    }

    if (err.message.includes('ENOENT') || err.message.includes('not found')) {
      const notFoundError = Errors.notFound('Resource', traceId);
      res.status(notFoundError.status).json(notFoundError.toJSON());
      return;
    }

    // Generic server error
    const serverError = Errors.serverError(err.message, traceId);
    res.status(serverError.status).json(serverError.toJSON());
    return;
  }

  // Unknown error type
  const unknownError = Errors.serverError('An unexpected error occurred', traceId);
  res.status(500).json(unknownError.toJSON());
}

/**
 * Async handler wrapper - catches errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request validation middleware factory
 */
export function validateRequest<T>(
  schema: { parse: (data: unknown) => T },
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[source]);
      // Store validated data
      (req as unknown as Record<string, unknown>)[`validated${source.charAt(0).toUpperCase()}${source.slice(1)}`] = data;
      next();
    } catch (error) {
      const traceId = generateTraceId();
      const validationError = Errors.validationError(
        'request',
        error instanceof Error ? error.message : 'Invalid request data',
        traceId
      );
      res.status(validationError.status).json(validationError.toJSON());
    }
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const traceId = generateTraceId();
  const error = Errors.notFound(`Route ${req.method} ${req.path}`, traceId);
  res.status(error.status).json(error.toJSON());
}
