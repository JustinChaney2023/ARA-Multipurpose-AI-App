/**
 * LLM-based categorization and validation of OCR text
 * Extracts structured data using LLM logic before form filling
 */

import { createEmptyForm } from '@ara/shared';
import { logger, createProgressTracker } from './logger.js';
import type { MonthlyCareCoordinationForm } from '@ara/shared';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:0.5b';

// Track if LLM failed (to avoid repeated timeouts)
let llmFailed = false;

interface CategorizationResult {
  form: Partial<MonthlyCareCoordinationForm>;
  validationNotes: string[];
  rawOutput: string;
}

interface ValidationIssue {
  field: string;
  issue: string;
  suggestion?: string;
}

/**
 * Check if LLM is available
 */
export function isLLMAvailable(): boolean {
  return !llmFailed && process.env.DISABLE_LLM !== 'true';
}

/**
 * Mark LLM as failed
 */
export function markLLMFailed(): void {
  llmFailed = true;
}

/**
 * Use LLM to categorize and validate OCR text into structured form data
 */
export async function categorizeAndValidateWithLLM(
  ocrText: string,
  ocrConfidence: number
): Promise<CategorizationResult> {
  const progress = createProgressTracker('LLM_CATEGORIZER');
  progress.start('Starting LLM categorization');
  
  // Step 1: Categorize raw text into structured fields
  progress.update(25, 'Categorizing OCR text into form fields');
  const categorized = await categorizeText(ocrText);
  
  // Step 2: Validate the categorized data
  progress.update(60, 'Validating extracted data');
  const validation = await validateCategorizedData(categorized, ocrText);
  
  // Step 3: Merge and finalize
  progress.update(90, 'Merging results');
  const form = mergeWithDefaults(categorized, validation);
  
  progress.complete('Categorization complete');
  
  logger.info('LLM categorization complete', {
    validationIssues: validation.issues.length,
    fieldsExtracted: Object.keys(form).length
  });
  
  return {
    form,
    validationNotes: validation.issues.map(i => `${i.field}: ${i.issue}${i.suggestion ? ` (${i.suggestion})` : ''}`),
    rawOutput: categorized.rawOutput + '\n\nValidation:\n' + JSON.stringify(validation.issues, null, 2)
  };
}

/**
 * Step 1: Categorize raw OCR text into form fields
 * Uses simplified prompt without format:json for better small model performance
 */
