import { 
  createEmptyForm, 
  validateForm,
  safeValidateForm,
  type MonthlyCareCoordinationForm,
  type FieldConfidence,
  type ConfidenceLevel,
  FieldPath,
} from '@ara/shared';
import { generateFormWithLLM, checkOllamaHealth, markLLMFailed, isMultimodalModel } from './ollama.js';
import { categorizeAndValidateWithLLM } from './llmCategorizer.js';
import { logger, createProgressTracker } from './logger.js';

export interface ParseResult {
  form: MonthlyCareCoordinationForm;
  confidence: FieldConfidence[];
  extractionMethod: 'ocr-only' | 'llm-structured' | 'llm-categorized' | 'vision-llm' | 'manual';
  ollamaAvailable: boolean;
  validationIssues?: string[];
}

/**
 * Parse form data from extracted OCR text
 * Pipeline: OCR Text -> LLM Categorization -> Validation -> Form
 */
export async function parseFormFromText(
  text: string,
  ocrConfidence: number,
  imagePath?: string
): Promise<ParseResult> {
  const progress = createProgressTracker('PARSER');
  progress.start('Starting form extraction pipeline');
  
  progress.update(10, 'Checking Ollama availability');
  const ollamaAvailable = await checkOllamaHealth();
  const useVision = imagePath && await isMultimodalModel();
  
  logger.info('Parser configuration', { 
    ollamaAvailable, 
    useVision, 
    ocrConfidence,
    textLength: text.length,
    hasImage: !!imagePath
  });
  
  // Priority 1: Vision LLM for poor handwriting on images
  if (ollamaAvailable && useVision && imagePath && ocrConfidence < 50) {
    try {
      progress.update(20, 'Low OCR confidence - using Vision LLM');
      const result = await parseWithVisionLLM(imagePath, text, ocrConfidence, progress);
      progress.complete('Vision LLM extraction complete');
      return result;
    } catch (error) {
      logger.warn('Vision LLM failed, trying LLM categorizer', { error });
    }
  }
  
  // Priority 2: LLM Categorization for better accuracy
  if (ollamaAvailable && ocrConfidence < 80) {
    try {
      progress.update(25, 'Using LLM for intelligent categorization');
      const result = await parseWithLLMCategorizer(text, ocrConfidence, progress);
      progress.complete('LLM categorization complete');
      return result;
    } catch (error) {
      progress.update(50, 'LLM categorizer failed, falling back');
      logger.warn('LLM categorizer failed', { error });
      if (error instanceof Error && error.name === 'TimeoutError') {
        markLLMFailed();
      }
    }
  }
  
  // Priority 3: Standard LLM text structuring
  if (ollamaAvailable) {
    try {
      progress.update(30, 'Using standard LLM structuring');
      const result = await parseWithLLM(text, ocrConfidence, progress);
      progress.complete('LLM extraction complete');
      return result;
    } catch (error) {
      progress.update(50, 'LLM failed, falling back to rule-based parsing');
      logger.warn('LLM parsing failed', { error });
      if (error instanceof Error && error.name === 'TimeoutError') {
        markLLMFailed();
      }
    }
  } else {
    progress.update(30, 'Ollama not available, using rule-based parsing');
  }
  
  // Fallback: Rule-based parsing
  const result = await parseWithRules(text, ocrConfidence, ollamaAvailable, progress);
  progress.complete('Rule-based extraction complete');
  return result;
}

/**
 * NEW: Parse using LLM Categorizer (two-step: categorize + validate)
 */
async function parseWithLLMCategorizer(
  text: string,
  ocrConfidence: number,
  progress: ReturnType<typeof createProgressTracker>
): Promise<ParseResult> {
  progress.update(30, 'Sending to LLM categorizer');
  
  const startTime = Date.now();
  const categorized = await categorizeAndValidateWithLLM(text, ocrConfidence);
  const duration = Date.now() - startTime;
  
  progress.update(80, `Categorization complete (${duration}ms)`);
  
  // Validate the form structure
  const validation = safeValidateForm(categorized.form);
  
  if (!validation.success) {
    throw new Error(`Categorized form validation failed: ${validation.error.message}`);
  }
  
  const confidence = generateConfidenceScores(validation.data, ocrConfidence, 'llm-categorized');
  
  logger.info('LLM categorization successful', {
    duration,
    validationIssues: categorized.validationNotes.length,
    fieldsExtracted: Object.keys(validation.data).length
  });
  
  return {
    form: validation.data,
    confidence,
    extractionMethod: 'llm-categorized',
    ollamaAvailable: true,
    validationIssues: categorized.validationNotes.length > 0 ? categorized.validationNotes : undefined
  };
}

/**
 * Parse using multimodal/vision LLM (for handwriting)
 */
