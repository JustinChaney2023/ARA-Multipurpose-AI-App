/**
 * Centralized Configuration Management
 * All configuration in one place with schema validation
 */

import { z } from 'zod';
import { logger } from '../logger.js';

// ============================================================================
// Configuration Schema
// ============================================================================

const ConfigSchema = z.object({
  // Server settings
  server: z.object({
    port: z.number().default(3001),
    host: z.string().default('0.0.0.0'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),

  // Ollama / LLM settings
  ollama: z.object({
    baseUrl: z.string().url().default('http://localhost:11434'),
    model: z.string().default('qwen2.5:0.5b'),
    timeout: z.number().default(120000), // 120s default
    visionTimeout: z.number().default(180000), // 3min for vision
    maxRetries: z.number().default(2),
    temperature: z.number().default(0.1),
    numCtx: z.number().default(4096),
    disabled: z.boolean().default(false),
  }),

  // OCR settings
  ocr: z.object({
    confidenceThreshold: z.number().default(50),
    maxFileSize: z.number().default(50 * 1024 * 1024), // 50MB
    allowedTypes: z.array(z.string()).default([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ]),
    tesseractLangPath: z.string().optional(),
    pdfDensity: z.number().default(300),
  }),

  // File upload settings
  upload: z.object({
    maxFiles: z.number().default(10),
    cleanupInterval: z.number().default(300000), // 5 minutes
    tempDir: z.string().default('uploads'),
  }),

  // Progress tracking
  progress: z.object({
    ttl: z.number().default(300000), // 5 minutes
    cleanupInterval: z.number().default(60000), // 1 minute
  }),

  // Model warmup settings
  warmup: z.object({
    enabled: z.boolean().default(true),
    keepAliveInterval: z.number().default(60000), // 1 minute
    initialDelay: z.number().default(1000), // 1 second after startup
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Configuration Loader
// ============================================================================

function loadConfig(): Config {
  const rawConfig = {
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      host: process.env.HOST,
      logLevel: process.env.LOG_LEVEL,
    },
    ollama: {
      baseUrl: process.env.OLLAMA_URL,
      model: process.env.OLLAMA_MODEL,
      timeout: process.env.OLLAMA_TIMEOUT ? parseInt(process.env.OLLAMA_TIMEOUT, 10) : undefined,
      visionTimeout: process.env.OLLAMA_VISION_TIMEOUT ? parseInt(process.env.OLLAMA_VISION_TIMEOUT, 10) : undefined,
      maxRetries: process.env.OLLAMA_MAX_RETRIES ? parseInt(process.env.OLLAMA_MAX_RETRIES, 10) : undefined,
      temperature: process.env.OLLAMA_TEMPERATURE ? parseFloat(process.env.OLLAMA_TEMPERATURE) : undefined,
      numCtx: process.env.OLLAMA_NUM_CTX ? parseInt(process.env.OLLAMA_NUM_CTX, 10) : undefined,
      disabled: process.env.DISABLE_LLM === 'true',
    },
    ocr: {
      confidenceThreshold: process.env.OCR_CONFIDENCE_THRESHOLD
        ? parseInt(process.env.OCR_CONFIDENCE_THRESHOLD, 10)
        : undefined,
      maxFileSize: process.env.MAX_FILE_SIZE
        ? parseInt(process.env.MAX_FILE_SIZE, 10)
        : undefined,
      tesseractLangPath: process.env.TESSERACT_LANG_PATH,
      pdfDensity: process.env.PDF_DENSITY ? parseInt(process.env.PDF_DENSITY, 10) : undefined,
    },
    upload: {
      maxFiles: process.env.UPLOAD_MAX_FILES ? parseInt(process.env.UPLOAD_MAX_FILES, 10) : undefined,
      cleanupInterval: process.env.UPLOAD_CLEANUP_INTERVAL
        ? parseInt(process.env.UPLOAD_CLEANUP_INTERVAL, 10)
        : undefined,
      tempDir: process.env.UPLOAD_TEMP_DIR,
    },
    progress: {
      ttl: process.env.PROGRESS_TTL ? parseInt(process.env.PROGRESS_TTL, 10) : undefined,
      cleanupInterval: process.env.PROGRESS_CLEANUP_INTERVAL
        ? parseInt(process.env.PROGRESS_CLEANUP_INTERVAL, 10)
        : undefined,
    },
    warmup: {
      enabled: process.env.DISABLE_WARMUP !== 'true',
      keepAliveInterval: process.env.WARMUP_KEEP_ALIVE
        ? parseInt(process.env.WARMUP_KEEP_ALIVE, 10)
        : undefined,
      initialDelay: process.env.WARMUP_INITIAL_DELAY
        ? parseInt(process.env.WARMUP_INITIAL_DELAY, 10)
        : undefined,
    },
  };

  // Remove undefined values for cleaner merge
  const cleanConfig = JSON.parse(JSON.stringify(rawConfig));

  const result = ConfigSchema.safeParse(cleanConfig);

  if (!result.success) {
    logger.error('Configuration validation failed', { errors: result.error.errors });
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  return result.data;
}

// ============================================================================
// Exported Config
// ============================================================================

export const config = loadConfig();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a formatted config summary for logging
 */
export function getConfigSummary(): Record<string, unknown> {
  return {
    server: {
      port: config.server.port,
      logLevel: config.server.logLevel,
    },
    ollama: {
      baseUrl: config.ollama.baseUrl,
      model: config.ollama.model,
      disabled: config.ollama.disabled,
    },
    ocr: {
      confidenceThreshold: config.ocr.confidenceThreshold,
      maxFileSizeMB: Math.round(config.ocr.maxFileSize / 1024 / 1024),
    },
    upload: {
      maxFiles: config.upload.maxFiles,
      tempDir: config.upload.tempDir,
    },
  };
}

/**
 * Log current configuration
 */
export function logConfig(): void {
  logger.info('Configuration loaded', getConfigSummary());
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof Config): boolean {
  switch (feature) {
    case 'ollama':
      return !config.ollama.disabled;
    case 'warmup':
      return config.warmup.enabled;
    default:
      return true;
  }
}

/**
 * Get environment info
 */
export function getEnvironmentInfo(): Record<string, string> {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };
}
