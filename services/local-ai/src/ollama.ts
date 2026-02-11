/**
 * Ollama integration for local LLM processing
 * Supports multimodal models for handwriting recognition
 */

import { MonthlyCareCoordinationFormSchema, type MonthlyCareCoordinationForm } from '@ara/shared';
import fs from 'fs/promises';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';

// Track if LLM failed (to avoid repeated timeouts)
let llmFailed = false;

/**
 * Check if Ollama is running and accessible
 * Returns false if LLM previously timed out in this session
 */
export async function checkOllamaHealth(): Promise<boolean> {
  if (llmFailed || process.env.DISABLE_LLM === 'true') {
    return false;
  }

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
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
  console.log('[Ollama] LLM disabled for this session due to timeout/slowness');
}

/**
 * Check if current model supports vision/multimodal
 */
export async function isMultimodalModel(): Promise<boolean> {
  const multimodalModels = ['llava', 'bakllava', 'moondream', 'cogvlm', 'deepseek-vl'];
  const modelLower = DEFAULT_MODEL.toLowerCase();
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
  const prompt = buildSimplifiedPrompt(text);
  
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      prompt,
      stream: false,
      // NOTE: Removed format: 'json' - use prompt-based JSON extraction instead
      options: {
        temperature: 0.1,
        num_predict: 2000,
        stop: ["\n\n"],
      },
    }),
    signal: AbortSignal.timeout(60000),
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
  // Read image and convert to base64
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  const prompt = buildSimplifiedVisionPrompt(ocrText);
  
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      prompt,
      images: [base64Image],
      stream: false,
      // NOTE: Removed format: 'json' for better compatibility
      options: {
        temperature: 0.1,
        num_predict: 2000,
        stop: ["\n\n"],
      },
    }),
    signal: AbortSignal.timeout(120000), // 2 minutes for vision (slower)
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
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
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
