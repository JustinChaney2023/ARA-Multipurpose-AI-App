/**
 * Shared JSON parsing utilities for LLM responses
 * Handles various formats: direct JSON, markdown code blocks, embedded JSON
 */

import { logger } from './logger.js';

export interface JSONParseSuccess<T> {
  success: true;
  data: T;
}

export interface JSONParseFailure {
  success: false;
  error: string;
  rawOutput: string;
}

export type JSONParseResult<T> = JSONParseSuccess<T> | JSONParseFailure;

/**
 * Parse JSON from LLM response with multiple fallback strategies
 */
export function parseLLMJSON<T>(rawOutput: string): JSONParseResult<T> {
  const trimmed = rawOutput.trim();

  // Strategy 1: Direct parse
  try {
    const data = JSON.parse(trimmed) as T;
    return { success: true, data };
  } catch {
    logger.debug('Direct JSON parse failed, trying code block extraction');
  }

  // Strategy 2: Extract from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const data = JSON.parse(codeBlockMatch[1].trim()) as T;
      return { success: true, data };
    } catch {
      logger.debug('Code block JSON parse failed, trying bracket extraction');
    }
  }

  // Strategy 3: Find JSON object between curly braces
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]) as T;
      return { success: true, data };
    } catch {
      logger.debug('Bracket extraction JSON parse failed');
    }
  }

  // All strategies failed
  return {
    success: false,
    error: 'Could not parse JSON from LLM output',
    rawOutput: trimmed.substring(0, 2000), // Limit raw output length
  };
}

/**
 * Safely extract string value from unknown data
 */
export function safeString(value: unknown, maxLength = 1000): string {
  if (typeof value === 'string') {
    return value.substring(0, maxLength);
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).substring(0, maxLength);
}

/**
 * Safely extract boolean value from unknown data
 */
export function safeBoolean(value: unknown, defaultValue = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return defaultValue;
}

/**
 * Check if value looks like a placeholder (contains "string" literal)
 */
export function isPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('string');
}

/**
 * Clean placeholder values from an object recursively
 */
export function cleanPlaceholders<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    if (isPlaceholder(value)) {
      (result as Record<string, unknown>)[key] = '';
    } else if (typeof value === 'object' && value !== null) {
      (result as Record<string, unknown>)[key] = cleanPlaceholders(
        value as Record<string, unknown>
      );
    }
  }

  return result;
}
