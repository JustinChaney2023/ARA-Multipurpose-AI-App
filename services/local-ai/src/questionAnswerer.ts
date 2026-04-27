/**
 * Question-Answering Engine for Form Filling
 *
 * Supports both full form filling and targeted repair of specific fields.
 */

import {
  createEmptyForm,
  type MonthlyCareCoordinationForm,
  type FieldConfidence,
  type QAAnswer,
  type FieldPath,
} from '@ara/shared';

import { FORM_QUESTIONS, getQuestionByFieldPath, type FormQuestion } from './formQuestions.js';
import { logger, createProgressTracker } from './logger.js';
import { DEFAULT_MODEL, getModelOptions } from './modelConfig.js';
import { checkOllamaHealth } from './ollama.js';
import { getOllamaClient } from './ollamaClient.js';
import { buildConfidenceFromAnswers } from './utils/confidence.js';
import { setModelBusy } from './warmup.js';

export interface QAResult {
  form: MonthlyCareCoordinationForm;
  confidence: FieldConfidence[];
  extractionMethod: 'qa-llm' | 'ocr-only';
  ollamaAvailable: boolean;
  answers: Record<string, QAAnswer>;
}

interface QAPair {
  question: FormQuestion;
  answer: QAAnswer;
}

export async function fillFormWithQA(
  transcript: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<QAResult> {
  const progress = createProgressTracker('QA_FILL');
  progress.start('Starting question-answering form fill');

  setModelBusy(true);

  try {
    const ollamaAvailable = await checkOllamaHealth();
    if (!ollamaAvailable) {
      progress.update(100, 'Using rule-based fallback');
      return fillWithRuleBased(transcript);
    }

    const answers = await answerSpecificQuestions(
      transcript,
      FORM_QUESTIONS.map(question => question.fieldPath),
      onProgress
    );

    const form = buildFormFromAnswersRecord(answers);
    const confidence = buildConfidenceScores(answers);

    progress.complete('Form filled using Q&A');

    return {
      form,
      confidence,
      extractionMethod: 'qa-llm',
      ollamaAvailable: true,
      answers,
    };
  } catch (error) {
    logger.error('Q&A form filling failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    progress.update(50, 'Q&A failed, using fallback');
    return fillWithRuleBased(transcript);
  } finally {
    setModelBusy(false);
  }
}

export async function answerSpecificQuestions(
  transcript: string,
  fieldPaths: string[],
  onProgress?: (stage: string, percent: number) => void
): Promise<Record<string, QAAnswer>> {
  const uniqueQuestions = fieldPaths
    .map(fieldPath => getQuestionByFieldPath(fieldPath))
    .filter((question): question is FormQuestion => Boolean(question));

  const answers: Record<string, QAAnswer> = {};
  if (uniqueQuestions.length === 0) {
    return answers;
  }

  const batchSize = 5;
  const totalBatches = Math.ceil(uniqueQuestions.length / batchSize);

  for (let i = 0; i < uniqueQuestions.length; i += batchSize) {
    const batch = uniqueQuestions.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const percent = Math.round((batchNum / totalBatches) * 100);

    onProgress?.('repairing', percent);

    const batchAnswers = await Promise.all(
      batch.map(question => answerQuestion(question, transcript))
    );

    for (const qa of batchAnswers) {
      answers[qa.question.fieldPath] = qa.answer;
    }
  }

  return answers;
}

async function answerQuestion(question: FormQuestion, transcript: string): Promise<QAPair> {
  const excerpt = selectRelevantExcerpt(question, transcript);
  const { system, prompt } = buildQAPrompt(question, excerpt);

  try {
    const client = getOllamaClient();
    // Reduced timeout for faster CPU inference (20s instead of 60s per question)
    const data = await client.generate(
      {
        model: DEFAULT_MODEL,
        system,
        prompt,
        stream: false,
        options: getQuestionModelOptions(question),
      },
      { timeout: 20000 }
    );
    const rawAnswer = data.response?.trim() || '';
    const parsed = parseQAResponse(rawAnswer);
    const source = parsed.answer ? extractEvidenceSnippet(excerpt, parsed.answer) : undefined;

    logger.debug('Q&A field answered', {
      field: question.fieldPath,
      confidence: parsed.confidence,
      answerLength: parsed.answer.length,
    });

    return {
      question,
      answer: {
        answer: parsed.answer,
        confidence: parsed.confidence,
        source,
      },
    };
  } catch (error) {
    logger.warn('Q&A field failed', {
      field: question.fieldPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      question,
      answer: {
        answer: '',
        confidence: 'low',
      },
    };
  }
}

function buildQAPrompt(
  question: FormQuestion,
  transcriptExcerpt: string
): { system: string; prompt: string } {
  const system =
    question.type === 'textarea'
      ? 'Extract form data from caregiver notes. Write detailed, complete answers using all relevant information from the transcript.'
      : 'Extract form data from caregiver notes. Be concise and exact.';

  const contextLine = question.context ? `Context: ${question.context}\n` : '';
  const prompt = `Question: ${question.question}
${contextLine}Type: ${question.type}
Transcript:
"""
${transcriptExcerpt}
"""

ANSWER: <your answer, or NOT_FOUND if not in transcript>
CONFIDENCE: <high/medium/low>`;

  return { system, prompt };
}

function getQuestionModelOptions(question: FormQuestion) {
  const maxTokens = question.type === 'textarea' ? 500 : question.type === 'checkbox' ? 12 : 80;
  return {
    ...getModelOptions(false),
    num_predict: maxTokens,
  };
}

function selectRelevantExcerpt(question: FormQuestion, transcript: string): string {
  const normalizedTranscript = transcript.replace(/\r\n/g, '\n');
  const lines = normalizedTranscript
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return normalizedTranscript.substring(0, 2000);
  }

  const keywords = getQuestionKeywords(question);
  const relevantLines = new Set<number>();

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    if (keywords.some(keyword => lowerLine.includes(keyword))) {
      relevantLines.add(index);
      if (index > 0) relevantLines.add(index - 1);
      if (index < lines.length - 1) relevantLines.add(index + 1);
    }
  });

  const excerptLimit = question.type === 'textarea' ? 2200 : 1200;
  const excerpt =
    relevantLines.size > 0
      ? Array.from(relevantLines)
          .sort((a, b) => a - b)
          .map(index => lines[index])
          .join('\n')
      : normalizedTranscript.substring(0, excerptLimit);

  if (excerpt.length >= 200) {
    return excerpt.substring(0, excerptLimit);
  }

  return normalizedTranscript.substring(0, excerptLimit);
}

