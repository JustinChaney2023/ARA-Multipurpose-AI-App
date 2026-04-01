/**
 * Model Configuration for Qwen3-4B-Q4_K_M
 * 
 * Model specs:
 * - Model: Qwen3-4B
 * - Quantization: Q4_K_M (4-bit, medium quality)
 * - Size: ~2.3GB
 * - Context: 32K tokens (use 8K for form filling)
 * - VRAM required: ~3GB
 * 
 * To download:
 *   ollama pull qwen3:4b-q4_K_M
 * 
 * Or create a Modelfile:
 *   FROM qwen3:4b
 *   PARAMETER quantization Q4_K_M
 */

import { config } from './config/index.js';

// Re-export from centralized config for backward compatibility
export const DEFAULT_MODEL = config.ollama.model;
export const OLLAMA_BASE_URL = config.ollama.baseUrl;

// Legacy constants (now sourced from config)
export const MODEL_CONTEXT_LENGTH = config.ollama.numCtx;
export const MODEL_TEMPERATURE = config.ollama.temperature;
export const MODEL_MAX_TOKENS = 1500;

// Generation options optimized for Qwen3-4B-Q4_K_M
export const getModelOptions = (isVision: boolean = false) => ({
  temperature: config.ollama.temperature,
  num_predict: MODEL_MAX_TOKENS,
  num_ctx: config.ollama.numCtx,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.0,
  keep_alive: "10m",
  num_thread: 0,
  num_gpu: 0,
  num_batch: 512,
});

// Build prompt for Ollama API
export const buildQwen3Prompt = (systemPrompt: string, userPrompt: string): string => {
  return `${systemPrompt}

User: ${userPrompt}

Assistant:`;
};

// Check if model is available
export async function checkModelAvailable(modelName: string = config.ollama.model): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    const models = data.models?.map((m: { name: string }) => m.name) || [];
    
    return models.some((m: string) => 
      m === modelName || 
      m === 'qwen3:4b' ||
      m === 'qwen3:4b-q4_K_M'
    );
  } catch {
    return false;
  }
}

// Warmup prompt for Qwen3
export const WARMUP_PROMPT = 'Hi';

// System prompts for different tasks
export const SYSTEM_PROMPTS = {
  formFilling: `You are a professional care coordinator assistant. Your task is to read caregiver notes and extract structured form data accurately. 

Rules:
1. Answer based ONLY on the provided transcript
2. Use empty string "" for information not found
3. Be concise but complete in narrative fields
4. Format dates as MM/DD/YYYY
5. Return valid JSON only`,

  questionAnswering: `You are a care coordinator assistant. Read the transcript carefully and answer the specific question.

Guidelines:
1. Answer based ONLY on the transcript
2. If not found, respond with "NOT_FOUND"
3. Be concise and factual
4. For checkboxes: answer "true" or "false"
5. Format dates as MM/DD/YYYY

Respond in this format:
ANSWER: [your answer or NOT_FOUND]
CONFIDENCE: [high/medium/low]
REASON: [brief reason]`,

  summarization: `You are a care coordinator assistant. Summarize caregiver notes for the care team.

Provide:
1. Brief overall summary (2-4 sentences)
2. Key points or important details
3. Any concerns that need attention
4. Follow-up actions needed

Be professional and concise.`,
};