async function parseWithVisionLLM(
  imagePath: string, 
  ocrText: string, 
  ocrConfidence: number,
  progress: ReturnType<typeof createProgressTracker>
): Promise<ParseResult> {
  logger.info('Using vision LLM for handwriting recognition', { imagePath });
  progress.update(40, 'Sending image to vision LLM');
  
  const startTime = Date.now();
  const llmResponse = await generateFormWithLLM(ocrText, imagePath);
  const duration = Date.now() - startTime;
  
  progress.update(80, `Received LLM response (${duration}ms)`);
  logger.debug('Vision LLM raw response', { 
    responseLength: llmResponse.length,
    duration
  });
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(llmResponse);
  } catch {
    const match = llmResponse.match(/```json\n?([\s\S]*?)\n?```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      throw new Error('Invalid JSON from vision LLM');
    }
  }
  
  progress.update(90, 'Validating LLM output');
  const validation = safeValidateForm(parsed);
  
  if (!validation.success) {
    throw new Error(`Vision LLM output validation failed: ${validation.error.message}`);
  }
  
  const confidence = generateConfidenceScores(validation.data, ocrConfidence, 'vision-llm');
  
  logger.info('Vision LLM extraction successful', {
    fields: Object.keys(validation.data).length
  });
  
  return {
    form: validation.data,
    confidence,
    extractionMethod: 'vision-llm',
    ollamaAvailable: true,
  };
}

/**
 * Parse using Ollama LLM (standard text structuring)
 */
async function parseWithLLM(
  text: string, 
  ocrConfidence: number,
  progress: ReturnType<typeof createProgressTracker>
): Promise<ParseResult> {
  progress.update(40, 'Sending text to LLM for structuring');
  
  const startTime = Date.now();
  const llmResponse = await generateFormWithLLM(text);
  const duration = Date.now() - startTime;
  
  progress.update(80, `Received LLM response (${duration}ms)`);
  logger.debug('LLM raw response', { 
    responseLength: llmResponse.length,
    duration
  });
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(llmResponse);
  } catch {
    const match = llmResponse.match(/```json\n?([\s\S]*?)\n?```/);
    if (match) {
      parsed = JSON.parse(match[1]);
    } else {
      throw new Error('Invalid JSON from LLM');
    }
  }
  
  progress.update(90, 'Validating LLM output');
  const validation = safeValidateForm(parsed);
  
  if (!validation.success) {
    throw new Error(`LLM output validation failed: ${validation.error.message}`);
  }
  
  const confidence = generateConfidenceScores(validation.data, ocrConfidence, 'llm-structured');
  
  logger.info('LLM extraction successful', {
    fields: Object.keys(validation.data).length
  });
  
  return {
    form: validation.data,
    confidence,
    extractionMethod: 'llm-structured',
    ollamaAvailable: true,
  };
}

/**
 * Parse using rule-based extraction (OCR-only mode)
 */
