/**
 * LLM-based categorization and validation of OCR text
 * Extracts structured data using LLM logic before form filling
 */

import { createEmptyForm } from '@ara/shared';
import type { MonthlyCareCoordinationForm } from '@ara/shared';

import { parseLLMJSON, isPlaceholder, cleanPlaceholders } from './jsonUtils.js';
import { logger, createProgressTracker } from './logger.js';
import { DEFAULT_MODEL, getModelOptions } from './modelConfig.js';
import { getOllamaClient } from './ollamaClient.js';


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
 * Use LLM to categorize and validate OCR text into structured form data
 */
export async function categorizeAndValidateWithLLM(
  ocrText: string,
  _ocrConfidence: number
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
  let form = mergeWithDefaults(categorized, validation);
  
  // Final safety: ensure all fields are proper types
  form = sanitizeFormTypes(form);
  
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
 */
async function categorizeText(ocrText: string): Promise<{ data: Partial<MonthlyCareCoordinationForm>; rawOutput: string }> {
  const system = `Extract form data from caregiver notes into JSON format.

EXAMPLES:

Example 1:
Input: "Name: John Doe, Date: 03/15/2024, SIH checked"
Output: {"header":{"recipientName":"John Doe","date":"03/15/2024","time":"","recipientIdentifier":"","dob":"","location":""},"careCoordinationType":{"sih":true,"hcbw":false},"narrative":{"recipientAndVisitObservations":"","healthEmotionalStatus":"","reviewOfServices":"","progressTowardGoals":"","additionalNotes":"","followUpTasks":""},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

Example 2:
Input: "Client Mary Smith visited 02/10/2024. BP 140/90. HCBW service."
Output: {"header":{"recipientName":"Mary Smith","date":"02/10/2024","time":"","recipientIdentifier":"","dob":"","location":""},"careCoordinationType":{"sih":false,"hcbw":true},"narrative":{"recipientAndVisitObservations":"Client doing well.","healthEmotionalStatus":"BP 140/90.","reviewOfServices":"","progressTowardGoals":"","additionalNotes":"","followUpTasks":""},"signature":{"careCoordinatorName":"","signature":"","dateSigned":""}}

Respond with ONLY valid JSON. No other text.`;

  const prompt = `NOW EXTRACT FROM:\n"""\n${ocrText.substring(0, 5000)}\n"""\n\nJSON OUTPUT:`;

  const client = getOllamaClient();
  const data = await client.generate(
    { model: DEFAULT_MODEL, system, prompt, stream: false, options: getModelOptions() },
    { timeout: 120000 }
  );
  const rawOutput = data.response?.trim() || '';
  
  logger.debug('LLM raw output', { rawOutput: rawOutput.substring(0, 500) });
  
  // Parse the JSON response using shared utility
  const parseResult = parseLLMJSON<Partial<MonthlyCareCoordinationForm>>(rawOutput);
  
  if (!parseResult.success) {
    throw new Error(parseResult.error);
  }
  
  // Clean any placeholder values
  const parsed = cleanPlaceholders(parseResult.data);
  
  return { data: parsed, rawOutput };
}

/**
 * Step 2: Validate categorized data for inconsistencies
 */
async function validateCategorizedData(
  categorized: { data: Partial<MonthlyCareCoordinationForm> },
  _originalText: string
): Promise<{ issues: ValidationIssue[]; corrected: Partial<MonthlyCareCoordinationForm> }> {
  const form = categorized.data;
  const issues: ValidationIssue[] = [];
  
  // Check for placeholder values using shared utility
  const checkPlaceholder = (value: unknown, field: string) => {
    if (isPlaceholder(value)) {
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
    form.header.recipientName = checkPlaceholder(form.header.recipientName, 'header.recipientName') as string;
    form.header.date = checkPlaceholder(form.header.date, 'header.date') as string;
    form.header.time = checkPlaceholder(form.header.time, 'header.time') as string;
    form.header.recipientIdentifier = checkPlaceholder(form.header.recipientIdentifier, 'header.recipientIdentifier') as string;
    form.header.dob = checkPlaceholder(form.header.dob, 'header.dob') as string;
    form.header.location = checkPlaceholder(form.header.location, 'header.location') as string;
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
  
  // Check narrative content quality (excluding placeholders)
  const narratives = form.narrative || {};
  const hasNarrativeContent = Object.entries(narratives)
    .filter(([key]) => key !== 'followUpTasks')
    .some(([, v]) => typeof v === 'string' && v.length > 20 && !isPlaceholder(v));
  
  if (!hasNarrativeContent) {
    issues.push({
      field: 'narrative',
      issue: 'No narrative content extracted',
      suggestion: 'OCR may have failed to capture text'
    });
  }
  
  // Clean narrative fields of placeholder text (already done by cleanPlaceholders, but ensure here)
  if (form.narrative) {
    for (const [key, value] of Object.entries(form.narrative)) {
      if (isPlaceholder(value)) {
        form.narrative[key as keyof typeof form.narrative] = '';
      }
    }
  }
  
  logger.debug('Validation complete', { issueCount: issues.length });
  
  return { issues, corrected: form };
}

/**
 * Ensure all form fields have correct types
 * LLM may return objects instead of strings for some fields
 */
function sanitizeFormTypes(form: MonthlyCareCoordinationForm): MonthlyCareCoordinationForm {
  const sanitizeString = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      // If it's an object, try to extract a string representation
      const obj = value as Record<string, unknown>;
      // Common patterns: {first, last}, {value}, {text}
      if (obj.first && obj.last) {
        return `${obj.first} ${obj.last}`.trim();
      }
      if (obj.value && typeof obj.value === 'string') {
        return obj.value;
      }
      if (obj.text && typeof obj.text === 'string') {
        return obj.text;
      }
      // Fallback: JSON string
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const sanitizeBoolean = (value: unknown): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
    }
    return Boolean(value);
  };

  return {
    header: {
      recipientName: sanitizeString(form.header?.recipientName),
      date: sanitizeString(form.header?.date),
      time: sanitizeString(form.header?.time),
      recipientIdentifier: sanitizeString(form.header?.recipientIdentifier),
      dob: sanitizeString(form.header?.dob),
      location: sanitizeString(form.header?.location),
    },
    careCoordinationType: {
      sih: sanitizeBoolean(form.careCoordinationType?.sih),
      hcbw: sanitizeBoolean(form.careCoordinationType?.hcbw),
    },
    narrative: {
      recipientAndVisitObservations: sanitizeString(form.narrative?.recipientAndVisitObservations),
      healthEmotionalStatus: sanitizeString(form.narrative?.healthEmotionalStatus),
      reviewOfServices: sanitizeString(form.narrative?.reviewOfServices),
      progressTowardGoals: sanitizeString(form.narrative?.progressTowardGoals),
      additionalNotes: sanitizeString(form.narrative?.additionalNotes),
      followUpTasks: sanitizeString(form.narrative?.followUpTasks),
    },
    signature: {
      careCoordinatorName: sanitizeString(form.signature?.careCoordinatorName),
      signature: sanitizeString(form.signature?.signature),
      dateSigned: sanitizeString(form.signature?.dateSigned),
    },
  };
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
