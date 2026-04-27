/**
 * Model warmup module - Preloads the AI model to reduce latency on first request
 */

import { config } from './config/index.js';
import { logger } from './logger.js';
import { 
  DEFAULT_MODEL, 
  OLLAMA_BASE_URL, 
  WARMUP_PROMPT, 
  getModelOptions 
} from './modelConfig.js';

let isModelWarmedUp = false;
let warmupPromise: Promise<void> | null = null;

/**
 * Check if model is already warmed up
 */
export function isWarmedUp(): boolean {
  return isModelWarmedUp;
}

/**
 * Warm up the model by running a simple inference
 * This loads the model into memory so subsequent requests are fast
 */
export async function warmupModel(): Promise<void> {
  if (!config.warmup.enabled) {
    logger.info('[WARMUP] Warmup disabled by configuration');
    return;
  }

  if (isModelWarmedUp) {
    return;
  }

  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = performWarmup();
  return warmupPromise;
}

async function performWarmup(): Promise<void> {
  logger.info('[WARMUP] Starting model warmup...');
  const startTime = Date.now();

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt: WARMUP_PROMPT,
        stream: false,
        options: {
          ...getModelOptions(),
          num_predict: 10,
        },
      }),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      throw new Error(`Warmup failed: ${response.status}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`[WARMUP] Model warmed up successfully in ${duration}ms`);
    isModelWarmedUp = true;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[WARMUP] Model warmup failed:', { error: errorMessage });
  } finally {
    warmupPromise = null;
  }
}

// Track if model is currently processing a request
let isModelBusy = false;

/**
 * Mark model as busy (processing a request)
 */
export function setModelBusy(busy: boolean): void {
  isModelBusy = busy;
}

/**
 * Keep the model alive by periodically pinging it
 */
export function startKeepAlive(intervalMs?: number): () => void {
  const actualInterval = intervalMs || config.warmup.keepAliveInterval;
  logger.info(`[KEEPALIVE] Starting keep-alive pings every ${actualInterval}ms`);
  
  const interval = setInterval(async () => {
    if (!isModelWarmedUp) {
      return;
    }
    
    if (isModelBusy) {
      logger.debug('[KEEPALIVE] Skipping ping - model is busy');
      return;
    }

    try {
      await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          prompt: 'ping',
          stream: false,
          options: {
            temperature: 0,
            num_predict: 1,
            num_ctx: 512,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      logger.debug('[KEEPALIVE] Ping successful');
    } catch (error) {
      logger.debug('[KEEPALIVE] Ping failed (model may be busy or loading)');
    }
  }, actualInterval);

  return () => {
    clearInterval(interval);
    logger.info('[KEEPALIVE] Stopped keep-alive pings');
  };
}

/**
 * Trigger warmup in the background
 * Non-blocking - returns immediately
 */
export function triggerBackgroundWarmup(): void {
  if (!config.warmup.enabled) {
    return;
  }
  
  logger.info('[WARMUP] Triggering background warmup...');
  
  setTimeout(() => {
    warmupModel().catch(() => {
      // Error already logged in performWarmup
    });
  }, config.warmup.initialDelay);
}
