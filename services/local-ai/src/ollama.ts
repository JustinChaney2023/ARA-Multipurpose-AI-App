/**
 * Ollama integration for local LLM processing
 * Supports multimodal models for handwriting recognition
 */

import { MonthlyCareCoordinationFormSchema, type MonthlyCareCoordinationForm, Errors, AppError } from '@ara/shared';
import fs from 'fs/promises';
import { config } from './config/index.js';
import { logger } from './logger.js';

// Track if LLM failed (to avoid repeated timeouts)
let llmFailed = false;

/**
 * Check if Ollama is running and accessible
 * Returns false if LLM previously timed out in this session
 */
export async function checkOllamaHealth(): Promise<boolean> {
  if (llmFailed || config.ollama.disabled) {
    return false;
  }

  try {
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Mark LLM as failed for this session
 */
export function markLLMFailed(): void {
  llmFailed = true;
  logger.warn('LLM disabled for this session due to timeout/slowness');
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
  const isMultimodal = imagePath && await isMultimodalModel();
  
  if (isMultimodal && imagePath) {
    return generateWithVision(imagePath, text);
  }
  
  return generateWithText(text);
}

/**
 * Generate using text-only model (OCR text input)
 */
async function generateWithText(text: string): Promise<string> {
  const systemPrompt = `You are a care coordinator assistant. Extract form data from caregiver notes into JSON format.

INSTRUCTIONS:
- Find recipient name, date, time, ID, DOB, location
- Identify if SIH and/or HCBW is checked (true/false)
- Copy all narrative text into appropriate sections
- Use empty string "" for missing fields
- Format dates as MM/DD/YYYY

EXAMPLE OUTPUT:
{"header":{"recipientName":"Bob Smith","date":"03/15/2024","time":"","recipientIdentifier":"","dob":"","location":""},"careCoordinationType":{"sih":true,"hcbw":false},"narrative":{"recipientAndVisitObservations":"Client doing well","healthEmotionalStatus":"","reviewOfServices":"","progressTowardGoals":"","additionalNotes":"","followUpTasks":""},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

Return ONLY valid JSON. No other text.`;

  const userPrompt = `TRANSCRIPT:\n"""\n${text.substring(0, 5000)}\n"""\n\nJSON OUTPUT:`;
  
  const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollama.model,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      options: getModelOptions(false),
    }),
    signal: AbortSignal.timeout(config.ollama.timeout),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.response;
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

Extract:
- Name, Date (MM/DD/YYYY), Time, ID, DOB, Location
- SIH: true/false, HCBW: true/false  
- All handwritten notes text

Return ONLY JSON like:
{"header":{"recipientName":"...","date":"...","time":"...","recipientIdentifier":"...","dob":"...","location":"..."},"careCoordinationType":{"sih":false,"hcbw":false},"narrative":{"recipientAndVisitObservations":"...","healthEmotionalStatus":"...","reviewOfServices":"...","progressTowardGoals":"...","additionalNotes":"...","followUpTasks":"..."},"signature":{"careCoordinatorName":"...","signature":"...","dateSigned":"..."}}

JSON OUTPUT:`;
  
  const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollama.model,
      prompt,
      images: [base64Image],
      stream: false,
      options: getModelOptions(true),
    }),
    signal: AbortSignal.timeout(config.ollama.visionTimeout),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama vision request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Build simplified prompt that works better with small models
 */
function buildSimplifiedPrompt(text: string): string {
  return `Extract form data from caregiver notes into JSON format.

INSTRUCTIONS:
- Find recipient name, date, time, ID, DOB, location
- Identify if SIH and/or HCBW is checked (true/false)
- Copy all narrative text into appropriate sections
- Use empty string "" for missing fields
- Format dates as MM/DD/YYYY

EXAMPLE:
Input: "Name: Bob Smith, Date: 03/15/2024, SIH checked, Client doing well"
Output: {"header":{"recipientName":"Bob Smith","date":"03/15/2024","time":"","recipientIdentifier":"","dob":"","location":""},"careCoordinationType":{"sih":true,"hcbw":false},"narrative":{"recipientAndVisitObservations":"Client doing well","healthEmotionalStatus":"","reviewOfServices":"","progressTowardGoals":"","additionalNotes":"","followUpTasks":""},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

NOW EXTRACT FROM:
${text.substring(0, 4000)}

JSON OUTPUT ONLY:`;
}

/**
 * Build simplified prompt for vision model
 */
function buildSimplifiedVisionPrompt(ocrText?: string): string {
  const ocrHint = ocrText && ocrText.length > 10
    ? `\nOCR hint (may be inaccurate): ${ocrText.substring(0, 500)}` 
    : '';

  return `Look at this handwritten form image and extract data into JSON.${ocrHint}

Extract:
- Name, Date (MM/DD/YYYY), Time, ID, DOB, Location
- SIH: true/false, HCBW: true/false  
- All handwritten notes text

Return ONLY JSON like:
{"header":{"recipientName":"...","date":"...","time":"...","recipientIdentifier":"...","dob":"...","location":"..."},"careCoordinationType":{"sih":false,"hcbw":false},"narrative":{"recipientAndVisitObservations":"...","healthEmotionalStatus":"...","reviewOfServices":"...","progressTowardGoals":"...","additionalNotes":"...","followUpTasks":"..."},"signature":{"careCoordinatorName":"...","signature":"...","dateSigned":"..."}}

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
 * Get model options for generation
 */
function getModelOptions(isVision: boolean = false) {
  return {
    temperature: config.ollama.temperature,
    num_predict: isVision ? 2000 : 1500,
    num_ctx: config.ollama.numCtx,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.0,
    keep_alive: "10m",
    num_thread: 0,
    num_gpu: 0,
    num_batch: 512,
  };
}