async function categorizeText(ocrText: string): Promise<{ data: Partial<MonthlyCareCoordinationForm>; rawOutput: string }> {
  // Simplified, focused prompt that works better with small models
  const prompt = `Extract form data from caregiver notes into JSON.

EXAMPLE 1 - Simple extraction:
Input: "Name: John Doe, Date: 03/15/2024, SIH checked"
Output: {"header":{"recipientName":"John Doe","date":"03/15/2024","time":"","recipientIdentifier":"","dob":"","location":""},"careCoordinationType":{"sih":true,"hcbw":false},"narrative":{"recipientAndVisitObservations":"","healthEmotionalStatus":"","reviewOfServices":"","progressTowardGoals":"","additionalNotes":"","followUpTasks":""},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

EXAMPLE 2 - With narrative:
Input: "Client Mary Smith visited 02/10/2024. BP 140/90. HCBW service. Client doing well."
Output: {"header":{"recipientName":"Mary Smith","date":"02/10/2024","time":"","recipientIdentifier":"","dob":"","location":""},"careCoordinationType":{"sih":false,"hcbw":true},"narrative":{"recipientAndVisitObservations":"Client doing well.","healthEmotionalStatus":"BP 140/90.","reviewOfServices":"","progressTowardGoals":"","additionalNotes":"","followUpTasks":""},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

NOW EXTRACT FROM THIS TEXT (respond with ONLY JSON):
---
${ocrText.substring(0, 4000)}
---

JSON OUTPUT:`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      prompt,
      stream: false,
      // NOTE: Removed format: 'json' - it confuses small models with complex schemas
      options: {
        temperature: 0.1,  // Lower temperature for more deterministic output
        num_predict: 2000, // Reduced from 4000 for faster response
        stop: ["\n\n", "Input:", "Output:"], // Stop sequences to prevent continuation
      },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Categorization failed: ${response.status}`);
  }

  const data = await response.json();
  const rawOutput = data.response?.trim() || '';
  
  logger.debug('LLM raw output', { rawOutput: rawOutput.substring(0, 500) });
  
  // Parse the JSON response with multiple fallback strategies
  let parsed: Partial<MonthlyCareCoordinationForm>;
  try {
    // Try direct parse first
    parsed = JSON.parse(rawOutput);
  } catch (directError) {
    // Try extracting from markdown code block
    const codeBlockMatch = rawOutput.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        throw new Error('Could not parse JSON from code block');
      }
    } else {
      // Try finding JSON object between curly braces
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          throw new Error('Could not parse JSON from matched brackets');
        }
      } else {
        throw new Error('No JSON object found in LLM output');
      }
    }
  }
  
  return { data: parsed, rawOutput };
}

/**
 * Step 2: Validate categorized data for inconsistencies
 */
async function validateCategorizedData(
  categorized: { data: Partial<MonthlyCareCoordinationForm> },
  originalText: string
): Promise<{ issues: ValidationIssue[]; corrected: Partial<MonthlyCareCoordinationForm> }> {
  const form = categorized.data;
  const issues: ValidationIssue[] = [];
  
  // Check for literal "string" values (LLM misunderstood the prompt)
  const checkLiteralString = (value: unknown, field: string) => {
    if (typeof value === 'string' && value.toLowerCase().includes('string')) {
      issues.push({
        field,
        issue: `Placeholder value found: "${value}"`,
        suggestion: 'Field not properly extracted from source text'
      });
      return ''; // Clear the placeholder
    }
    return value;
  };
  
  // Clean header fields
  if (form.header) {
    form.header.recipientName = checkLiteralString(form.header.recipientName, 'header.recipientName') as string;
    form.header.date = checkLiteralString(form.header.date, 'header.date') as string;
    form.header.time = checkLiteralString(form.header.time, 'header.time') as string;
    form.header.recipientIdentifier = checkLiteralString(form.header.recipientIdentifier, 'header.recipientIdentifier') as string;
    form.header.dob = checkLiteralString(form.header.dob, 'header.dob') as string;
    form.header.location = checkLiteralString(form.header.location, 'header.location') as string;
  }
  
  // Date validation
  const dateRegex = /^(0[1-9]|1[0-2])\/([0-2][0-9]|3[01])\/\d{4}$/;
  
  if (form.header?.date && !dateRegex.test(form.header.date) && form.header.date !== '') {
    issues.push({
      field: 'header.date',
      issue: `Invalid date format: ${form.header.date}`,
      suggestion: 'Should be MM/DD/YYYY'
    });
  }
  
  if (form.header?.dob && !dateRegex.test(form.header.dob) && form.header.dob !== '') {
    issues.push({
      field: 'header.dob',
      issue: `Invalid DOB format: ${form.header.dob}`,
      suggestion: 'Should be MM/DD/YYYY'
    });
  }
  
  // Logical consistency checks
  if (form.careCoordinationType?.sih && form.careCoordinationType?.hcbw) {
    issues.push({
      field: 'careCoordinationType',
      issue: 'Both SIH and HCBW are checked',
      suggestion: 'Usually only one is selected'
    });
  }
  
  // Check for empty required fields
  if (!form.header?.recipientName || form.header.recipientName.trim() === '') {
    issues.push({
      field: 'header.recipientName',
      issue: 'Recipient name not found in text',
      suggestion: 'Check OCR quality or manually enter'
    });
  }
  
  // Check narrative content quality
  const narratives = form.narrative || {};
  const hasNarrativeContent = Object.entries(narratives)
    .filter(([key]) => key !== 'followUpTasks')
    .some(([, v]) => typeof v === 'string' && v.length > 20 && !v.toLowerCase().includes('string'));
  
  if (!hasNarrativeContent) {
    issues.push({
      field: 'narrative',
      issue: 'No narrative content extracted',
      suggestion: 'OCR may have failed to capture text'
    });
  }
  
  // Clean narrative fields of placeholder text
  if (form.narrative) {
    for (const [key, value] of Object.entries(form.narrative)) {
      if (typeof value === 'string' && value.toLowerCase().includes('string')) {
        form.narrative[key as keyof typeof form.narrative] = '';
      }
    }
  }
  
  logger.debug('Validation complete', { issueCount: issues.length });
  
  return { issues, corrected: form };
}

/**
 * Step 3: Merge categorized data with defaults
 */
function mergeWithDefaults(
  categorized: { data: Partial<MonthlyCareCoordinationForm> },
  validation: { corrected: Partial<MonthlyCareCoordinationForm>; issues: ValidationIssue[] }
): MonthlyCareCoordinationForm {
  const empty = createEmptyForm();
  const data = validation.corrected;
  
  // Build validation notes
  const validationNotes = validation.issues.length > 0 
    ? 'EXTRACTION NOTES:\n' + validation.issues.map(i => `- ${i.field}: ${i.issue}`).join('\n')
    : '';
  
  // Get existing additional notes from LLM output
  const existingNotes = data.narrative?.additionalNotes || '';
  
  // Combine: validation notes first, then existing additional notes
  const combinedNotes = validationNotes 
    ? validationNotes + '\n\n---\n\n' + existingNotes
    : existingNotes;
  
  // Merge with defaults, preferring extracted data
  return {
    header: {
      recipientName: data.header?.recipientName || empty.header.recipientName,
      date: data.header?.date || empty.header.date,
      time: data.header?.time || empty.header.time,
      recipientIdentifier: data.header?.recipientIdentifier || empty.header.recipientIdentifier,
      dob: data.header?.dob || empty.header.dob,
      location: data.header?.location || empty.header.location,
    },
    careCoordinationType: {
      sih: data.careCoordinationType?.sih ?? empty.careCoordinationType.sih,
      hcbw: data.careCoordinationType?.hcbw ?? empty.careCoordinationType.hcbw,
    },
    narrative: {
      recipientAndVisitObservations: data.narrative?.recipientAndVisitObservations || empty.narrative.recipientAndVisitObservations,
      healthEmotionalStatus: data.narrative?.healthEmotionalStatus || empty.narrative.healthEmotionalStatus,
      reviewOfServices: data.narrative?.reviewOfServices || empty.narrative.reviewOfServices,
      progressTowardGoals: data.narrative?.progressTowardGoals || empty.narrative.progressTowardGoals,
      additionalNotes: combinedNotes || empty.narrative.additionalNotes,
      followUpTasks: data.narrative?.followUpTasks || empty.narrative.followUpTasks,
    },
    signature: {
      careCoordinatorName: data.signature?.careCoordinatorName || empty.signature.careCoordinatorName,
      signature: data.signature?.signature || empty.signature.signature,
      dateSigned: data.signature?.dateSigned || empty.signature.dateSigned,
    },
  };
}
