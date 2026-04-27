/**
 * Optimized Ollama Client with Connection Pooling
 *
 * Features:
 * - HTTP connection pooling for faster repeated requests
 * - GPU layer auto-detection
 * - Streaming support
 * - Request retry with exponential backoff
 */

import { config } from './config/index.js';
import { logger } from './logger.js';

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
  // qwen3 and other reasoning-capable models default to emitting a <think>
  // block before the answer. On CPU that roughly doubles latency for no
  // user-visible benefit when we want fast structured output. Pass think:false
  // to skip the reasoning phase entirely.
  think?: boolean;
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

interface OllamaEmbedResponse {
  embedding: number[];
}

interface GPUInfo {
  available: boolean;
  vramGB: number;
  name?: string;
  recommendedLayers: number;
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
    // Check Ollama's GPU detection via /api/ps
    const response = await fetch(`${config.ollama.baseUrl}/api/ps`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return defaultInfo;
    }

    const data = await response.json() as { 
      models?: Array<{ 
        size?: number; 
        name?: string;
        details?: { 
          family?: string;
          families?: string[];
        };
      }>;
      // Ollama ps may include processor info in newer versions
      processors?: Array<{ type: string; count: number }>;
    };

    // Check if Ollama reports GPU processors
    if (data.processors && data.processors.length > 0) {
      const gpuProcessor = data.processors.find(p => 
        p.type.toLowerCase().includes('gpu') || 
        p.type.toLowerCase().includes('cuda') ||
        p.type.toLowerCase().includes('metal') ||
        p.type.toLowerCase().includes('rocm')
      );
      
      if (gpuProcessor && gpuProcessor.count > 0) {
        return {
          available: true,
          vramGB: 8, // Assume at least 8GB if GPU detected
          recommendedLayers: -1,
        };
      }
    }

    // Fallback: check if any model is loaded and whether it's using GPU
    if (data.models && data.models.length > 0) {
      // Check if loaded model reports GPU layers (Ollama includes size_vram in newer versions)
      const loadedModel = data.models[0] as { size_vram?: number; size?: number };
      if (loadedModel.size_vram && loadedModel.size_vram > 0) {
        return {
          available: true,
          vramGB: Math.round(loadedModel.size_vram / (1024 * 1024 * 1024)),
          recommendedLayers: -1,
        };
      }

      // No VRAM reported — likely CPU-only
      logger.debug('No GPU VRAM reported by Ollama, assuming CPU inference');
      return defaultInfo;
    }

    return defaultInfo;
  } catch {
    return defaultInfo;
  }
}

/**
 * Check if Ollama is running on CPU only
 * This is a best-effort check based on platform knowledge
 */
export function isCPUOnlyMode(): boolean {
  // On Windows without NVIDIA GPU, Ollama always runs on CPU
  // Intel/AMD GPUs are not supported on Windows
  if (process.platform === 'win32') {
    // Could check for CUDA DLL presence, but that's complex
    // For now, return false and let actual GPU detection handle it
    return false;
  }
  return false;
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
  private pool: ConnectionPool;
  private gpuInfo: GPUInfo | null = null;

  constructor() {
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
   * Generate text with retry logic
   */
  async generate(
    request: OllamaRequest,
    options: {
      timeout?: number;
      stream?: boolean;
      onStream?: (chunk: string) => void;
      retries?: number;
    } = {}
  ): Promise<OllamaResponse> {
    const { timeout = config.ollama.timeout, stream = false } = options;

    // Build optimized request with GPU settings
    const optimizedRequest = this.buildOptimizedRequest(request);

    // Execute with retry logic. Streaming callers can pass retries: 0 to fail
    // fast — retrying a streamed request throws away the tokens we already
    // rendered progress for, and the user sees the bar reset without warning.
    let lastError: Error | null = null;
    const maxRetries = options.retries ?? config.ollama.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(optimizedRequest, timeout, stream, options.onStream);
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
  async healthCheck(): Promise<{ healthy: boolean; gpu: GPUInfo }> {
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return {
        healthy: response.ok,
        gpu: this.gpuInfo || { available: false, vramGB: 0, recommendedLayers: 0 },
      };
    } catch {
      return {
        healthy: false,
        gpu: this.gpuInfo || { available: false, vramGB: 0, recommendedLayers: 0 },
      };
    }
  }

  /**
   * Generate an embedding vector for a piece of text.
   * Uses Ollama's /api/embeddings endpoint.
   */
  async embed(
    text: string,
    model: string,
    options: { timeout?: number; retries?: number } = {}
  ): Promise<number[]> {
    const { timeout = config.ollama.timeout, retries = config.ollama.maxRetries } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const poolOptions = await this.pool.getFetchOptions();
        const response = await fetch(`${config.ollama.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
          signal: AbortSignal.timeout(timeout),
          ...poolOptions,
        });

        if (!response.ok) {
          const rawError = await response.text();
          // 404 = model not found; don't waste time retrying.
          if (response.status === 404) {
            throw new Error(`Embedding model "${model}" not found. Run: ollama pull ${model}`);
          }
          throw new Error(`Ollama embed failed: ${response.status} ${rawError.substring(0, 200)}`);
        }

        const data = (await response.json()) as OllamaEmbedResponse;
        if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new Error('Ollama embed returned invalid embedding array');
        }
        return data.embedding;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Don't retry on model-not-found (user needs to pull it first).
        if (lastError.message.includes('not found') && lastError.message.includes('Run: ollama pull')) {
          throw lastError;
        }
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn(`Ollama embed failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms`, {
            error: lastError.message,
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Ollama embed failed after retries');
  }

  /**
   * Destroy connection pool
   */
  destroy(): void {
    this.pool.destroy();
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
    let pending = '';
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const data = JSON.parse(line) as OllamaResponse;
          if (data.response) {
            fullResponse += data.response;
            onStream(data.response);
          }
          if (data.done) {
            return { ...data, response: fullResponse };
          }
        }
      }

      const finalLine = pending.trim();
      if (finalLine) {
        const data = JSON.parse(finalLine) as OllamaResponse;
        if (data.response) {
          fullResponse += data.response;
          onStream(data.response);
        }
        if (data.done) {
          return { ...data, response: fullResponse };
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
