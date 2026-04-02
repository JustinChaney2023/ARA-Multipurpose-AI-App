/**
 * Shared confidence scoring utility.
 * Single source of truth used by narrativeQA, questionAnswerer, and parser.
 */

import type { FieldConfidence, FieldPath, QAAnswer } from '@ara/shared';

/**
 * Build confidence scores from a map of field answers.
 * Fields present in allFields but missing from answers default to 'low'.
 */
export function buildConfidenceFromAnswers(
  allFields: FieldPath[],
  answers: Record<string, QAAnswer>,
  defaultSource = 'hybrid-fill',
): FieldConfidence[] {
  return allFields.map(field => {
    const answer = answers[field];
    return {
      field,
      confidence: answer?.confidence || 'low',
      ocrConfidence: 100,
      source: answer?.source || defaultSource,
    };
  });
}
