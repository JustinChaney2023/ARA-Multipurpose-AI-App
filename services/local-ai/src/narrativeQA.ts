/**
 * Hybrid fill pipeline for caregiver note transcripts.
 *
 * Strategy:
 * 1. Deterministic extraction for structured fields.
 * 2. Single-pass AI extraction for the whole form.
 * 3. Targeted Q&A repair only for missing or invalid fields.
 */

import {
  createEmptyForm,
  DateTimeUtils,
  type MonthlyCareCoordinationForm,
  type FieldConfidence,
  type FieldPath,
  type QAAnswer,
} from '@ara/shared';
import { buildConfidenceFromAnswers } from './utils/confidence.js';
import { logger, createProgressTracker } from './logger.js';
import { checkOllamaHealth } from './ollama.js';
import { getOllamaClient } from './ollamaClient.js';
import { setModelBusy } from './warmup.js';
import { DEFAULT_MODEL, getModelOptions } from './modelConfig.js';
import { FORM_QUESTIONS, getQuestionByFieldPath } from './formQuestions.js';
import { answerSpecificQuestions } from './questionAnswerer.js';

export interface NarrativeQAResult {
  form: MonthlyCareCoordinationForm;
  confidence: FieldConfidence[];
  extractionMethod: 'narrative-qa' | 'qa-llm' | 'ocr-only';
  ollamaAvailable: boolean;
  keySections?: Record<string, string>;
  qaAnswers?: Record<string, QAAnswer>;
}

interface ExtractedData {
  recipientName: string;
  date: string;
  time: string;
  recipientIdentifier: string;
  dob: string;
  location: string;
  sih: boolean;
  hcbw: boolean;
  recipientAndVisitObservations: string;
  healthEmotionalStatus: string;
  reviewOfServices: string;
  progressTowardGoals: string;
  followUpTasks: string;
  additionalNotes: string;
  careCoordinatorName: string;
  dateSigned: string;
}

type AnswerRecord = Record<string, QAAnswer>;

type ExtractionStrategy = 'deterministic' | 'single-pass' | 'qa-repair' | 'fallback';

// NOTE: Sensitive PII fields excluded from auto-extraction (HIPAA compliance)
// recipientName, recipientIdentifier, DOB require manual entry
// signature fields require manual entry for authenticity
const REQUIRED_FIELDS: FieldPath[] = [
  // 'header.recipientName',  // Manual entry only (PII)
  'header.date'
];
const OPTIONAL_STRUCTURED_FIELDS: FieldPath[] = [
  'header.time',
  // 'header.recipientIdentifier',  // Manual entry only (PII)
  // 'header.dob',  // Manual entry only (PII)
  'header.location',
  // 'signature.careCoordinatorName',  // Manual entry only (signature)
  // 'signature.dateSigned',  // Manual entry only (signature)
];
const NARRATIVE_FIELDS: FieldPath[] = [
  'narrative.recipientAndVisitObservations',
  'narrative.healthEmotionalStatus',
  'narrative.reviewOfServices',
  'narrative.progressTowardGoals',
  'narrative.additionalNotes',
  'narrative.followUpTasks',
];
const QUESTION_FIELD_PATHS = FORM_QUESTIONS.map(question => question.fieldPath as FieldPath);