async function parseWithRules(
  text: string, 
  ocrConfidence: number,
  ollamaAvailable: boolean,
  progress: ReturnType<typeof createProgressTracker>
): Promise<ParseResult> {
  progress.update(60, 'Running pattern matching on OCR text');
  
  const form = createEmptyForm();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const notes: string[] = [];
  
  logger.debug('Starting rule-based parsing', { lineCount: lines.length });
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    if (i % 10 === 0) {
      const percent = 60 + Math.floor((i / lines.length) * 30);
      progress.update(percent, `Processing line ${i + 1} of ${lines.length}`);
    }
    
    // Header fields pattern matching
    if (lowerLine.includes('recipient name') || lowerLine.match(/\bname\s*:/)) {
      const match = line.match(/(?:recipient name|name)\s*[:\-]?\s*(.+)/i);
      if (match) form.header.recipientName = match[1].trim();
    }
    
    if (lowerLine.includes('date') && !lowerLine.includes('birth')) {
      const match = line.match(/date\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
      if (match) form.header.date = match[1].trim();
    }
    
    if (lowerLine.includes('time')) {
      const match = line.match(/time\s*[:\-]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
      if (match) form.header.time = match[1].trim();
    }
    
    if (lowerLine.includes('dob') || lowerLine.includes('date of birth')) {
      const match = line.match(/(?:dob|date of birth)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
      if (match) form.header.dob = match[1].trim();
    }
    
    if (lowerLine.includes('location')) {
      const match = line.match(/location\s*[:\-]?\s*(.+)/i);
      if (match) form.header.location = match[1].trim();
    }
    
    if (lowerLine.includes('identifier') || lowerLine.includes('id')) {
      const match = line.match(/(?:recipient identifier|identifier|id)\s*[:\-]?\s*(.+)/i);
      if (match) form.header.recipientIdentifier = match[1].trim();
    }
    
    // Checkboxes
    const checkedPattern = /\[x\]|[X]|checked|yes/i;
    
    if (lowerLine.includes('sih')) {
      form.careCoordinationType.sih = checkedPattern.test(line);
    }
    if (lowerLine.includes('hcbw')) {
      form.careCoordinationType.hcbw = checkedPattern.test(line);
    }
  }
  
  progress.update(90, 'Extracting narrative sections');
  const sections = extractNarrativeSections(text);
  form.narrative = { ...form.narrative, ...sections };
  
  if (!ollamaAvailable) {
    notes.push('OCR-only mode: Ollama not available. Fields extracted using pattern matching only.');
  }
  notes.push('Please review all fields carefully as automated extraction may contain errors.');
  
  // Add notes to additionalNotes
  if (form.narrative.additionalNotes) {
    form.narrative.additionalNotes = notes.join('\n') + '\n\n' + form.narrative.additionalNotes;
  } else {
    form.narrative.additionalNotes = notes.join('\n');
  }
  
  const confidence = generateConfidenceScores(form, ocrConfidence, 'ocr-only');
  
  logger.info('Rule-based extraction complete', {
    headerFields: Object.values(form.header).filter(v => v).length,
    checkboxes: Object.values(form.careCoordinationType).filter(v => v).length
  });
  
  return {
    form,
    confidence,
    extractionMethod: 'ocr-only',
    ollamaAvailable,
  };
}

/**
 * Extract narrative sections from text
 */
function extractNarrativeSections(text: string): Partial<MonthlyCareCoordinationForm['narrative']> {
  const sections: Partial<MonthlyCareCoordinationForm['narrative']> = {};
  const lowerText = text.toLowerCase();
  
  const sectionPatterns = [
    { key: 'recipientAndVisitObservations', patterns: ['recipient & visit observations', 'recipient and visit observations', 'visit observations'] },
    { key: 'healthEmotionalStatus', patterns: ['health/emotional status', 'health emotional status', 'med changes', 'health status'] },
    { key: 'reviewOfServices', patterns: ['review of services', 'services review'] },
    { key: 'progressTowardGoals', patterns: ['progress toward goals', 'progress to goals', 'goals progress'] },
    { key: 'additionalNotes', patterns: ['additional notes', 'notes'] },
    { key: 'followUpTasks', patterns: ['follow up tasks', 'followup tasks', 'care coordinator follow up'] },
  ] as const;
  
  for (const { key, patterns } of sectionPatterns) {
    for (const pattern of patterns) {
      const idx = lowerText.indexOf(pattern);
      if (idx !== -1) {
        const start = idx + pattern.length;
        const end = findNextSectionIndex(lowerText, start);
        const content = text.slice(start, end).trim();
        if (content.length > 10) {
          sections[key] = content.substring(0, 1000);
          break;
        }
      }
    }
  }
  
  return sections;
}

/**
 * Find the start of the next section
 */
function findNextSectionIndex(text: string, startPos: number): number {
  const sectionHeaders = [
    'recipient & visit observations',
    'recipient and visit observations',
    'health/emotional status',
    'review of services',
    'progress toward goals',
    'additional notes',
    'follow up tasks',
    'followup tasks',
    'care coordinator follow up',
    'signature',
  ];
  
  let nextIndex = text.length;
  for (const header of sectionHeaders) {
    const idx = text.indexOf(header, startPos);
    if (idx !== -1 && idx < nextIndex) {
      nextIndex = idx;
    }
  }
  return nextIndex;
}

/**
 * Generate confidence scores for all fields
 */
function generateConfidenceScores(
  form: MonthlyCareCoordinationForm,
  baseOcrConfidence: number,
  method: 'ocr-only' | 'llm-structured' | 'llm-categorized' | 'vision-llm'
): FieldConfidence[] {
  const confidence: FieldConfidence[] = [];
  const baseConfidence = baseOcrConfidence > 80 ? 'high' : baseOcrConfidence > 50 ? 'medium' : 'low';
  
  const addField = (field: FieldPath, hasValue: boolean) => {
    let level: ConfidenceLevel = baseConfidence;
    
    if (method === 'ocr-only') {
      if (level === 'high') level = 'medium';
      else if (level === 'medium') level = 'low';
    }
    
    // LLM-categorized gets boost for being validated
    if (method === 'llm-categorized' && hasValue) {
      if (level === 'low') level = 'medium';
      else if (level === 'medium') level = 'high';
    }
    
    if (!hasValue) {
      level = 'low';
    }
    
    confidence.push({
      field,
      confidence: level,
      ocrConfidence: baseOcrConfidence,
      source: method,
    });
  };
  
  // Header fields
  addField('header.recipientName', !!form.header.recipientName);
  addField('header.date', !!form.header.date);
  addField('header.time', !!form.header.time);
  addField('header.recipientIdentifier', !!form.header.recipientIdentifier);
  addField('header.dob', !!form.header.dob);
  addField('header.location', !!form.header.location);
  
  // Checkboxes
  addField('careCoordinationType.sih', true);
  addField('careCoordinationType.hcbw', true);
  
  // Narrative fields
  addField('narrative.recipientAndVisitObservations', !!form.narrative.recipientAndVisitObservations);
  addField('narrative.healthEmotionalStatus', !!form.narrative.healthEmotionalStatus);
  addField('narrative.reviewOfServices', !!form.narrative.reviewOfServices);
  addField('narrative.progressTowardGoals', !!form.narrative.progressTowardGoals);
  addField('narrative.additionalNotes', !!form.narrative.additionalNotes);
  addField('narrative.followUpTasks', !!form.narrative.followUpTasks);
  
  // Signature fields
  addField('signature.careCoordinatorName', !!form.signature.careCoordinatorName);
  addField('signature.signature', !!form.signature.signature);
  addField('signature.dateSigned', !!form.signature.dateSigned);
  
  return confidence;
}
