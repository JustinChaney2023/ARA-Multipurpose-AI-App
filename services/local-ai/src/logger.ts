/**
 * Simple logger with timestamps and levels
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function formatTime(): string {
  return new Date().toISOString().split('T')[1].split('.')[0];
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (levels[level] < levels[LOG_LEVEL]) return;
  
  const timestamp = formatTime();
  const color = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m',  // Green
    warn: '\x1b[33m',  // Yellow
    error: '\x1b[31m', // Red
  }[level];
  
  const reset = '\x1b[0m';
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}]${reset}`;
  
  if (meta) {
    console.log(`${prefix} ${message}`, meta);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};

/**
 * Progress tracker for multi-stage operations
 */
export interface ProgressTracker {
  stage: string;
  percent: number;
  message: string;
}

const progressCallbacks = new Set<(progress: ProgressTracker) => void>();

export function onProgress(callback: (progress: ProgressTracker) => void): () => void {
  progressCallbacks.add(callback);
  return () => progressCallbacks.delete(callback);
}

export function updateProgress(stage: string, percent: number, message: string): void {
  const progress = { stage, percent, message };
  logger.info(`[${stage}] ${percent}% - ${message}`);
  progressCallbacks.forEach(cb => cb(progress));
}

/**
 * Create a progress tracker for an operation
 */
export function createProgressTracker(operation: string) {
  const startTime = Date.now();
  
  return {
    start: (message: string) => {
      updateProgress(operation, 0, message);
    },
    update: (percent: number, message: string) => {
      updateProgress(operation, percent, message);
    },
    complete: (message: string) => {
      const duration = Date.now() - startTime;
      updateProgress(operation, 100, `${message} (${duration}ms)`);
    },
    error: (message: string) => {
      updateProgress(operation, 0, `ERROR: ${message}`);
    },
  };
}