function getQuestionKeywords(question: FormQuestion): string[] {
  const baseKeywords = question.question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2);

  const fieldSpecific: Record<string, string[]> = {
    // NOTE: Sensitive PII fields are excluded from auto-extraction (HIPAA compliance)
    // 'header.recipientName': ['name', 'client', 'recipient', 'patient'],
    // 'header.recipientIdentifier': ['id', 'identifier', 'case', 'medicaid'],
    // 'header.dob': ['dob', 'birth', 'born'],
    'header.date': ['date', 'visited', 'visit date', 'contact date'],
    'header.time': ['time', 'visited at', 'called at', 'am', 'pm'],
    'header.location': ['location', 'home', 'facility', 'phone', 'visit'],
    'careCoordinationType.sih': ['sih', 'senior in-home', 'in-home'],
    'careCoordinationType.hcbw': ['hcbw', 'waiver'],
    'narrative.recipientAndVisitObservations': [
      'observed',
      'appearance',
      'visit',
      'home environment',
      'present',
      'client was',
      'client appeared',
      'during the visit',
    ],
    'narrative.healthEmotionalStatus': [
      'health',
      'medication',
      'doctor',
      'fall',
      'hospital',
      'pain',
      'behavior',
      'mood',
      'emotional',
      'vital',
      'diagnosis',
      'symptom',
    ],
    'narrative.reviewOfServices': [
      'service',
      'aide',
      'nursing',
      'therapy',
      'provider',
      'personal care',
      'transportation',
    ],
    'narrative.progressTowardGoals': [
      'goal',
      'progress',
      'improving',
      'barrier',
      'independent',
      'skill',
      'achieving',
    ],
    'narrative.additionalNotes': [
      'family',
      'equipment',
      'financial',
      'housing',
      'safety',
      'additional',
    ],
    'narrative.followUpTasks': [
      'follow-up',
      'follow up',
      'schedule',
      'call',
      'contact',
      'arrange',
      'appointment',
      'coordinator will',
      'referral',
    ],
    // NOTE: Signature fields excluded (manual entry only)
    // 'signature.careCoordinatorName': ['coordinator', 'signed', 'signature', 'by'],
    // 'signature.dateSigned': ['signed', 'date signed', 'signature date'],
  };

  return Array.from(new Set([...(fieldSpecific[question.fieldPath] || []), ...baseKeywords]));
}