export async function fillNarrativeWithQA(
  transcript: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<NarrativeQAResult> {
  const progress = createProgressTracker('NARRATIVE_QA');
  progress.start('Analyzing transcript');

  const cleanedTranscript = normalizeTranscript(transcript);
  const deterministicAnswers = extractDeterministicAnswers(cleanedTranscript);

  setModelBusy(true);

  try {
    progress.update(15, 'Running deterministic prefill + health check');
    onProgress?.('prefill', 15);

    // Limit transcript to 6000 chars — fits comfortably within the 8192-token context window
    if (cleanedTranscript.length > 6000) {
      logger.debug('Transcript truncated for extraction', { original: cleanedTranscript.length, truncated: 6000 });
    }
    const truncatedTranscript = cleanedTranscript.substring(0, 6000);

    // Run health check and LLM extraction concurrently — saves the health-check RTT
    const [ollamaAvailable, extractedDataOrNull] = await Promise.all([
      checkOllamaHealth(),
      extractAllFields(truncatedTranscript).catch((err) => {
        logger.warn('Single-pass extraction failed during parallel startup', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        return null;
      }),
    ]);

    if (!ollamaAvailable) {
      logger.warn('Ollama not available, using deterministic fallback');
      return buildFallbackResult(cleanedTranscript, deterministicAnswers);
    }

    let mergedAnswers: AnswerRecord = { ...deterministicAnswers };
    let usedRepair = false;

    try {
      progress.update(35, 'Merging AI extraction results');
      onProgress?.('extracting', 35);

      if (extractedDataOrNull) {
        const extractedAnswers = buildAnswersFromExtractedData(extractedDataOrNull);

        logger.info('AI extraction completed', {
          hasRecipientName: !!extractedDataOrNull.recipientName,
          hasDate: !!extractedDataOrNull.date,
          hasObservations: extractedDataOrNull.recipientAndVisitObservations?.length > 20,
          hasHealthStatus: extractedDataOrNull.healthEmotionalStatus?.length > 20,
        });

        mergedAnswers = mergeAnswerRecords(mergedAnswers, extractedAnswers, true); // prefer AI answers
      } else {
        logger.warn('Single-pass extraction unavailable, will attempt Q&A repair');
        usedRepair = true;
      }
    } catch (error) {
      logger.warn('Single-pass merge failed, switching to question repair', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      usedRepair = true;
    }

    let form = buildFormFromAnswers(mergedAnswers, cleanedTranscript);
    
    // Skip repair step if we have good data from initial extraction
    // This saves significant time (repair can take 30-60 seconds)
    const repairFields = buildRepairFieldList(form, mergedAnswers, cleanedTranscript);
    const needsRepair = repairFields.filter(f =>
      f === 'header.date' || f.startsWith('narrative.')
    );

    if (needsRepair.length > 0) {
      progress.update(65, `Repairing ${needsRepair.length} field(s)`);
      onProgress?.('repairing', 65);

      const repairedAnswers = await answerSpecificQuestions(cleanedTranscript, needsRepair, (_stage, percent) => {
        const mappedPercent = 65 + Math.round(percent * 0.25);
        progress.update(mappedPercent, `Repairing ${needsRepair.length} field(s)`);
        onProgress?.('repairing', mappedPercent);
      });

      mergedAnswers = mergeAnswerRecords(mergedAnswers, repairedAnswers, true);
      usedRepair = usedRepair || Object.values(repairedAnswers).some(answer => hasAnswer(answer.answer));
      form = buildFormFromAnswers(mergedAnswers, cleanedTranscript);
    }

    progress.update(92, 'Finalizing form');
    onProgress?.('finalizing', 92);

    const finalAnswers = finalizeAnswerRecord(mergedAnswers, form);
    const keySections = buildKeySections(form, cleanedTranscript);
    const confidence = buildConfidenceScores(form, finalAnswers);
    const extractionMethod: NarrativeQAResult['extractionMethod'] = usedRepair ? 'qa-llm' : 'narrative-qa';

    progress.complete('Form complete');

    logger.info('Hybrid fill complete', {
      extractionMethod,
      repairedFields: repairFields.length,
      headerFields: Object.values(form.header).filter(value => Boolean(String(value).trim())).length,
      narrativeFields: Object.values(form.narrative).filter(value => Boolean(String(value).trim())).length,
    });

    return {
      form,
      confidence,
      extractionMethod,
      ollamaAvailable: true,
      keySections,
      qaAnswers: finalAnswers,
    };
  } catch (error) {
    logger.error('Hybrid fill failed, falling back', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return buildFallbackResult(cleanedTranscript, deterministicAnswers);
  } finally {
    setModelBusy(false);
  }
}

async function extractAllFields(transcript: string): Promise<ExtractedData> {
  const defaults: ExtractedData = {
    recipientName: '',
    date: '',
    time: '',
    recipientIdentifier: '',
    dob: '',
    location: '',
    sih: false,
    hcbw: false,
    recipientAndVisitObservations: '',
    healthEmotionalStatus: '',
    reviewOfServices: '',
    progressTowardGoals: '',
    followUpTasks: '',
    additionalNotes: '',
    careCoordinatorName: '',
    dateSigned: '',
  };

  const systemPrompt = `Extract structured form data from caregiver notes into a single JSON object. Leave empty string for: recipientName, recipientIdentifier, dob, careCoordinatorName, dateSigned.`;

  const userPrompt = `Notes:
${transcript}

Extract ALL information. Each fact belongs in exactly one section — use the section that fits best. Include complete sentences; do not summarize or omit details.

Section guide:
- date: visit date in MM/DD/YYYY format
- time: time the visit occurred
- location: where the visit took place
- sih: true if SIH or Senior In-Home services are mentioned, else false
- hcbw: true if HCBW or Home and Community-Based Waiver services are mentioned, else false
- recipientAndVisitObservations: what was observed about the recipient and their environment — physical appearance, activity, behavior during the visit, home/setting condition, who was present, any incidents
- healthEmotionalStatus: medical and emotional health only — symptoms, diagnoses, medications, doctor or hospital visits, pain, vital signs, mental health, emotional state, mood
- reviewOfServices: services currently being delivered — personal care, nursing, therapy, transportation, aides, providers, service hours, whether services are working
- progressTowardGoals: care plan goal progress — specific goals, achievements, improvements, skill development, cooperation with care, barriers to goals
- followUpTasks: specific actions the care coordinator must take — calls to schedule, appointments to make, referrals, orders, next visit plans
- additionalNotes: important information not captured above — family dynamics, financial or housing concerns, equipment needs, safety concerns, anything else

JSON:`;

  try {
    const client = getOllamaClient();
    const result = await client.generate(
      {
        model: DEFAULT_MODEL,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: {
          ...getModelOptions(false),
          num_predict: 2000,
          temperature: 0.1,
        },
      },
      { useCache: true, timeout: 90000 }
    );

    const raw = result.response?.trim() || '';
    const parsed = parsePartialData(raw);

    return {
      ...defaults,
      recipientName: parsed.recipientName || '',
      date: parsed.date || '',
      time: parsed.time || '',
      recipientIdentifier: parsed.recipientIdentifier || '',
      dob: parsed.dob || '',
      location: parsed.location || '',
      sih: parsed.sih === true,
      hcbw: parsed.hcbw === true,
      recipientAndVisitObservations: parsed.recipientAndVisitObservations || '',
      healthEmotionalStatus: parsed.healthEmotionalStatus || '',
      reviewOfServices: parsed.reviewOfServices || '',
      progressTowardGoals: parsed.progressTowardGoals || '',
      followUpTasks: parsed.followUpTasks || '',
      additionalNotes: parsed.additionalNotes || '',
      careCoordinatorName: parsed.careCoordinatorName || '',
      dateSigned: parsed.dateSigned || '',
    };
  } catch (e) {
    logger.warn('Combined extraction failed', { error: (e as Error).message });
    return defaults;
  }
}

function parsePartialData(raw: string): Partial<ExtractedData> {
  try {
    let json = raw;
    const codeBlockMatch = raw.match(/```json\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      json = codeBlockMatch[1];
    } else {
      const objectMatch = raw.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        json = objectMatch[0];
      }
    }
    return JSON.parse(json) as Partial<ExtractedData>;
  } catch (e) {
    logger.debug('Failed to parse partial data', { raw: raw.substring(0, 200) });
    return {};
  }
}


function extractDeterministicAnswers(transcript: string): AnswerRecord {
  const answers: AnswerRecord = {};
  const lines = transcript.split('\n').map(line => line.trim()).filter(Boolean);

  // NOTE: recipientName, recipientIdentifier, dob extraction disabled — manual entry only (HIPAA)

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Date - support written months like "March 12, 2026" or numeric dates
    if (!answers['header.date']) {
      // Written month format: March 12, 2026
      const writtenDateMatch = line.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
      if (writtenDateMatch) {
        const parsed = DateTimeUtils.parseWrittenDate(writtenDateMatch[0]);
        if (parsed) {
          putAnswer(answers, 'header.date', parsed, 'high', `deterministic: ${line}`);
        }
      } else {
        // Numeric format: 03/12/2026
        const dateMatch = line.match(/(?:visit date|date|on)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i) || 
                          line.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
        if (dateMatch) {
          putAnswer(answers, 'header.date', normalizeDateValue(dateMatch[1]), 'high', `deterministic: ${line}`);
        }
      }
    }

    // Time - various formats
    if (!answers['header.time']) {
      const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i) ||
                        line.match(/(?:time|at)\s*[:\-]?\s*(\d{1,2}:\d{2})/i) ||
                        line.match(/\b(\d{3,4})\s*(?:AM|PM|am|pm)?\b/);
      if (timeMatch) {
        putAnswer(answers, 'header.time', normalizeTimeValue(timeMatch[1]), 'medium', `deterministic: ${line}`);
      }
    }

    // ID - various formats including "Recipient ID 58421793" (no colon)
    if (!answers['header.recipientIdentifier']) {
      // Pattern 1: "Recipient ID 58421793" or "Client ID: 58421793"
      const idMatch = line.match(/(?:recipient|client)\s*id\s*[:#\-]?\s*([A-Za-z0-9\-]{3,})/i) ||
                        // Pattern 2: "ID 58421793" or "ID: 58421793"
                        line.match(/\bid\s*(?:number|#)?\s*[:#\-]?\s*([A-Za-z0-9\-]{5,})/i) ||
                        // Pattern 3: "ID#58421793"
                        line.match(/\bid#([A-Za-z0-9\-]{3,})/i);
      if (idMatch) {
        putAnswer(answers, 'header.recipientIdentifier', idMatch[1].trim(), 'high', `deterministic: ${line}`);
      }
    }

    // NOTE: DOB extraction disabled - manual entry only (HIPAA compliance)
    /* DISABLED
    // DOB - various formats including written months
    if (!answers['header.dob']) {
      const writtenDobMatch = line.match(/(?:dob|date of birth|born)[:\-]?\s*(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
      if (writtenDobMatch) {
        const parsed = parseWrittenDate(writtenDobMatch[1]);
        if (parsed) {
          putAnswer(answers, 'header.dob', parsed, 'high', `deterministic: ${line}`);
        }
      } else {
        const dobMatch = line.match(/(?:dob|date of birth|born)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
        if (dobMatch) {
          putAnswer(answers, 'header.dob', normalizeDateValue(dobMatch[1]), 'high', `deterministic: ${line}`);
        }
      }
    }
    */

    // Location - residence, home, facility, etc.
    if (!answers['header.location']) {
      const locationMatch = line.match(/(?:at|in)\s+(?:her|his|the)\s+(?:residence|home)\s+(?:in\s+)?([A-Za-z\s,]+)/i) ||
                           line.match(/(?:location|where)[:\-]?\s*(.+)/i) ||
                           line.match(/conducted\s+(?:at|in)\s+([A-Za-z\s,]+)/i);
      if (locationMatch) {
        const location = locationMatch[1].trim().replace(/\.$/, '');
        if (location.length < 100) {
          putAnswer(answers, 'header.location', location, 'medium', `deterministic: ${line}`);
        }
      }
    }

    // NOTE: Care Coordinator name extraction disabled - manual entry only (signature authenticity)
    /* DISABLED
    // Care Coordinator name - look for "CC" or "Care Coordinator" mentions
    if (!answers['signature.careCoordinatorName']) {
      const coordinatorMatch = line.match(/(?:cc|care coordinator|coordinator)\s+(?:met|visited|reviewed|spoke)/i);
      if (coordinatorMatch) {
        // CC is mentioned but no name given - that's ok, we'll leave it blank
      }
    }
    */

    // SIH checkbox - check if mentioned
    if (lowerLine.includes('sih') || lowerLine.includes('senior in-home')) {
      const isChecked = !lowerLine.includes('not sih') && !lowerLine.includes('non-sih');
      putAnswer(answers, 'careCoordinationType.sih', isChecked ? 'true' : 'false', 'high', `deterministic: ${line}`);
    }

    // HCBW checkbox
    if (lowerLine.includes('hcbw') || lowerLine.includes('home and community') || lowerLine.includes('waiver')) {
      const isChecked = !lowerLine.includes('not hcbw') && !lowerLine.includes('non-hcbw');
      putAnswer(answers, 'careCoordinationType.hcbw', isChecked ? 'true' : 'false', 'high', `deterministic: ${line}`);
    }
  }

  const inferredLocation = inferLocation(transcript);
  if (inferredLocation && !answers['header.location']) {
    putAnswer(answers, 'header.location', inferredLocation, 'medium', `deterministic: ${inferredLocation}`);
  }

  // NOTE: signature.dateSignied auto-fill disabled - manual entry only (signature authenticity)
  // if (!answers['signature.dateSigned'] && answers['header.date']?.answer) {
  //   putAnswer(answers, 'signature.dateSigned', answers['header.date'].answer, 'medium', 'deterministic: derived from visit date');
  // }

  const extractedSections = extractNarrativeSections(transcript);
  for (const [fieldPath, value] of Object.entries(extractedSections)) {
    if (!answers[fieldPath]) {
      putAnswer(answers, fieldPath, value, 'medium', 'deterministic: section header match');
    }
  }

  return answers;
}

function buildAnswersFromExtractedData(data: ExtractedData): AnswerRecord {
  const answers: AnswerRecord = {};
  // NOTE: Sensitive PII fields excluded - manual entry only (HIPAA compliance)
  // putAnswer(answers, 'header.recipientName', data.recipientName, data.recipientName ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.date', normalizeDateValue(data.date), data.date ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.time', normalizeTimeValue(data.time), data.time ? 'medium' : 'low', 'single-pass');
  // NOTE: recipientIdentifier excluded - manual entry only (PII)
  // putAnswer(answers, 'header.recipientIdentifier', data.recipientIdentifier, data.recipientIdentifier ? 'medium' : 'low', 'single-pass');
  // NOTE: DOB excluded - manual entry only (PII)
  // putAnswer(answers, 'header.dob', normalizeDateValue(data.dob), data.dob ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.location', data.location, data.location ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'careCoordinationType.sih', data.sih ? 'true' : 'false', data.sih ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'careCoordinationType.hcbw', data.hcbw ? 'true' : 'false', data.hcbw ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'narrative.recipientAndVisitObservations', data.recipientAndVisitObservations, narrativeConfidence(data.recipientAndVisitObservations), 'single-pass');
  putAnswer(answers, 'narrative.healthEmotionalStatus', data.healthEmotionalStatus, narrativeConfidence(data.healthEmotionalStatus), 'single-pass');
  putAnswer(answers, 'narrative.reviewOfServices', data.reviewOfServices, narrativeConfidence(data.reviewOfServices), 'single-pass');
  putAnswer(answers, 'narrative.progressTowardGoals', data.progressTowardGoals, narrativeConfidence(data.progressTowardGoals), 'single-pass');
  putAnswer(answers, 'narrative.followUpTasks', data.followUpTasks, narrativeConfidence(data.followUpTasks), 'single-pass');
  putAnswer(answers, 'narrative.additionalNotes', data.additionalNotes, narrativeConfidence(data.additionalNotes), 'single-pass');
  // NOTE: Signature fields excluded - manual entry only (authenticity)
  // putAnswer(answers, 'signature.careCoordinatorName', data.careCoordinatorName, data.careCoordinatorName ? 'medium' : 'low', 'single-pass');
  // putAnswer(answers, 'signature.dateSigned', normalizeDateValue(data.dateSigned), data.dateSigned ? 'medium' : 'low', 'single-pass');
  return answers;
}

function buildRepairFieldList(form: MonthlyCareCoordinationForm, answers: AnswerRecord, transcript: string): FieldPath[] {
  const fields = new Set<FieldPath>();

  for (const field of REQUIRED_FIELDS) {
    if (isFieldMissingOrInvalid(field, form)) {
      fields.add(field);
    }
  }

  for (const field of OPTIONAL_STRUCTURED_FIELDS) {
    if (isFieldMissingOrInvalid(field, form) && transcriptLikelyContainsField(transcript, field)) {
      fields.add(field);
    }
  }

  for (const field of NARRATIVE_FIELDS) {
    const answer = answers[field]?.answer || '';
    if (answer.trim().length < 80) {
      fields.add(field);
    }
  }

  return Array.from(fields);
}

function isFieldMissingOrInvalid(field: FieldPath, form: MonthlyCareCoordinationForm): boolean {
  const value = getFieldValue(form, field);
  if (field === 'header.date' || field === 'header.dob' || field === 'signature.dateSigned') {
    return !value || !isValidDateValue(value);
  }
  if (field === 'header.time') {
    return Boolean(value) && !isValidTimeValue(value);
  }
  return !value;
}

function transcriptLikelyContainsField(transcript: string, field: FieldPath): boolean {
  const question = getQuestionByFieldPath(field);
  if (!question) return false;
  const lowerTranscript = transcript.toLowerCase();
  return question.question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2)
    .some(token => lowerTranscript.includes(token));
}

function buildFormFromAnswers(answers: AnswerRecord, transcript: string): MonthlyCareCoordinationForm {
  const form = createEmptyForm();

  for (const [fieldPath, qaAnswer] of Object.entries(answers)) {
    applyAnswerToForm(form, fieldPath as FieldPath, qaAnswer.answer);
  }

  // Fallback: populate narrative fields from transcript if still empty
  const extractedSections = extractNarrativeSections(transcript);
  
  // Helper to get content or placeholder
  const getContent = (field: keyof typeof form.narrative): string => {
    const existing = form.narrative[field];
    if (existing && existing.trim().length > 10) return existing;
    
    const sectionKey = `narrative.${field}` as FieldPath;
    if (extractedSections[sectionKey]) return extractedSections[sectionKey]!;
    
    return '';
  };

  // Fill narrative fields with extracted content or placeholder
  const observations = getContent('recipientAndVisitObservations');
  form.narrative.recipientAndVisitObservations = observations || 'No information found in transcript.';
  
  const health = getContent('healthEmotionalStatus');
  form.narrative.healthEmotionalStatus = health || 'No information found in transcript.';
  
  const services = getContent('reviewOfServices');
  form.narrative.reviewOfServices = services || 'No information found in transcript.';
  
  const goals = getContent('progressTowardGoals');
  form.narrative.progressTowardGoals = goals || 'No information found in transcript.';
  
  const followUp = getContent('followUpTasks');
  form.narrative.followUpTasks = followUp || 'No information found in transcript.';
  
  // Additional notes gets remaining transcript content if empty
  if (!form.narrative.additionalNotes.trim()) {
    // Check if there's content that didn't fit in other fields
    const usedContent = [
      form.narrative.recipientAndVisitObservations,
      form.narrative.healthEmotionalStatus,
      form.narrative.reviewOfServices,
      form.narrative.progressTowardGoals,
      form.narrative.followUpTasks,
    ].join(' ');
    
    // If transcript has content not captured in other fields, add it here
    const remainingContent = transcript.substring(usedContent.length).trim();
    if (remainingContent.length > 50 && remainingContent !== usedContent) {
      form.narrative.additionalNotes = `Additional transcript content: ${remainingContent.substring(0, 1000)}`;
    } else {
      form.narrative.additionalNotes = 'No additional notes.';
    }
  }

  return form;
}

function applyAnswerToForm(form: MonthlyCareCoordinationForm, fieldPath: FieldPath, answer: string): void {
  const [section, field] = fieldPath.split('.') as [string, string];
  const question = getQuestionByFieldPath(fieldPath);
  const type = question?.type;

  if (section === 'careCoordinationType') {
    form.careCoordinationType[field as keyof typeof form.careCoordinationType] = answer.toLowerCase() === 'true';
    return;
  }

  if (section === 'header') {
    if (field === 'date' || field === 'dob') {
      form.header[field as keyof typeof form.header] = normalizeDateValue(answer);
    } else if (field === 'time') {
      form.header.time = normalizeTimeValue(answer);
    } else {
      form.header[field as keyof typeof form.header] = sanitizeString(answer);
    }
    return;
  }

  if (section === 'narrative') {
    form.narrative[field as keyof typeof form.narrative] = type === 'textarea' ? sanitizeString(answer, 2500) : sanitizeString(answer);
    return;
  }

  if (section === 'signature' && field !== 'signature') {
    if (field === 'dateSigned') {
      form.signature.dateSigned = normalizeDateValue(answer);
    } else {
      form.signature[field as keyof typeof form.signature] = sanitizeString(answer);
    }
  }
}

function finalizeAnswerRecord(answers: AnswerRecord, form: MonthlyCareCoordinationForm): AnswerRecord {
  const finalAnswers: AnswerRecord = { ...answers };

  for (const fieldPath of QUESTION_FIELD_PATHS) {
    const value = getFieldValue(form, fieldPath);
    const existing = finalAnswers[fieldPath];
    if (!existing) {
      finalAnswers[fieldPath] = {
        answer: value,
        confidence: hasAnswer(value) ? 'medium' : 'low',
      };
      continue;
    }

    finalAnswers[fieldPath] = {
      answer: value,
      confidence: hasAnswer(value) ? existing.confidence : 'low',
      source: existing.source,
    };
  }

  return finalAnswers;
}

function buildKeySections(form: MonthlyCareCoordinationForm, transcript: string): Record<string, string> {
  return {
    'Recipient & Visit Observations': form.narrative.recipientAndVisitObservations || transcript.substring(0, 800),
    'Health/Emotional Status': form.narrative.healthEmotionalStatus || transcript.substring(800, 1600),
    'Review of Services': form.narrative.reviewOfServices || transcript.substring(1600, 2400),
    'Progress Toward Goals': form.narrative.progressTowardGoals || transcript.substring(2400, 3200),
    'Follow-up Tasks': form.narrative.followUpTasks || transcript.substring(3200, 4000),
    'Additional Notes': form.narrative.additionalNotes || transcript.substring(4000, 4800),
  };
}

const ALL_FORM_FIELDS: FieldPath[] = [
  'header.recipientName',
  'header.date',
  'header.time',
  'header.recipientIdentifier',
  'header.dob',
  'header.location',
  'careCoordinationType.sih',
  'careCoordinationType.hcbw',
  'narrative.recipientAndVisitObservations',
  'narrative.healthEmotionalStatus',
  'narrative.reviewOfServices',
  'narrative.progressTowardGoals',
  'narrative.additionalNotes',
  'narrative.followUpTasks',
  'signature.careCoordinatorName',
  'signature.signature',
  'signature.dateSigned',
];

function buildConfidenceScores(_form: MonthlyCareCoordinationForm, answers: AnswerRecord): FieldConfidence[] {
  return buildConfidenceFromAnswers(ALL_FORM_FIELDS, answers);
}

function buildFallbackResult(transcript: string, deterministicAnswers: AnswerRecord): NarrativeQAResult {
  const fallbackAnswers = mergeAnswerRecords(deterministicAnswers, buildFallbackNarrativeAnswers(transcript), true);
  const form = buildFormFromAnswers(fallbackAnswers, transcript);

  return {
    form,
    confidence: buildConfidenceScores(form, fallbackAnswers),
    extractionMethod: 'ocr-only',
    ollamaAvailable: false,
    keySections: buildKeySections(form, transcript),
    qaAnswers: finalizeAnswerRecord(fallbackAnswers, form),
  };
}

function buildFallbackNarrativeAnswers(transcript: string): AnswerRecord {
  return {
    'narrative.recipientAndVisitObservations': {
      answer: transcript.substring(0, 800),
      confidence: 'low',
      source: 'fallback: transcript chunk',
    },
    'narrative.healthEmotionalStatus': {
      answer: transcript.substring(800, 1600),
      confidence: 'low',
      source: 'fallback: transcript chunk',
    },
    'narrative.reviewOfServices': {
      answer: transcript.substring(1600, 2400),
      confidence: 'low',
      source: 'fallback: transcript chunk',
    },
    'narrative.progressTowardGoals': {
      answer: transcript.substring(2400, 3200),
      confidence: 'low',
      source: 'fallback: transcript chunk',
    },
    'narrative.followUpTasks': {
      answer: transcript.substring(3200, 4000),
      confidence: 'low',
      source: 'fallback: transcript chunk',
    },
    'narrative.additionalNotes': {
      answer: transcript.substring(4000, 5200) || transcript.substring(0, 1200),
      confidence: 'low',
      source: 'fallback: transcript chunk',
    },
  };
}

function mergeAnswerRecords(base: AnswerRecord, incoming: AnswerRecord, preferIncoming = true): AnswerRecord {
  const merged: AnswerRecord = { ...base };

  for (const [fieldPath, answer] of Object.entries(incoming)) {
    if (!answer) continue;

    const existing = merged[fieldPath];
    if (!existing) {
      merged[fieldPath] = answer;
      continue;
    }

    const existingHasValue = hasAnswer(existing.answer);
    const incomingHasValue = hasAnswer(answer.answer);

    // If incoming has value and existing doesn't, use incoming
    if (!existingHasValue && incomingHasValue) {
      merged[fieldPath] = answer;
      continue;
    }

    // If incoming doesn't have value, keep existing
    if (!incomingHasValue) {
      continue;
    }

    // Both have values - use confidence ranking or preferIncoming flag
    // AI-generated answers (medium/high confidence) should generally beat deterministic guesses
    if (preferIncoming || rankConfidence(answer.confidence) > rankConfidence(existing.confidence)) {
      merged[fieldPath] = answer;
    }
  }

  return merged;
}

function putAnswer(
  answers: AnswerRecord,
  fieldPath: string,
  answer: string,
  confidence: QAAnswer['confidence'],
  source?: string
): void {
  const normalizedAnswer = normalizeAnswerValue(fieldPath as FieldPath, answer);
  if (!hasAnswer(normalizedAnswer) && !isCheckboxField(fieldPath)) {
    return;
  }

  answers[fieldPath] = {
    answer: normalizedAnswer,
    confidence,
    source: source ? truncate(source, 180) : undefined,
  };
}

function normalizeAnswerValue(fieldPath: FieldPath, value: string): string {
  if (fieldPath === 'header.date' || fieldPath === 'header.dob' || fieldPath === 'signature.dateSigned') {
    return normalizeDateValue(value);
  }
  if (fieldPath === 'header.time') {
    return normalizeTimeValue(value);
  }
  if (isCheckboxField(fieldPath)) {
    return value.toLowerCase() === 'true' ? 'true' : 'false';
  }
  return sanitizeString(value, fieldPath.startsWith('narrative.') ? 3000 : 200);
}

function getFieldValue(form: MonthlyCareCoordinationForm, fieldPath: FieldPath): string {
  const [section, field] = fieldPath.split('.') as [string, string];

  if (section === 'careCoordinationType') {
    return form.careCoordinationType[field as keyof typeof form.careCoordinationType] ? 'true' : 'false';
  }

  if (section === 'header') {
    return String(form.header[field as keyof typeof form.header] || '');
  }

  if (section === 'narrative') {
    return String(form.narrative[field as keyof typeof form.narrative] || '');
  }

  return String(form.signature[field as keyof typeof form.signature] || '');
}

function extractNarrativeSections(transcript: string): Partial<Record<FieldPath, string>> {
  const sections: Partial<Record<FieldPath, string>> = {};
  const lowerTranscript = transcript.toLowerCase();
  
  // Split transcript into sentences for better processing
  const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
  
  // Track which sentences have been assigned to sections
  const assignedSentences = new Set<number>();
  
  // Priority order for section extraction
  const sectionDefinitions: Array<{
    field: FieldPath;
    keywords: string[];
    description: string;
  }> = [
    {
      field: 'narrative.recipientAndVisitObservations',
      keywords: ['recipient & visit observations', 'recipient and visit observations', 'visit observations', 'cc met with', 'care coordinator met', 'the client presented', 'client was', 'client appeared', 'support staff were present', 'during the visit', 'the visit concluded', 'home environment', 'home condition'],
      description: 'visit observations'
    },
    {
      field: 'narrative.healthEmotionalStatus',
      keywords: ['health/emotional status', 'health status', 'medication', 'medication adjustment', 'doctor', 'physician', 'hospital', 'fall', 'pain', 'behavior', 'emotional', 'mood', 'sleep', 'appetite', 'weight', 'blood pressure', 'feeling well', 'sleep has improved', 'health', 'diagnosis', 'symptom', 'vital signs'],
      description: 'health status'
    },
    {
      field: 'narrative.reviewOfServices',
      keywords: ['review of services', 'services review', 'services being provided', 'residential', 'supported employment', 'day habilitation', 'personal care', 'aide', 'nursing', 'therapy', 'provider', 'contracted providers', 'transportation', 'service hours'],
      description: 'services review'
    },
    {
      field: 'narrative.progressTowardGoals',
      keywords: ['progress toward goals', 'goal progress', 'progress toward', 'barrier to', 'independence', 'skill development', 'achieving', 'positive reinforcement', 'cooperate with staff', 'manage interpersonal', 'care plan goal'],
      description: 'goals progress'
    },
    {
      field: 'narrative.followUpTasks',
      keywords: ['follow up tasks', 'follow-up tasks', 'care coordinator follow up', 'follow-up needed', 'coordinator will', 'next visit', 'schedule appointment', 'referral', 'arrange', 'future visit was discussed'],
      description: 'follow-up tasks'
    },
  ];
  
  // Extract content for each section
  for (const sectionDef of sectionDefinitions) {
    const matchingSentences: string[] = [];
    
    for (let i = 0; i < sentences.length; i++) {
      if (assignedSentences.has(i)) continue; // Skip already assigned sentences
      
      const sentence = sentences[i];
      const lowerSentence = sentence.toLowerCase();
      
      // Check if sentence contains keywords for this section
      const matches = sectionDef.keywords.some(keyword => lowerSentence.includes(keyword));
      
      if (matches) {
        matchingSentences.push(sentence.trim());
        assignedSentences.add(i);
      }
    }
    
    if (matchingSentences.length > 0) {
      sections[sectionDef.field] = matchingSentences.join(' ').substring(0, 3000);
    }
  }
  
  // Additional Notes: collect remaining unassigned sentences
  const remainingSentences: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (!assignedSentences.has(i)) {
      remainingSentences.push(sentences[i].trim());
    }
  }
  
  if (remainingSentences.length > 0) {
    sections['narrative.additionalNotes'] = remainingSentences.join(' ').substring(0, 3000);
  }

  return sections;
}

function normalizeTranscript(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function sanitizeString(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  
  // Try to find sentence boundary first
  const truncated = cleaned.substring(0, maxLength);
  
  // Look for sentence-ending punctuation followed by space or end of string
  const sentenceEndMatch = truncated.match(/.*[.!?]+(?:\s|$)/);
  if (sentenceEndMatch && sentenceEndMatch[0].length > maxLength * 0.5) {
    return sentenceEndMatch[0].trim();
  }
  
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace);
  }
  
  return truncated;
}

// Use shared DateTime utilities
function normalizeDateValue(value: string): string {
  return DateTimeUtils.normalizeDate(value);
}

function normalizeTimeValue(value: string): string {
  return DateTimeUtils.normalizeTime(value);
}

function isValidDateValue(value: string): boolean {
  return DateTimeUtils.isValidDate(value);
}

function isValidTimeValue(value: string): boolean {
  return DateTimeUtils.isValidTime(value);
}

function hasAnswer(value: string): boolean {
  return Boolean(value && value.trim());
}

function isCheckboxField(fieldPath: string): boolean {
  return fieldPath.startsWith('careCoordinationType.');
}

function rankConfidence(confidence: QAAnswer['confidence']): number {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function narrativeConfidence(value: string): QAAnswer['confidence'] {
  return value.length > 80 ? 'high' : value.length > 20 ? 'medium' : 'low';
}

function inferLocation(transcript: string): string {
  const lowerTranscript = transcript.toLowerCase();
  if (lowerTranscript.includes('phone') || lowerTranscript.includes('call')) return 'Phone';
  if (lowerTranscript.includes('home')) return 'Home';
  if (lowerTranscript.includes('facility') || lowerTranscript.includes('site')) return 'Facility';
  if (lowerTranscript.includes('office')) return 'Office';
  return '';
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

// Use shared DateTime utilities
function parseWrittenDate(dateStr: string): string | null {
  return DateTimeUtils.parseWrittenDate(dateStr);
}
