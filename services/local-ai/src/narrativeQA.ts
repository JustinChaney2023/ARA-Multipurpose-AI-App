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
import { logger, createProgressTracker } from './logger.js';
import { checkOllamaHealth } from './ollama.js';
import { setModelBusy } from './warmup.js';
import { DEFAULT_MODEL, OLLAMA_BASE_URL, getModelOptions } from './modelConfig.js';
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

const REQUIRED_FIELDS: FieldPath[] = ['header.recipientName', 'header.date'];
const OPTIONAL_STRUCTURED_FIELDS: FieldPath[] = [
  'header.time',
  'header.recipientIdentifier',
  'header.dob',
  'header.location',
  'signature.careCoordinatorName',
  'signature.dateSigned',
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
    const ollamaAvailable = await checkOllamaHealth();
    if (!ollamaAvailable) {
      logger.warn('Ollama not available, using deterministic fallback');
      return buildFallbackResult(cleanedTranscript, deterministicAnswers);
    }

    progress.update(15, 'Running deterministic prefill');
    onProgress?.('prefill', 15);

    let mergedAnswers: AnswerRecord = { ...deterministicAnswers };
    let usedRepair = false;

    try {
      progress.update(35, 'Extracting form data in one AI pass');
      onProgress?.('extracting', 35);

      // Limit transcript to 4000 chars for faster processing
      const extractedData = await extractAllFields(cleanedTranscript.substring(0, 4000));
      const extractedAnswers = buildAnswersFromExtractedData(extractedData);
      
      // Log what the AI extracted for debugging
      logger.info('AI extraction completed', {
        hasRecipientName: !!extractedData.recipientName,
        hasDate: !!extractedData.date,
        hasObservations: extractedData.recipientAndVisitObservations?.length > 20,
        hasHealthStatus: extractedData.healthEmotionalStatus?.length > 20,
      });
      
      mergedAnswers = mergeAnswerRecords(mergedAnswers, extractedAnswers, true); // prefer AI answers
    } catch (error) {
      logger.warn('Single-pass extraction failed, switching to question repair', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      usedRepair = true;
    }

    let form = buildFormFromAnswers(mergedAnswers, cleanedTranscript);
    
    // Skip repair step if we have good data from initial extraction
    // This saves significant time (repair can take 30-60 seconds)
    const repairFields = buildRepairFieldList(form, mergedAnswers, cleanedTranscript);
    const needsRepair = repairFields.filter(f => 
      f === 'header.recipientName' || f === 'header.date' || 
      (f.startsWith('narrative.') && form.narrative[f.split('.')[1] as keyof typeof form.narrative]?.length < 30)
    );

    // Only repair if critical fields are missing or narrative fields are very short
    if (needsRepair.length > 0 && needsRepair.length <= 3) {
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
  // Split extraction into 2 smaller prompts for better 0.5B model performance
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

  // Prompt 1: Header fields only (simpler)
  const headerResult = await extractHeaderFields(transcript);
  
  // Prompt 2: Narrative fields only
  const narrativeResult = await extractNarrativeFields(transcript);

  return {
    ...defaults,
    ...headerResult,
    ...narrativeResult,
  };
}

async function extractHeaderFields(transcript: string): Promise<Partial<ExtractedData>> {
  const systemPrompt = `Extract header info from notes. Return JSON.`;

  const userPrompt = `Extract from notes:
${transcript}

JSON:
{
  "recipientName": "",
  "date": "",
  "time": "",
  "recipientIdentifier": "",
  "dob": "",
  "location": "",
  "sih": false,
  "hcbw": false,
  "careCoordinatorName": "",
  "dateSigned": ""
}`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: {
          ...getModelOptions(false),
          num_predict: 500,
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) return {};

    const data = await response.json();
    const raw = data.response?.trim() || '';
    
    const parsed = parsePartialData(raw);
    return {
      recipientName: parsed.recipientName || '',
      date: parsed.date || '',
      time: parsed.time || '',
      recipientIdentifier: parsed.recipientIdentifier || '',
      dob: parsed.dob || '',
      location: parsed.location || '',
      sih: parsed.sih === true,
      hcbw: parsed.hcbw === true,
      careCoordinatorName: parsed.careCoordinatorName || '',
      dateSigned: parsed.dateSigned || '',
    };
  } catch (e) {
    logger.warn('Header extraction failed', { error: (e as Error).message });
    return {};
  }
}

async function extractNarrativeFields(transcript: string): Promise<Partial<ExtractedData>> {
  const systemPrompt = `Extract narrative from notes. Copy sentences into correct field. Return JSON.`;

  const userPrompt = `Organize this note:
${transcript}

Put sentences in correct field:
- Observations: incidents, appearance, behavior
- Health: health problems, injuries, mood
- Services: services, staff
- Goals: progress, cooperation
- FollowUp: appointments, tasks
- Additional: other

JSON:
{
  "recipientAndVisitObservations": "",
  "healthEmotionalStatus": "",
  "reviewOfServices": "",
  "progressTowardGoals": "",
  "followUpTasks": "",
  "additionalNotes": ""
}`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        system: systemPrompt,
        prompt: userPrompt,
        stream: false,
        options: {
          ...getModelOptions(false),
          num_predict: 1500,
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) return {};

    const data = await response.json();
    const raw = data.response?.trim() || '';
    
    const parsed = parsePartialData(raw);
    return {
      recipientAndVisitObservations: parsed.recipientAndVisitObservations || '',
      healthEmotionalStatus: parsed.healthEmotionalStatus || '',
      reviewOfServices: parsed.reviewOfServices || '',
      progressTowardGoals: parsed.progressTowardGoals || '',
      followUpTasks: parsed.followUpTasks || '',
      additionalNotes: parsed.additionalNotes || '',
    };
  } catch (e) {
    logger.warn('Narrative extraction failed', { error: (e as Error).message });
    return {};
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

function parseExtractedData(raw: string): ExtractedData {
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

    const parsed = JSON.parse(json) as Partial<ExtractedData>;
    return {
      recipientName: sanitizeString(parsed.recipientName),
      date: sanitizeString(parsed.date),
      time: sanitizeString(parsed.time),
      recipientIdentifier: sanitizeString(parsed.recipientIdentifier),
      dob: sanitizeString(parsed.dob),
      location: sanitizeString(parsed.location),
      sih: parsed.sih === true,
      hcbw: parsed.hcbw === true,
      recipientAndVisitObservations: sanitizeString(parsed.recipientAndVisitObservations, 3000),
      healthEmotionalStatus: sanitizeString(parsed.healthEmotionalStatus, 3000),
      reviewOfServices: sanitizeString(parsed.reviewOfServices, 3000),
      progressTowardGoals: sanitizeString(parsed.progressTowardGoals, 3000),
      followUpTasks: sanitizeString(parsed.followUpTasks, 3000),
      additionalNotes: sanitizeString(parsed.additionalNotes, 3000),
      careCoordinatorName: sanitizeString(parsed.careCoordinatorName),
      dateSigned: sanitizeString(parsed.dateSigned),
    };
  } catch (error) {
    throw new Error(`Single-pass JSON parse failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function extractDeterministicAnswers(transcript: string): AnswerRecord {
  const answers: AnswerRecord = {};
  const lines = transcript.split('\n').map(line => line.trim()).filter(Boolean);
  const fullText = transcript;

  // Extract name - comprehensive patterns for caregiver notes
  // Covers many edge cases: "[Name] was seen", "Client is [Name]", "visit with [Name]", etc.
  if (!answers['header.recipientName']) {
    const namePatterns = [
      // Pattern 1: Name at start of sentence followed by action verb
      // "Eleanor Mae Whitaker was seen..." / "Eleanor Whitaker is a..." / "Eleanor was visited..."
      /^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\s+(?:was seen|is a|was visited|was contacted|was present|is\s+(?:the\s+)?(?:client|recipient|patient))/im,
      
      // Pattern 2: Explicit label with name
      // "Client is Eleanor Mae Whitaker" / "Recipient name: Eleanor Whitaker" / "Name - Eleanor Whitaker"
      /(?:client|recipient|patient|member)\s+(?:is|name)[:\-\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})/i,
      /(?:recipient\s+name|client\s+name|name)[:\-\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/i,
      
      // Pattern 3: Action + with + Name (various visit/contact formats)
      // "visit with Eleanor Mae Whitaker" / "CC met with Eleanor Whitaker" / "contact with Eleanor"
      /(?:visit|met|completed|conducted|had\s+a|made\s+a|follow-up|followup|check-in|check\s+in)\s+(?:a\s+)?(?:scheduled\s+)?(?:routine\s+)?(?:in-person\s+)?(?:phone\s+)?(?:SIH\s+)?(?:\/\s+HCBW\s+)?(?:monitoring\s+)?(?:care\s+coordination\s+)?(?:visit|contact|call|check)?\s*(?:with|on)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})/i,
      
      // Pattern 4: CC/Care Coordinator action
      // "CC met with Eleanor Whitaker" / "Care Coordinator spoke with Eleanor" / "CC completed visit with Eleanor"
      /(?:CC|care\s+coordinator|coordinator|worker|case\s+manager)\s+(?:met|spoke|completed|conducted|visited|saw|checked\s+in)\s+(?:with|on)?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})/i,
      
      // Pattern 5: Name followed by DOB/ID/Date markers (Name appears before these identifiers)
      // "Eleanor Mae Whitaker DOB: 08/04/1948" / "Eleanor Whitaker ID: 58421793" / "Eleanor Whitaker on March 12"
      /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\s+(?:DOB|Date\s+of\s+Birth|ID|Member\s*ID|Date|DOB\s+on\s+file)/i,
      
      // Pattern 6: Title + Name (Ms./Mr./Mrs.)
      // Note: This only captures last name, so we prefer other patterns. Use only if no other match.
      // "Ms. Whitaker was seen..." - will try to find full name elsewhere
      /(?:Ms|Mr|Mrs|Miss)\.?\s+([A-Z][a-zA-Z]+)\s+(?:was|is|reported)/i,
      
      // Pattern 7: Name in parenthetical or after comma
      // "Client (Eleanor Whitaker) was..." / "Recipient, Eleanor Mae Whitaker, was..."
      /(?:client|recipient|patient)\s*[\(\,]\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\s*[\)\,]/i,
      
      // Pattern 8: Name at end of sentence ("...with Ms. Eleanor Whitaker.")
      /(?:with|saw|visited)\s+(?:Ms|Mr|Mrs|Miss)?\.?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})[\.\,]/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match) {
        let name = match[1].trim();
        
        // Clean up the name - remove common false positives
        const narrativeWords = ['met', 'with', 'the', 'was', 'were', 'her', 'his', 'she', 'he', 'they', 'present', 'setting', 'care', 'coordinator', 'client', 'recipient'];
        
        // Validate name format
        // Allow: letters, spaces, hyphens (O'Connor, Mary-Jane), apostrophes, periods (for initials)
        // Reject: all lowercase, all uppercase, contains narrative words
        const isValidFormat = /^[A-Za-z][a-zA-Z\-\s'\.]+$/.test(name);
        const hasNarrativeWord = narrativeWords.some(w => name.toLowerCase().split(/\s+/).includes(w));
        const reasonableLength = name.length > 2 && name.length < 50;
        const hasCapitalLetters = /[A-Z]/.test(name);
        const notJustTitle = !/^(Ms|Mr|Mrs|Miss|Dr)$/i.test(name);
        
        if (isValidFormat && !hasNarrativeWord && reasonableLength && hasCapitalLetters && notJustTitle) {
          // Clean up any trailing punctuation
          name = name.replace(/[\,\.\;\:]$/, '');
          putAnswer(answers, 'header.recipientName', name, 'high', `deterministic: name pattern`);
          break;
        }
      }
    }
  }
  
  // Fallback: Look for capitalized name in first sentence if no match yet
  // Pattern: "On March 12, Eleanor Mae Whitaker..." or just "Eleanor Whitaker ..." at start
  if (!answers['header.recipientName']) {
    // Get first sentence
    const firstSentence = fullText.match(/^[^.!?]+[.!?]/);
    if (firstSentence) {
      // Look for First Last pattern (2-3 capitalized words)
      const nameMatch = firstSentence[0].match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,2})\b/);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        // Only reject obviously invalid words, allow names like "June"
        const invalidWords = ['Care', 'Coordinator', 'Client', 'Recipient', 'Senior', 'Home', 'Community', 'Waiver', 'Services'];
        if (!invalidWords.includes(name) && name.length > 3 && name.length < 40) {
          putAnswer(answers, 'header.recipientName', name, 'medium', `deterministic: first sentence fallback`);
        }
      }
    }
  }
  
  // Special handling for single-name cases like "June was seen..."
  // Check if a single word (potential first name) appears before action verbs
  if (!answers['header.recipientName']) {
    const singleNameMatch = fullText.match(/^([A-Z][a-z]{2,20})\s+(?:was|is|has been|appeared|presented|arrived)/im);
    if (singleNameMatch) {
      const name = singleNameMatch[1];
      // Don't match months when they appear with date patterns like "June 12"
      const isLikelyMonth = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(fullText.substring(0, 50));
      const isValidName = !['Care', 'Client', 'Recipient', 'Coordinator', 'Senior', 'Home', 'Community', 'The', 'This'].includes(name);
      
      if (isValidName && (!isLikelyMonth || name.length > 4)) {
        putAnswer(answers, 'header.recipientName', name, 'medium', `deterministic: single name pattern`);
      }
    }
  }

  // Extract ID from full text (not just line by line) - handles "Recipient ID 58421793" anywhere in text
  if (!answers['header.recipientIdentifier']) {
    const idPatterns = [
      /(?:recipient|client)\s+id\s*[:#\-]?\s*([A-Za-z0-9\-]{5,})/i,
      /\bid\s*(?:number|#)?\s*[:#\-]?\s*([0-9]{5,})/i,
      /\bid#([A-Za-z0-9]{5,})/i,
    ];
    for (const pattern of idPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        putAnswer(answers, 'header.recipientIdentifier', match[1].trim(), 'high', `deterministic: ID pattern`);
        break;
      }
    }
  }

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Date - support written months like "March 12, 2026" or numeric dates
    if (!answers['header.date']) {
      // Written month format: March 12, 2026
      const writtenDateMatch = line.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
      if (writtenDateMatch) {
        const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const month = String(monthNames.indexOf(writtenDateMatch[1].toLowerCase()) + 1).padStart(2, '0');
        const day = writtenDateMatch[2].padStart(2, '0');
        const year = writtenDateMatch[3];
        putAnswer(answers, 'header.date', `${month}/${day}/${year}`, 'high', `deterministic: ${line}`);
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

    // Care Coordinator name - look for "CC" or "Care Coordinator" mentions
    if (!answers['signature.careCoordinatorName']) {
      const coordinatorMatch = line.match(/(?:cc|care coordinator|coordinator)\s+(?:met|visited|reviewed|spoke)/i);
      if (coordinatorMatch) {
        // CC is mentioned but no name given - that's ok, we'll leave it blank
      }
    }

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

  if (!answers['signature.dateSigned'] && answers['header.date']?.answer) {
    putAnswer(answers, 'signature.dateSigned', answers['header.date'].answer, 'medium', 'deterministic: derived from visit date');
  }

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
  putAnswer(answers, 'header.recipientName', data.recipientName, data.recipientName ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.date', normalizeDateValue(data.date), data.date ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.time', normalizeTimeValue(data.time), data.time ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.recipientIdentifier', data.recipientIdentifier, data.recipientIdentifier ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.dob', normalizeDateValue(data.dob), data.dob ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'header.location', data.location, data.location ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'careCoordinationType.sih', data.sih ? 'true' : 'false', data.sih ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'careCoordinationType.hcbw', data.hcbw ? 'true' : 'false', data.hcbw ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'narrative.recipientAndVisitObservations', data.recipientAndVisitObservations, narrativeConfidence(data.recipientAndVisitObservations), 'single-pass');
  putAnswer(answers, 'narrative.healthEmotionalStatus', data.healthEmotionalStatus, narrativeConfidence(data.healthEmotionalStatus), 'single-pass');
  putAnswer(answers, 'narrative.reviewOfServices', data.reviewOfServices, narrativeConfidence(data.reviewOfServices), 'single-pass');
  putAnswer(answers, 'narrative.progressTowardGoals', data.progressTowardGoals, narrativeConfidence(data.progressTowardGoals), 'single-pass');
  putAnswer(answers, 'narrative.followUpTasks', data.followUpTasks, narrativeConfidence(data.followUpTasks), 'single-pass');
  putAnswer(answers, 'narrative.additionalNotes', data.additionalNotes, narrativeConfidence(data.additionalNotes), 'single-pass');
  putAnswer(answers, 'signature.careCoordinatorName', data.careCoordinatorName, data.careCoordinatorName ? 'medium' : 'low', 'single-pass');
  putAnswer(answers, 'signature.dateSigned', normalizeDateValue(data.dateSigned), data.dateSigned ? 'medium' : 'low', 'single-pass');
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
    if (answer.trim().length < 20) {
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

  // Default signature date to visit date if not set
  if (!form.signature.dateSigned && form.header.date) {
    form.signature.dateSigned = form.header.date;
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

function buildConfidenceScores(form: MonthlyCareCoordinationForm, answers: AnswerRecord): FieldConfidence[] {
  const confidence: FieldConfidence[] = [];
  const allFields: FieldPath[] = [
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

  for (const field of allFields) {
    const value = getFieldValue(form, field);
    const answer = answers[field];

    confidence.push({
      field,
      confidence: answer?.confidence || (hasAnswer(value) ? 'medium' : 'low'),
      ocrConfidence: 100,
      source: answer?.source || 'hybrid-fill',
    });
  }

  return confidence;
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
      keywords: ['recipient & visit observations', 'recipient and visit observations', 'visit observations', 'cc met with', 'care coordinator met', 'the client presented', 'client was', 'client appeared', 'support staff were present', 'during the visit', 'the visit concluded'],
      description: 'visit observations'
    },
    {
      field: 'narrative.healthEmotionalStatus',
      keywords: ['health/emotional status', 'health status', 'medication', 'medication adjustment', 'doctor', 'physician', 'hospital', 'fall', 'pain', 'behavior', 'emotional', 'mood', 'sleep', 'appetite', 'weight', 'blood pressure', 'feeling well', 'sleep has improved', 'health'],
      description: 'health status'
    },
    {
      field: 'narrative.reviewOfServices',
      keywords: ['review of services', 'services review', 'services being provided', 'residential', 'supported employment', 'day habilitation', 'caregiver', 'aide', 'nursing', 'therapy', 'service', 'provider', 'staff', 'contracted providers'],
      description: 'services review'
    },
    {
      field: 'narrative.progressTowardGoals',
      keywords: ['progress toward goals', 'goals', 'goal progress', 'progress', 'barrier', 'independence', 'skill', 'improving', 'achieving', 'positive reinforcement', 'doing well', 'cooperate with staff', 'manage interpersonal'],
      description: 'goals progress'
    },
    {
      field: 'narrative.followUpTasks',
      keywords: ['follow up tasks', 'follow-up tasks', 'care coordinator follow up', 'follow-up needed', 'coordinator will', 'schedule', 'appointment', 'referral', 'call', 'contact', 'arrange', 'order', 'future visit was discussed'],
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
      const matches = sectionDef.keywords.some(keyword => lowerSentence.includes(keyword.toLowerCase()));
      
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
