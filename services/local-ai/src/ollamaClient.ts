/**
 * Optimized Ollama Client with Connection Pooling and Response Caching
 * 
 * Features:
 * - HTTP connection pooling for faster repeated requests
 * - Response caching for similar prompts
 * - GPU layer auto-detection
 * - Streaming support
 * - Request retry with exponential backoff
 */

import { config } from './config/index.js';
import { logger } from './logger.js';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface OllamaRequest {
  model: string;
  prompt?: string;
  system?: string;
  images?: string[];
  stream?: boolean;
  options?: Record<string, unknown>;
}

interface OllamaResponse {
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface CacheEntry {
  response: string;
  timestamp: number;
  hitCount: number;
}

interface GPUInfo {
  available: boolean;
  vramGB: number;
  name?: string;
  recommendedLayers: number;
}

// ============================================================================
// Response Cache
// ============================================================================

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];

  get(key: string): string | null {
    if (!config.ollama.cache.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > config.ollama.cache.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return null;
    }

    // Update hit count and access order
    entry.hitCount++;
    this.updateAccessOrder(key);
    
    logger.debug('Cache hit', { key: key.substring(0, 16) + '...', hits: entry.hitCount });
    return entry.response;
  }

  set(key: string, response: string): void {
    if (!config.ollama.cache.enabled) return;

    // Evict oldest if at capacity
    if (this.cache.size >= config.ollama.cache.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hitCount: 0,
    });
    this.accessOrder.push(key);

    logger.debug('Cache set', { key: key.substring(0, 16) + '...', size: this.cache.size });
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.debug('Cache cleared');
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    let totalHits = 0;
    let totalRequests = 0;
    
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
      totalRequests += entry.hitCount + 1;
    }

    return {
      size: this.cache.size,
      maxSize: config.ollama.cache.maxSize,
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
    };
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
      logger.debug('Cache eviction', { key: oldest.substring(0, 16) + '...' });
    }
  }
}

// ============================================================================
// GPU Detection
// ============================================================================

async function detectGPU(): Promise<GPUInfo> {
  // Default: no GPU
  const defaultInfo: GPUInfo = {
    available: false,
    vramGB: 0,
    recommendedLayers: 0,
  };

  if (!config.ollama.gpu.enabled) {
    return defaultInfo;
  }

  try {
    // Check Ollama's GPU detection via /api/tags or ps
    const response = await fetch(`${config.ollama.baseUrl}/api/ps`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return defaultInfo;
    }

    const data = await response.json() as { models?: Array<{ size?: number; name?: string }> };
    
    // If Ollama has models loaded, it detected a GPU
    if (data.models && data.models.length > 0) {
      // Estimate VRAM from loaded model sizes
      let totalSize = 0;
      for (const model of data.models) {
        totalSize += model.size || 0;
      }
      
      // Rough estimate: if models are loaded, assume at least 4GB VRAM
      const vramGB = Math.max(4, Math.ceil(totalSize / (1024 * 1024 * 1024)));
      
      return {
        available: true,
        vramGB,
        recommendedLayers: -1, // Let Ollama decide
      };
    }

    return defaultInfo;
  } catch {
    return defaultInfo;
  }
}

function calculateGpuLayers(vramGB: number, modelSizeGB: number): number {
  // Rough heuristic: ~100MB per layer for 4B models, ~200MB for 7B, etc.
  // Leave 1GB headroom for other operations
  const availableVRAM = (vramGB - 1) * 1024; // Convert to MB
  const mbPerLayer = modelSizeGB < 5 ? 100 : modelSizeGB < 10 ? 200 : 300;
  
  return Math.floor(availableVRAM / mbPerLayer);
}

// ============================================================================
// HTTP Agent with Connection Pooling
// ============================================================================

class ConnectionPool {
  private agent: { destroy: () => void } | null = null;
  private isNode18Plus = parseInt(process.version.slice(1).split('.')[0] || '0', 10) >= 18;

  async getFetchOptions(): Promise<RequestInit> {
    const options: RequestInit = {};

    if (config.ollama.pool.enabled && this.isNode18Plus) {
      // Node 18+ fetch supports keep-alive via dispatcher (undici)
      // We'll use standard fetch with keepalive flag
      options.keepalive = config.ollama.pool.keepAlive;
    }

    return options;
  }

  destroy(): void {
    if (this.agent) {
      this.agent.destroy();
      this.agent = null;
    }
  }
}

// ============================================================================
// Optimized Ollama Client
// ============================================================================

export class OllamaClient {
  private cache: ResponseCache;
  private pool: ConnectionPool;
  private gpuInfo: GPUInfo | null = null;

  constructor() {
    this.cache = new ResponseCache();
    this.pool = new ConnectionPool();
    this.initializeGPU();
  }

  private async initializeGPU(): Promise<void> {
    this.gpuInfo = await detectGPU();
    
    if (this.gpuInfo.available) {
      logger.info('GPU detected for Ollama', {
        vramGB: this.gpuInfo.vramGB,
        recommendedLayers: this.gpuInfo.recommendedLayers,
      });
    } else {
      logger.info('No GPU detected, using CPU inference');
    }
  }

