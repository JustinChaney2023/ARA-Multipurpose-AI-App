/**
 * Model configuration for Ollama integration.
 * Primary configuration lives in config/index.ts — this file re-exports
 * convenience constants and generation option helpers used across the service.
 */

import { config } from './config/index.js';

export const DEFAULT_MODEL = config.ollama.model;
export const OLLAMA_BASE_URL = config.ollama.baseUrl;

export const MODEL_CONTEXT_LENGTH = config.ollama.numCtx;
export const MODEL_TEMPERATURE = config.ollama.temperature;
export const MODEL_MAX_TOKENS = config.ollama.performance.numPredict;

/**
 * Build Ollama generation options from centralized config.
 * GPU and threading settings are also applied by OllamaClient.buildOptimizedRequest(),
 * so only sampling/context options are set here.
 */
export const getModelOptions = (isVision: boolean = false) => ({
  temperature: config.ollama.temperature,
  num_predict: isVision ? 2000 : config.ollama.performance.numPredict,
  num_ctx: config.ollama.numCtx,
  top_p: config.ollama.performance.topP,
  top_k: config.ollama.performance.topK,
  repeat_penalty: config.ollama.performance.repeatPenalty,
  frequency_penalty: config.ollama.performance.frequencyPenalty,
  presence_penalty: config.ollama.performance.presencePenalty,
  keep_alive: '10m',
});

// Check if model is available in Ollama
export async function checkModelAvailable(
  modelName: string = config.ollama.model
): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return false;

    const data = await response.json();
    const models = data.models?.map((m: { name: string }) => m.name) || [];

    return models.some((m: string) => m === modelName || m.startsWith(modelName.split(':')[0]));
  } catch {
    return false;
  }
}

export const WARMUP_PROMPT = 'Hi';

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
