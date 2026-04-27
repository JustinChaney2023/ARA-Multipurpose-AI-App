/**
 * Graceful Shutdown Handler
 * Ensures clean shutdown with proper cleanup
 */

import type { Server } from 'http';

import { logger } from '../logger.js';

interface ShutdownOptions {
  timeoutMs: number;
  onShutdown?: () => Promise<void> | void;
}

interface ActiveRequest {
  id: string;
  path: string;
  startTime: number;
}

class GracefulShutdownManager {
  private activeRequests = new Map<string, ActiveRequest>();
  private shuttingDown = false;
  private server?: Server;

  constructor(private options: ShutdownOptions) {}

  setServer(server: Server): void {
    this.server = server;
  }

  trackRequest(id: string, path: string): () => void {
    if (this.shuttingDown) {
      throw new Error('Server is shutting down');
    }

    this.activeRequests.set(id, {
      id,
      path,
      startTime: Date.now(),
    });

    return () => {
      this.activeRequests.delete(id);
    };
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    logger.info('Graceful shutdown initiated');

    // Stop accepting new connections
    if (this.server) {
      this.server.close(() => {
        logger.info('Server stopped accepting new connections');
      });
    }

    // Wait for active requests to complete
    const startTime = Date.now();
    while (this.activeRequests.size > 0) {
      const elapsed = Date.now() - startTime;
      const remaining = this.options.timeoutMs - elapsed;

      if (remaining <= 0) {
        logger.warn(
          `Shutdown timeout reached. ${this.activeRequests.size} requests forcefully terminated`,
          {
            requests: Array.from(this.activeRequests.values()).map(r => r.path),
          }
        );
        break;
      }

      logger.info(`Waiting for ${this.activeRequests.size} active requests to complete...`, {
        requests: Array.from(this.activeRequests.values()).map(r => ({
          path: r.path,
          duration: `${Date.now() - r.startTime}ms`,
        })),
      });

      await sleep(Math.min(1000, remaining));
    }

    // Run cleanup
    if (this.options.onShutdown) {
      try {
        await this.options.onShutdown();
        logger.info('Shutdown cleanup completed');
      } catch (error) {
        logger.error('Shutdown cleanup failed', { error });
      }
    }

    logger.info('Graceful shutdown complete');
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  getActiveRequests(): ActiveRequest[] {
    return Array.from(this.activeRequests.values());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global instance
let shutdownManager = new GracefulShutdownManager({
  timeoutMs: 30000, // 30 seconds
});

// ============================================================================
// Middleware
// ============================================================================

export function requestTracking(req: any, res: any, next: any): void {
  if (shutdownManager.isShuttingDown()) {
    res.status(503).json({
      error: {
        code: 'SHUTTING_DOWN',
        message: 'Server is shutting down',
        status: 503,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const cleanup = shutdownManager.trackRequest(requestId, req.path);

  res.on('finish', cleanup);
  res.on('close', cleanup);

  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  next();
}

// ============================================================================
// Signal Handlers
// ============================================================================

export function setupGracefulShutdown(
  server: Server,
  onShutdown?: () => Promise<void> | void
): () => Promise<void> {
  shutdownManager.setServer(server);

  if (onShutdown) {
    const newManager = new GracefulShutdownManager({
      timeoutMs: 30000,
      onShutdown,
    });
    newManager.setServer(server);
    shutdownManager = newManager;
  }

  const shutdownHandler = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    await shutdownManager.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', error => {
    logger.error('Uncaught exception', { error });
    shutdownHandler('uncaughtException').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
  });

  return () => shutdownManager.shutdown();
}

export { shutdownManager, GracefulShutdownManager };
