/**
 * Form Validation
 * Uses shared validation utilities from @ara/shared
 */

import { 
  DateTimeUtils, 
  FormValidator, 
  FormAccess,
  type MonthlyCareCoordinationForm, 
  type FieldPath,
  type ValidationResult,
  type ValidationIssue,
} from '@ara/shared';

// Re-export types for backward compatibility
export type { ValidationResult, ValidationIssue };

/**
 * Validate form data
 * Delegates to shared FormValidator
 */
export function validateForm(form: MonthlyCareCoordinationForm): ValidationResult {
  return FormValidator.validate(form);
}

/**
 * Auto-format date value
 */
export function autoFormatDate(value: string): string {
  return DateTimeUtils.normalizeDate(value);
}

/**
 * Auto-format time value
 */
export function autoFormatTime(value: string): string {
  return DateTimeUtils.normalizeTime(value);
}

/**
 * Apply smart defaults to form
 */
export function applySmartDefaults(form: MonthlyCareCoordinationForm): Partial<MonthlyCareCoordinationForm> {
  return FormValidator.applySmartDefaults(form);
}

/**
 * Check if date is valid
 */
export function isValidDate(value: string): boolean {
  return DateTimeUtils.isValidDate(value) && DateTimeUtils.isDatePlausible(value);
}

/**
 * Check if time is valid
 */
export function isValidTime(value: string): boolean {
  return DateTimeUtils.isValidTime(value);
}

/**
 * Get field value safely
 */
export function getFieldValue(form: MonthlyCareCoordinationForm, fieldPath: FieldPath): string {
  return FormAccess.get(form, fieldPath) as string;
}
