/**
 * Input Validation Middleware
 * Zod-based validation for all API endpoints
 */

import { Errors, DateTimeUtils } from '@ara/shared';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { logger } from '../logger.js';

// ============================================================================
// Request Schemas
// ============================================================================

export const ExtractPDFSchema = z.object({
  file: z.instanceof(Buffer).or(z.any()).optional(),
});

export const ExtractFillSchema = z.object({
  rawText: z.string().min(1, 'Text is required').max(50000, 'Text too long (max 50KB)'),
});


// Helper to normalize dates in form data
function normalizeFormDates(form: any): any {
  if (!form || typeof form !== 'object') return form;
  
  const normalized = { ...form };
  
  // Normalize header dates
  if (normalized.header) {
    normalized.header = { ...normalized.header };
    if (normalized.header.date) {
      normalized.header.date = DateTimeUtils.normalizeDate(normalized.header.date);
    }
    if (normalized.header.dob) {
      normalized.header.dob = DateTimeUtils.normalizeDate(normalized.header.dob);
    }
    if (normalized.header.time) {
      normalized.header.time = DateTimeUtils.normalizeTime(normalized.header.time);
    }
  }
  
  // Normalize signature date
  if (normalized.signature?.dateSigned) {
    normalized.signature = { ...normalized.signature };
    normalized.signature.dateSigned = DateTimeUtils.normalizeDate(normalized.signature.dateSigned);
  }
  
  return normalized;
}

export const ExportPDFSchema = z.object({
  form: z.preprocess(
    normalizeFormDates,
    z.object({
      header: z.object({
        recipientName: z.string().min(1, 'Recipient name is required'),
        date: z.string().min(1, 'Date is required'),
        time: z.string().optional(),
        recipientIdentifier: z.string().optional(),
        dob: z.string().optional(),
        location: z.string().optional(),
      }),
      careCoordinationType: z.object({
        sih: z.boolean(),
        hcbw: z.boolean(),
      }),
      narrative: z.object({
        recipientAndVisitObservations: z.string(),
        healthEmotionalStatus: z.string(),
        reviewOfServices: z.string(),
        progressTowardGoals: z.string(),
        additionalNotes: z.string(),
        followUpTasks: z.string(),
      }),
      signature: z.object({
        careCoordinatorName: z.string().optional(),
        signature: z.string().optional(),
        dateSigned: z.string().optional(),
      }),
    })
  ),
});

export const SummarizeSchema = z.object({
  text: z.string().min(1, 'Text is required').max(50000, 'Text too long'),
  patientId: z.number().int().positive().optional(),
});

export const ValidateFormSchema = z.object({
  form: z.record(z.any()),
});

export const FormatFieldSchema = z.object({
  value: z.string(),
  type: z.enum(['date', 'time']),
});

// ============================================================================
// Patient / Folder / Session / Summary CRUD Schemas (Phase 3)
// ============================================================================

export const CreatePatientSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(200, 'Display name too long'),
});

export const UpdatePatientSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(200, 'Display name too long'),
});

export const CreateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(200, 'Folder name too long'),
});

export const UpdateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(200, 'Folder name too long'),
});

export const LinkPatientFolderSchema = z.object({
  folderId: z.number().int().positive('Folder ID must be a positive integer'),
});

export const CreateSessionSchema = z.object({
  patientId: z.number().int().positive('Patient ID is required'),
  source: z.enum(['text', 'ocr', 'audio']),
  rawText: z.string().min(1, 'Raw text is required').max(50000, 'Raw text too long'),
});

export const MigrateLocalStorageSchema = z.object({
  items: z.array(
    z.object({
      rawText: z.string().min(1),
      summary: z.string().optional(),
      timestamp: z.number().optional(),
      source: z.string().optional(),
    })
  ).max(100, 'Too many items to migrate at once'),
});

// ============================================================================
// RAG Schemas (Phase 4)
// ============================================================================

export const EmbedSchema = z.object({
  text: z.string().min(1).max(10000, 'Text too long for embedding'),
});

export const RagQuerySchema = z.object({
  patientId: z.number().int().positive(),
  query: z.string().min(1).max(10000),
  k: z.number().int().min(1).max(10).default(3),
});

export const CreateChatTurnSchema = z.object({
  patientId: z.number().int().positive('Patient ID is required'),
  role: z.enum(['user', 'assistant']),
  body: z.string().min(1).max(10000, 'Message too long'),
});

// ============================================================================
// File Upload Validation
// ============================================================================

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFileUpload(
  file: Express.Multer.File | undefined
): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.mimetype}. Allowed: PDF, PNG, JPEG, WebP, TIFF`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${formatBytes(file.size)}. Max: ${formatBytes(MAX_FILE_SIZE)}`,
    };
  }

  return { valid: true };
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// ============================================================================
// Validation Middleware Factory
// ============================================================================

export function validateRequest<T extends z.ZodTypeAny>(
  schema: T,
  source: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const issues = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      logger.warn('Validation failed', {
        path: req.path,
        issues,
      });

      const error = Errors.validationError(
        issues[0]?.path || 'request',
        issues.map(i => `${i.path}: ${i.message}`).join(', ')
      );

      res.status(400).json({
        error: {
          code: error.code,
          message: 'Validation failed',
          status: 400,
          details: { issues },
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Store validated data
    req.validatedBody = result.data as z.infer<T>;
    next();
  };
}

// ============================================================================
// File Upload Middleware
// ============================================================================

export function validateFileRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = validateFileUpload(req.file);

  if (!result.valid) {
    logger.warn('File validation failed', {
      path: req.path,
      error: result.error,
    });

    const error = Errors.invalidInput(result.error || 'Invalid file');
    res.status(400).json(error.toJSON());
    return;
  }

  next();
}

// ============================================================================
// Sanitization Middleware
// ============================================================================

// Simple XSS prevention
function sanitizeString(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function sanitizeRequest(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Sanitize query parameters
  if (req.query) {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        req.query[key] = sanitizeString(value);
      }
    }
  }

  // Note: Body sanitization should be done carefully
  // to avoid breaking valid content like narrative text
  // We rely on Zod validation and output encoding instead

  next();
}

// ============================================================================
// Type Augmentation
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      validatedBody?: unknown;
    }
  }
}

export { z };
