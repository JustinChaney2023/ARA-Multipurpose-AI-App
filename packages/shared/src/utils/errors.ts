/**
 * Standardized Error Handling (RFC 7807 Problem Details inspired)
 * Consistent error format across frontend and backend
 */

export type ErrorCode =
  | 'EXTRACTION_FAILED'
  | 'OCR_FAILED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'PDF_GENERATION_FAILED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR';

export interface AppErrorDetails {
  field?: string;
  expected?: unknown;
  actual?: unknown;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: AppErrorDetails;
  public readonly timestamp: string;
  public readonly traceId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    status: number = 500,
    details?: AppErrorDetails,
    traceId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.traceId = traceId;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.status,
        timestamp: this.timestamp,
        traceId: this.traceId,
        details: this.details,
      },
    };
  }

  /**
   * Create error from JSON (for frontend deserialization)
   */
  static fromJSON(json: unknown): AppError {
    if (typeof json !== 'object' || json === null) {
      return new AppError('SERVER_ERROR', 'Unknown error', 500);
    }

    const err = (json as Record<string, unknown>).error;
    if (!err || typeof err !== 'object') {
      return new AppError('SERVER_ERROR', 'Unknown error', 500);
    }

    return new AppError(
      ((err as Record<string, unknown>).code as ErrorCode) || 'SERVER_ERROR',
      ((err as Record<string, unknown>).message as string) || 'Unknown error',
      ((err as Record<string, unknown>).status as number) || 500,
      (err as Record<string, unknown>).details as AppErrorDetails,
      (err as Record<string, unknown>).traceId as string
    );
  }
}

/**
 * Predefined error factories for common cases
 */
export const Errors = {
  extractionFailed: (message: string, details?: AppErrorDetails, traceId?: string) =>
    new AppError('EXTRACTION_FAILED', message, 500, details, traceId),

  ocrFailed: (message: string, details?: AppErrorDetails, traceId?: string) =>
    new AppError('OCR_FAILED', message, 500, details, traceId),

  llmUnavailable: (traceId?: string) =>
    new AppError(
      'LLM_UNAVAILABLE',
      'AI service is currently unavailable. Using fallback extraction.',
      503,
      undefined,
      traceId
    ),

  llmTimeout: (traceId?: string) =>
    new AppError(
      'LLM_TIMEOUT',
      'AI request timed out. Please try again or use text input.',
      504,
      undefined,
      traceId
    ),

  validationError: (field: string, message: string, traceId?: string) =>
    new AppError('VALIDATION_ERROR', message, 400, { field }, traceId),

  invalidInput: (message: string, details?: AppErrorDetails, traceId?: string) =>
    new AppError('INVALID_INPUT', message, 400, details, traceId),

  notFound: (resource: string, traceId?: string) =>
    new AppError('NOT_FOUND', `${resource} not found`, 404, { resource }, traceId),

  fileTooLarge: (maxSize: string, traceId?: string) =>
    new AppError(
      'FILE_TOO_LARGE',
      `File exceeds maximum size of ${maxSize}`,
      413,
      { maxSize },
      traceId
    ),

  unsupportedFileType: (type: string, traceId?: string) =>
    new AppError('UNSUPPORTED_FILE_TYPE', `Unsupported file type: ${type}`, 415, { type }, traceId),

  pdfGenerationFailed: (message: string, traceId?: string) =>
    new AppError('PDF_GENERATION_FAILED', message, 500, undefined, traceId),

  serverError: (message: string = 'Internal server error', traceId?: string) =>
    new AppError('SERVER_ERROR', message, 500, undefined, traceId),

  networkError: (message: string = 'Network error', traceId?: string) =>
    new AppError('NETWORK_ERROR', message, 0, undefined, traceId),
};

/**
 * Type guard for AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof AppError ||
    (typeof error === 'object' && error !== null && 'code' in error && 'status' in error)
  );
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Safely extract error code from unknown error
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (isAppError(error)) {
    return error.code;
  }
  return 'SERVER_ERROR';
}
