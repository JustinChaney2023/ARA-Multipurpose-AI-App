/**
 * LLM Summarizer - Creates human-readable summary of caregiver notes
 * before filling out the form
 */

import { logger } from './logger.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  concerns: string[];
  actions: string[];
  rawOutput: string;
}

/**
 * Generate a human-readable summary of caregiver notes
 * This helps the user understand what was in the document before filling the form
 */
export async function summarizeCaregiverNotes(ocrText: string): Promise<SummaryResult> {
  logger.info('Generating summary of caregiver notes');
  
  const prompt = `You are a care coordinator assistant. Read these caregiver notes and create a comprehensive, detailed summary for the care team.

SUMMARY REQUIREMENTS:
1. Write a DETAILED paragraph (4-6 sentences) describing:
   - Overall client status and demeanor
   - Specific observations about health, behavior, and environment
   - Any notable changes from previous visits
   - Quality of interactions and communication

2. Extract key facts as bullet points - be specific with numbers, dates, names when available

3. Identify ALL concerns - health, safety, behavioral, environmental, medication, social

4. List specific follow-up actions with WHO should do WHAT and BY WHEN if mentioned

OUTPUT FORMAT (JSON):
{
  "summary": "Detailed paragraph covering client status, observations, changes, and interactions",
  "keyPoints": [
    "Specific fact with details",
    "Another specific fact with details"
  ],
  "concerns": [
    "Specific concern with context",
    "Another concern with details"
  ],
  "actions": [
    "Specific action item with who/when",
    "Another action item"
  ]
}

IMPORTANT:
- Be thorough and detailed - include specific information from the notes
- If there are no concerns, return empty array for "concerns"
- If there are no actions needed, return empty array for "actions"
- Use direct quotes from notes when helpful

CAREGIVER NOTES TO SUMMARIZE:
${ocrText.substring(0, 4000)}

OUTPUT ONLY VALID JSON:`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.3,
          num_predict: 2500,
        },
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout for small models
    });

    if (!response.ok) {
      throw new Error(`Summary request failed: ${response.status}`);
    }

    const data = await response.json();
    const rawOutput = data.response;
    
    // Parse the JSON response
    let parsed: SummaryResult;
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(rawOutput);
      }
    } catch {
      // Fallback if JSON parsing fails
      logger.warn('Failed to parse summary JSON, using fallback');
      return {
        summary: 'Unable to generate structured summary from the provided notes.',
        keyPoints: ['OCR text captured but summary generation failed'],
        concerns: [],
        actions: ['Review original OCR text manually'],
        rawOutput: rawOutput
      };
    }
    
    logger.info('Summary generated successfully', {
      keyPointsCount: parsed.keyPoints?.length || 0,
      concernsCount: parsed.concerns?.length || 0,
      actionsCount: parsed.actions?.length || 0
    });
    
    return {
      summary: parsed.summary || 'No summary available',
      keyPoints: parsed.keyPoints || [],
      concerns: parsed.concerns || [],
      actions: parsed.actions || [],
      rawOutput
    };
    
  } catch (error) {
    logger.error('Summary generation failed', { error });
    
    // Return fallback summary
    return {
      summary: 'Summary generation failed. Please review the OCR text below.',
      keyPoints: ['Error occurred during AI processing'],
      concerns: ['Unable to auto-detect concerns - please review manually'],
      actions: ['Review OCR text and fill form manually or try again'],
      rawOutput: String(error)
    };
  }
}

/**
 * Format summary for display in UI
 */
export function formatSummaryForDisplay(result: SummaryResult): string {
  const parts: string[] = [];
  
  // Main summary
  parts.push('## Summary');
  parts.push(result.summary);
  parts.push('');
  
  // Key Points
  if (result.keyPoints.length > 0) {
    parts.push('## Key Points');
    result.keyPoints.forEach(point => {
      parts.push(`• ${point}`);
    });
    parts.push('');
  }
  
  // Concerns (highlighted)
  if (result.concerns.length > 0) {
    parts.push('## WARNING: Concerns');
    result.concerns.forEach(concern => {
      parts.push(`• ${concern}`);
    });
    parts.push('');
  }
  
  // Actions
  if (result.actions.length > 0) {
    parts.push('## Follow-Up Actions');
    result.actions.forEach(action => {
      parts.push(`• ${action}`);
    });
    parts.push('');
  }
  
  return parts.join('\n');
}
