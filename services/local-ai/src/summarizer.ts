/**
 * LLM Summarizer - Creates human-readable summary of caregiver notes
 */

import { logger } from './logger.js';
import { setModelBusy } from './warmup.js';
import { 
  DEFAULT_MODEL, 
  OLLAMA_BASE_URL, 
  getModelOptions
} from './modelConfig.js';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  concerns: string[];
  actions: string[];
  rawOutput: string;
}

export type ProgressCallback = (progress: { stage: string; message: string; percent: number }) => void;

/**
 * Clean and prepare input text
 * Preserves more content for better summarization
 */
function cleanInputText(text: string): string {
  let cleaned = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  // Use 6000 chars for balance between completeness and speed
  return cleaned.substring(0, 6000);
}

/**
 * Generate a summary of caregiver notes - returns raw LLM output
 */
export async function summarizeCaregiverNotes(
  ocrText: string,
  onProgress?: ProgressCallback
): Promise<SummaryResult> {
  const startTime = Date.now();
  logger.info('[SUMMARIZE] Starting...');
  
  setModelBusy(true);
  
  onProgress?.({ stage: 'cleaning', message: 'Preparing text...', percent: 10 });
  
  const cleanedText = cleanInputText(ocrText);
  if (cleanedText.length < 10) {
    return {
      summary: 'Input text is too short to generate a meaningful summary.',
      keyPoints: ['Insufficient text provided'],
      concerns: [],
      actions: ['Provide more detailed caregiver notes'],
      rawOutput: 'Input too short'
    };
  }
  
  const system = `Summarize caregiver notes concisely. Include: visit overview, observations, health status, services, goals, follow-ups, concerns. Be brief but capture key info.`;

  const prompt = `Summarize:\n"""\n${cleanedText}\n"""\n\nFormat:\n**OVERVIEW:** 2-3 sentences\n**OBSERVATIONS:** Key points\n**HEALTH:** Meds, doctor visits, behaviors\n**SERVICES:** Current services\n**GOALS:** Progress notes\n**FOLLOW-UP:** Action items\n**CONCERNS:** Any issues`;

  onProgress?.({ stage: 'sending', message: 'Sending to AI...', percent: 30 });
  
  try {
    logger.info('[SUMMARIZE] Sending request...');
    
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        system: system,
        prompt: prompt,
        stream: false,
        options: {
          ...getModelOptions(),
          num_predict: 4000, // Increased for comprehensive summaries
          temperature: 0.3,  // Slightly higher for more natural language
        },
      }),
      signal: AbortSignal.timeout(120000),
    });
    
    onProgress?.({ stage: 'waiting', message: 'Waiting for response...', percent: 60 });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    onProgress?.({ stage: 'parsing', message: 'Processing...', percent: 90 });

    const data = await response.json();
    const rawOutput = data.response?.trim() || '';
    
    logger.info('[SUMMARIZE] Complete:', { 
      duration: Date.now() - startTime,
      outputLength: rawOutput.length 
    });
    
    onProgress?.({ stage: 'complete', message: 'Done!', percent: 100 });
    
    setModelBusy(false);
    
    // Return the raw output as the summary - no parsing needed
    return {
      summary: rawOutput || 'No summary generated.',
      keyPoints: [],
      concerns: [],
      actions: [],
      rawOutput: rawOutput.substring(0, 4000) // Keep more for debugging
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[SUMMARIZE] Failed:', { error: errorMessage });
    
    onProgress?.({ stage: 'error', message: errorMessage, percent: 100 });
    
    setModelBusy(false);
    
    if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
      return {
        summary: 'Ollama is not running. Please start Ollama to use AI features.',
        keyPoints: [],
        concerns: [],
        actions: [],
        rawOutput: errorMessage
      };
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return {
        summary: 'AI request timed out. The model may be loading or busy.',
        keyPoints: [],
        concerns: [],
        actions: [],
        rawOutput: errorMessage
      };
    }
    
    return {
      summary: 'Summary generation failed. Please review the original text.',
      keyPoints: [],
      concerns: [],
      actions: [],
      rawOutput: errorMessage
    };
  }
}