  /**
   * Generate text with caching and retry logic
   */
  async generate(
    request: OllamaRequest,
    options: { 
      useCache?: boolean; 
      timeout?: number;
      stream?: boolean;
      onStream?: (chunk: string) => void;
    } = {}
  ): Promise<OllamaResponse> {
    const { useCache = true, timeout = config.ollama.timeout, stream = false } = options;
    
    // Build cache key from request
    const cacheKey = useCache ? this.buildCacheKey(request) : null;
    
    // Check cache
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          response: cached,
          done: true,
        };
      }
    }

    // Build optimized request with GPU settings
    const optimizedRequest = this.buildOptimizedRequest(request);

    // Execute with retry logic
    let lastError: Error | null = null;
    const maxRetries = config.ollama.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(optimizedRequest, timeout, stream, options.onStream);
        
        // Cache successful response
        if (cacheKey && !stream) {
          this.cache.set(cacheKey, response.response);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
          logger.warn(`Ollama request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, {
            error: lastError.message,
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Ollama request failed after retries');
  }

  /**
   * Check if Ollama is healthy and get GPU status
   */
  async healthCheck(): Promise<{ healthy: boolean; gpu: GPUInfo; cached: boolean }> {
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return {
        healthy: response.ok,
        gpu: this.gpuInfo || { available: false, vramGB: 0, recommendedLayers: 0 },
        cached: config.ollama.cache.enabled,
      };
    } catch {
      return {
        healthy: false,
        gpu: this.gpuInfo || { available: false, vramGB: 0, recommendedLayers: 0 },
        cached: config.ollama.cache.enabled,
      };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return this.cache.getStats();
  }

  /**
   * Clear response cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Destroy connection pool
   */
  destroy(): void {
    this.pool.destroy();
  }

  private buildCacheKey(request: OllamaRequest): string {
    // Normalize prompt for caching (remove extra whitespace)
    const normalizedPrompt = (request.prompt || '').trim().replace(/\s+/g, ' ');
    const normalizedSystem = (request.system || '').trim().replace(/\s+/g, ' ');
    
    // Hash image content (not just count) so identical images get cache hits
    const imageHash = request.images && request.images.length > 0
      ? crypto.createHash('sha256').update(request.images.join('')).digest('hex').substring(0, 16)
      : null;

    const keyData = {
      model: request.model,
      prompt: normalizedPrompt,
      system: normalizedSystem,
      imageHash,
    };

    return crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  }

  private buildOptimizedRequest(request: OllamaRequest): OllamaRequest {
    const numGpuLayers = config.ollama.gpu.numGpuLayers === -1 
      ? (this.gpuInfo?.recommendedLayers || 0)
      : config.ollama.gpu.numGpuLayers;

    return {
      ...request,
      options: {
        ...request.options,
        // GPU settings
        num_gpu: numGpuLayers,
        main_gpu: config.ollama.gpu.mainGpu,
        ...(config.ollama.gpu.tensorSplit && { tensor_split: config.ollama.gpu.tensorSplit }),
        
        // Performance settings from config
        num_thread: config.ollama.performance.numThread,
        num_batch: config.ollama.performance.numBatch,
        num_predict: request.options?.num_predict || config.ollama.performance.numPredict,
        top_p: config.ollama.performance.topP,
        top_k: config.ollama.performance.topK,
        repeat_penalty: config.ollama.performance.repeatPenalty,
        frequency_penalty: config.ollama.performance.frequencyPenalty,
        presence_penalty: config.ollama.performance.presencePenalty,
        
        // Keep model loaded
        keep_alive: '10m',
      },
    };
  }

  private async executeRequest(
    request: OllamaRequest, 
    timeout: number,
    stream: boolean,
    onStream?: (chunk: string) => void
  ): Promise<OllamaResponse> {
    const poolOptions = await this.pool.getFetchOptions();
    
    const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, stream }),
      signal: AbortSignal.timeout(timeout),
      ...poolOptions,
    });

    if (!response.ok) {
      const rawError = await response.text();
      const safeError = rawError.substring(0, 200).replace(/\n/g, ' ');
      throw new Error(`Ollama request failed: ${response.status} ${safeError}`);
    }

    if (stream && onStream) {
      return this.handleStreamingResponse(response, onStream);
    }

    return response.json() as Promise<OllamaResponse>;
  }

  private async handleStreamingResponse(
    response: Response, 
    onStream: (chunk: string) => void
  ): Promise<OllamaResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    let fullResponse = '';
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as OllamaResponse;
            if (data.response) {
              fullResponse += data.response;
              onStream(data.response);
            }
            if (data.done) {
              return { ...data, response: fullResponse };
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { response: fullResponse, done: true };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let client: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!client) {
    client = new OllamaClient();
  }
  return client;
}

export function resetOllamaClient(): void {
  if (client) {
    client.destroy();
    client = null;
  }
}

// Export types
export type { OllamaRequest, OllamaResponse, GPUInfo };
