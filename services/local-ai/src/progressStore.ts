/**
 * In-memory progress store for tracking operation progress
 * Used to provide real-time progress updates to clients
 */

export interface ProgressInfo {
  operation: string;
  percent: number;
  message: string;
  timestamp: number;
  complete: boolean;
  error?: string;
}

const progressStore = new Map<string, ProgressInfo>();

/**
 * Update progress for an operation
 */
export function setProgress(operation: string, percent: number, message: string, error?: string): void {
  progressStore.set(operation, {
    operation,
    percent: Math.min(100, Math.max(0, percent)),
    message,
    timestamp: Date.now(),
    complete: percent >= 100 || !!error,
    error,
  });
}

/**
 * Get progress for an operation
 */
export function getProgress(operation: string): ProgressInfo | null {
  return progressStore.get(operation) || null;
}

/**
 * Clear old progress entries (older than 5 minutes)
 */
export function clearOldProgress(): void {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, value] of progressStore.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      progressStore.delete(key);
    }
  }
}

// Clean up old entries every minute
setInterval(clearOldProgress, 60000);
