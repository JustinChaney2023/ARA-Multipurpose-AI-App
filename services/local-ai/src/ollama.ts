/**
 * Ollama integration for local LLM processing
 * Supports multimodal models for handwriting recognition
 *
 * Optimizations:
 * - Connection pooling for faster requests
 * - GPU layer auto-detection
 * - Streaming support
 * - Exponential backoff retry
 */

import fs from 'fs/promises';

import { config } from './config/index.js';
import { logger } from './logger.js';
import { getOllamaClient } from './ollamaClient.js';

// Circuit breaker: track when LLM last failed and auto-recover after a timeout
let llmFailedAt: number | null = null;
const LLM_RECOVERY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function isLLMCircuitOpen(): boolean {
  if (llmFailedAt === null) return false;
  if (Date.now() - llmFailedAt >= LLM_RECOVERY_TIMEOUT_MS) {
    llmFailedAt = null; // Reset circuit - try again
    logger.info('LLM circuit breaker reset, attempting recovery');
    return false;
  }
  return true;
}

/**
 * Check if Ollama is running and accessible.
 * Returns false if LLM failed recently (circuit breaker open).
 */
export async function checkOllamaHealth(): Promise<boolean> {
  if (config.ollama.disabled || isLLMCircuitOpen()) {
    return false;
  }

  const client = getOllamaClient();
  const health = await client.healthCheck();

  return health.healthy;
}

/**
 * Mark LLM as failed; circuit will auto-reset after 5 minutes.
 */
export function markLLMFailed(): void {
  llmFailedAt = Date.now();
  logger.warn('LLM circuit breaker opened due to timeout/slowness; will retry in 5 minutes');
}

/**
 * Check if current model supports vision/multimodal
 */
export async function isMultimodalModel(): Promise<boolean> {
  const multimodalModels = ['llava', 'bakllava', 'moondream', 'cogvlm', 'deepseek-vl'];
  const modelLower = config.ollama.model.toLowerCase();
  return multimodalModels.some(m => modelLower.includes(m));
}

/**
 * Generate structured form data using Ollama
 * Supports both text-only and multimodal (vision) models
 */
export async function generateFormWithLLM(text: string, imagePath?: string): Promise<string> {
  const isMultimodal = imagePath && (await isMultimodalModel());

  if (isMultimodal && imagePath) {
    return generateWithVision(imagePath, text);
  }

  return generateWithText(text);
}

/**
 * Generate using text-only model (OCR text input)
 */
async function generateWithText(text: string): Promise<string> {
  const systemPrompt = `You are a care coordinator assistant. Extract form data from caregiver notes into JSON format. ${EXTRACTION_RULES} No other text.`;

  if (text.length > 5000) {
    logger.debug('Text truncated for LLM prompt', { original: text.length, truncated: 5000 });
  }

  const userPrompt = `TRANSCRIPT:
"""
${text.substring(0, 5000)}
"""

JSON OUTPUT:`;

  const client = getOllamaClient();

  try {
    const result = await client.generate(
      {
        model: config.ollama.model,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: getModelOptions(false),
      },
      {
        timeout: config.ollama.timeout,
      }
    );

    return result.response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Ollama request failed: ${errorMessage}`);
  }
}

/**
 * Generate using multimodal model (image + optional OCR text)
 * For handwriting - the model sees the image directly
 */
async function generateWithVision(imagePath: string, ocrText?: string): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const ocrHint = ocrText ? `\nOCR hint: ${ocrText.substring(0, 500)}` : '';

  const prompt = `Look at this handwritten form image and extract data into JSON.${ocrHint}

Extract ONLY (leave sensitive fields empty):
- Date (MM/DD/YYYY), Time, Location - operational details only
- SIH: true/false, HCBW: true/false
- All handwritten narrative notes

DO NOT EXTRACT (leave empty for manual entry):
- Recipient name, ID, DOB
- Signature, care coordinator name, date signed

Return ONLY JSON like:
{"header":{"recipientName":"","date":"...","time":"...","recipientIdentifier":"","dob":"","location":"..."},"careCoordinationType":{"sih":false,"hcbw":false},"narrative":{"recipientAndVisitObservations":"...","healthEmotionalStatus":"...","reviewOfServices":"...","progressTowardGoals":"...","additionalNotes":"...","followUpTasks":"..."},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

JSON OUTPUT:`;

  const client = getOllamaClient();

  try {
    const result = await client.generate(
      {
        model: config.ollama.model,
        prompt,
        images: [base64Image],
        stream: false,
        options: getModelOptions(true),
      },
      {
        timeout: config.ollama.visionTimeout,
      }
    );

    return result.response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Ollama vision request failed: ${errorMessage}`);
  }
}

