/**
 * LLM Summarizer - Creates human-readable summary of caregiver notes
 */

import { logger } from './logger.js';
import { DEFAULT_MODEL, getModelOptions } from './modelConfig.js';
import { getOllamaClient } from './ollamaClient.js';
import { getPromptBody, render } from './promptStore.js';
import { setModelBusy } from './warmup.js';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  concerns: string[];
  actions: string[];
  rawOutput: string;
  isFallback?: boolean;
}

export type ProgressCallback = (progress: {
  stage: string;
  message: string;
  percent: number;
}) => void;

export interface SummarizeOptions {
  onProgress?: ProgressCallback;
  /** Phase 4: prior patient context injected into the prompt via RAG. */
  context?: string;
}

/**
 * Clean and prepare input text
 * Preserves more content for better summarization
 */
function cleanInputText(text: string): string {
  const cleaned = text
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
  options?: SummarizeOptions
): Promise<SummaryResult> {
  const { onProgress, context } = options || {};
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
      rawOutput: 'Input too short',
      isFallback: true,
    };
  }

  // Prompt bodies are user-editable via the Settings UI (Phase 2). Defaults
  // live in defaults/prompts.ts and are seeded into SQLite on first startup.
  // The summarizer reads the current versions here so edits take effect on
  // the next request without a restart.
  //
  // Note: qwen3's thinking mode is disabled via the `think: false` API param
  // below — in-prompt directives like "/no_think" are silently ignored by the
  // model. Without it qwen3:4b burns 30-90s of CPU on reasoning tokens.
  const system = render(getPromptBody('summarizer.system'), {
    context: context || '',
  });
  const prompt = render(getPromptBody('summarizer.main'), {
    rawText: cleanedText,
    context: context || '',
  });

  onProgress?.({ stage: 'sending', message: 'Sending to AI...', percent: 30 });

  try {
    logger.info('[SUMMARIZE] Sending request...');

    const client = getOllamaClient();

    // Streaming: map token progress to 30-90% so the bar moves in real time
    // instead of sitting at 30% for the whole inference.
    // maxPredict is the ceiling we'll hit; progress asymptotes toward 90% as
    // tokens accumulate so the bar never finishes ahead of the model.
    const maxPredict = 900;
    let tokensReceived = 0;
    let lastReportedPercent = 30;

    const data = await client.generate(
      {
        model: DEFAULT_MODEL,
        system: system,
        prompt: prompt,
        stream: true,
        // Disable qwen3's reasoning block (see prompt comment above).
        // Non-reasoning models silently ignore this field, so it's safe to set
        // unconditionally as long as we target Ollama >= 0.5.
        think: false,
        options: {
          ...getModelOptions(),
          // Bumped from 600 to 900 for qwen3:4b — 8 sections with real content
          // can exceed 600 tokens; hitting the cap truncates "Other Conversation".
          num_predict: maxPredict,
          temperature: 0.3,
        },
      },
      {
        // CPU-only qwen3:4b generates ~5 tokens/sec, so a 900-token budget can
        // take ~3 minutes. 300s gives headroom for that plus the first-call
        // model-load penalty if keep-alive has let the model unload.
        timeout: 300000,
        stream: true,
        // No retries: streamed progress has already been shown to the user,
        // so a silent retry would reset the bar and confuse them.
        retries: 0,
        onStream: chunk => {
          // Rough token estimate: ~4 chars per token for English.
          // Progress moves 30 -> 90 over the expected token budget, capped at 89
          // so the "parsing" stage gets a distinct bump when generation ends.
          tokensReceived += Math.max(1, Math.round(chunk.length / 4));
          const ratio = Math.min(tokensReceived / maxPredict, 1);
          const percent = Math.min(89, 30 + Math.round(ratio * 60));
          if (percent > lastReportedPercent) {
            lastReportedPercent = percent;
            onProgress?.({
              stage: 'generating',
              message: `Generating summary... (${tokensReceived} tokens)`,
              percent,
            });
          }
        },
      }
    );

    onProgress?.({ stage: 'parsing', message: 'Processing...', percent: 95 });

    const rawOutput = data.response?.trim() || '';

    logger.info('[SUMMARIZE] Complete:', {
      duration: Date.now() - startTime,
      outputLength: rawOutput.length,
    });

    onProgress?.({ stage: 'complete', message: 'Done!', percent: 100 });

    setModelBusy(false);

    // Return the raw output as the summary - no parsing needed
    return {
      summary: rawOutput || 'No summary generated.',
      keyPoints: [],
      concerns: [],
      actions: [],
      rawOutput: rawOutput.substring(0, 2000),
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
        rawOutput: errorMessage,
        isFallback: true,
      };
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
      return {
        summary: 'AI request timed out. The model may be loading or busy.',
        keyPoints: [],
        concerns: [],
        actions: [],
        rawOutput: errorMessage,
        isFallback: true,
      };
    }

    return {
      summary: 'Summary generation failed. Please review the original text.',
      keyPoints: [],
      concerns: [],
      actions: [],
      rawOutput: errorMessage,
      isFallback: true,
    };
  }
}