function parseQAResponse(raw: string): { answer: string; confidence: 'high' | 'medium' | 'low' } {
  const text = raw.trim();
  const answerMatch = text.match(/ANSWER:\s*(.+?)(?=\nCONFIDENCE:|$)/is);
  let answer = answerMatch ? answerMatch[1].trim() : '';

  const confidenceMatch = text.match(/CONFIDENCE:\s*(high|medium|low)/i);
  let confidence: 'high' | 'medium' | 'low' = confidenceMatch
    ? (confidenceMatch[1].toLowerCase() as 'high' | 'medium' | 'low')
    : 'medium';

  if (!answer && text.length > 0 && text.length < 500 && !text.includes('{')) {
    answer = text;
  }

  if (['NOT_FOUND', 'N/A', 'UNKNOWN'].includes(answer.toUpperCase())) {
    return { answer: '', confidence: 'low' };
  }

  answer = answer.replace(/^['"](.*)['"]$/, '$1').trim();
  if (!answer) {
    confidence = 'low';
  }

  return { answer, confidence };
}

function extractEvidenceSnippet(excerpt: string, answer: string): string | undefined {
  const lines = excerpt
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const answerTokens = answer
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2)
    .slice(0, 4);

  const matchingLine = lines.find(line =>
    answerTokens.some(token => line.toLowerCase().includes(token))
  );
  const snippet = matchingLine || lines[0];
  return snippet ? snippet.substring(0, 180) : undefined;
}

function buildFormFromAnswersRecord(
  answers: Record<string, QAAnswer>
): MonthlyCareCoordinationForm {
  const form = createEmptyForm();

  for (const [fieldPath, answer] of Object.entries(answers)) {
    const question = getQuestionByFieldPath(fieldPath);
    if (!question) continue;
    setFieldValue(form, fieldPath, answer.answer, question.type);
  }

  return form;
}

function setFieldValue(
  form: MonthlyCareCoordinationForm,
  fieldPath: string,
  value: string,
  type: string
): void {
  const parts = fieldPath.split('.');
  if (parts.length !== 2) return;

  const [section, field] = parts;

  if (type === 'checkbox') {
    const boolValue =
      value.toLowerCase() === 'true' ||
      value === '1' ||
      value.toLowerCase() === 'yes' ||
      value.toLowerCase().includes('checked');
    if (section === 'careCoordinationType') {
      form.careCoordinationType[field as keyof typeof form.careCoordinationType] = boolValue;
    }
    return;
  }

  if (section === 'header') {
    form.header[field as keyof typeof form.header] = value;
  } else if (section === 'narrative') {
    form.narrative[field as keyof typeof form.narrative] = value;
  } else if (section === 'signature') {
    form.signature[field as keyof typeof form.signature] = value;
  }
}

function buildConfidenceScores(answers: Record<string, QAAnswer>): FieldConfidence[] {
  const fields = FORM_QUESTIONS.map(q => q.fieldPath as FieldPath);
  return buildConfidenceFromAnswers(fields, answers, 'qa-llm');
}

function fillWithRuleBased(transcript: string): QAResult {
  const form = createEmptyForm();
  const answers: Record<string, QAAnswer> = {};
  const lines = transcript
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // NOTE: recipientName excluded - manual entry only (HIPAA)
    // if (lowerLine.includes('name:') || lowerLine.includes('client:') || lowerLine.includes('recipient:')) {
    //   const match = line.match(/(?:name|client|recipient)[:\s]+(.+)/i);
    //   if (match && !form.header.recipientName) {
    //     form.header.recipientName = match[1].trim();
    //     answers['header.recipientName'] = {
    //       answer: match[1].trim(),
    //       confidence: 'medium',
    //       source: line.substring(0, 180),
    //     };
    //   }
    // }

    if (lowerLine.includes('date:') || lowerLine.match(/\bdate\s*:/)) {
      const match = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
      if (match && !form.header.date) {
        form.header.date = match[1].trim();
        answers['header.date'] = {
          answer: match[1].trim(),
          confidence: 'medium',
          source: line.substring(0, 180),
        };
      }
    }

    if (lowerLine.includes('sih')) {
      form.careCoordinationType.sih = lowerLine.includes('[x]') || lowerLine.includes('checked');
      answers['careCoordinationType.sih'] = {
        answer: form.careCoordinationType.sih ? 'true' : 'false',
        confidence: 'low',
        source: line.substring(0, 180),
      };
    }

    if (lowerLine.includes('hcbw')) {
      form.careCoordinationType.hcbw = lowerLine.includes('[x]') || lowerLine.includes('checked');
      answers['careCoordinationType.hcbw'] = {
        answer: form.careCoordinationType.hcbw ? 'true' : 'false',
        confidence: 'low',
        source: line.substring(0, 180),
      };
    }
  }

  form.narrative.recipientAndVisitObservations = transcript.substring(0, 2000);
  answers['narrative.recipientAndVisitObservations'] = {
    answer: form.narrative.recipientAndVisitObservations,
    confidence: 'low',
    source: transcript.substring(0, 180),
  };

  if (!form.narrative.additionalNotes) {
    form.narrative.additionalNotes =
      'Rule-based extraction used. Please review all fields.\n\n' + transcript.substring(0, 1000);
  }

  return {
    form,
    confidence: buildConfidenceScores(answers),
    extractionMethod: 'ocr-only',
    ollamaAvailable: false,
    answers,
  };
}

export function generateQASummary(answers: Record<string, QAAnswer>): string {
  const sections: string[] = [];

  // NOTE: recipientName excluded from summary (manual entry only)
  const headerFields = ['header.date', 'header.location'];
  const headerInfo = headerFields
    .map(field => answers[field]?.answer)
    .filter(Boolean)
    .join(' | ');
  if (headerInfo) sections.push(`Visit: ${headerInfo}`);

  const sih = answers['careCoordinationType.sih']?.answer === 'true';
  const hcbw = answers['careCoordinationType.hcbw']?.answer === 'true';
  if (sih || hcbw) {
    sections.push(`Services: ${sih ? 'SIH ' : ''}${hcbw ? 'HCBW' : ''}`.trim());
  }

  const observations = answers['narrative.recipientAndVisitObservations']?.answer;
  if (observations) sections.push(`Observations: ${truncate(observations, 100)}`);

  const health = answers['narrative.healthEmotionalStatus']?.answer;
  if (health) sections.push(`Health: ${truncate(health, 100)}`);

  return sections.join('\n\n');
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.substring(0, maxLength)}...` : value;
}