/**
 * Generate with streaming support for real-time updates
 */
export async function generateWithStreaming(
  text: string,
  onChunk: (chunk: string) => void,
  imagePath?: string
): Promise<string> {
  const isMultimodal = imagePath && (await isMultimodalModel());
  const client = getOllamaClient();

  let request;
  let timeout = config.ollama.timeout;

  if (isMultimodal && imagePath) {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    request = {
      model: config.ollama.model,
      prompt: buildSimplifiedVisionPrompt(text),
      images: [base64Image],
      options: getModelOptions(true),
    };
    timeout = config.ollama.visionTimeout;
  } else {
    request = {
      model: config.ollama.model,
      prompt: buildSimplifiedPrompt(text),
      options: getModelOptions(false),
    };
  }

  const result = await client.generate(request, {
    stream: true,
    onStream: onChunk,
    timeout,
  });

  return result.response;
}

// Shared extraction rules reused in both text and vision prompts
const EXTRACTION_RULES = `Extract ONLY: date (MM/DD/YYYY), time, location, SIH/HCBW (true/false), and narrative notes.
Leave empty (manual entry): recipientName, recipientIdentifier, dob, careCoordinatorName, dateSigned.
Organize narrative into: recipientAndVisitObservations, healthEmotionalStatus, reviewOfServices, progressTowardGoals, followUpTasks, additionalNotes.
Return ONLY valid JSON.`;

/**
 * Build simplified prompt that works better with small models
 */
function buildSimplifiedPrompt(text: string): string {
  if (text.length > 4000) {
    logger.debug('Text truncated for simplified prompt', {
      original: text.length,
      truncated: 4000,
    });
  }
  return `Extract form data from caregiver notes into JSON.

${EXTRACTION_RULES}

NOTES:
${text.substring(0, 4000)}

JSON OUTPUT ONLY:`;
}

/**
 * Build simplified prompt for vision model
 */
function buildSimplifiedVisionPrompt(ocrText?: string): string {
  const ocrHint =
    ocrText && ocrText.length > 10
      ? `\nOCR hint (may be inaccurate): ${ocrText.substring(0, 500)}`
      : '';

  return `Look at this handwritten form image and extract data into JSON.${ocrHint}

${EXTRACTION_RULES}

JSON OUTPUT:`;
}

/**
 * List available models from Ollama
 */
export async function listModels(): Promise<string[]> {
  try {
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.models?.map((m: { name: string }) => m.name) || [];
  } catch {
    return [];
  }
}

/**
 * Get model options for generation with optimized defaults
 */
function getModelOptions(isVision: boolean = false) {
  return {
    temperature: config.ollama.temperature,
    num_predict: isVision ? 2000 : config.ollama.performance.numPredict,
    num_ctx: config.ollama.numCtx,
    top_p: config.ollama.performance.topP,
    top_k: config.ollama.performance.topK,
    repeat_penalty: config.ollama.performance.repeatPenalty,
    frequency_penalty: config.ollama.performance.frequencyPenalty,
    presence_penalty: config.ollama.performance.presencePenalty,
    keep_alive: '10m',
    num_thread: config.ollama.performance.numThread,
    num_batch: config.ollama.performance.numBatch,
    // GPU settings - will be overridden by ollamaClient
    num_gpu: config.ollama.gpu.numGpuLayers,
    main_gpu: config.ollama.gpu.mainGpu,
  };
}

// Re-export types for convenience
export { getOllamaClient };
