/**
 * Date and Time Utilities
 * Shared between frontend and backend for consistent formatting
 */

export interface DateTimeParseResult {
  value: string;
  isValid: boolean;
  normalized?: string;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

/**
 * Parse a written date like "March 12, 2026" to "03/12/2026"
 */
export function parseWrittenDate(dateStr: string): string | null {
  const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!match) return null;

  const monthIndex = MONTH_NAMES.indexOf(match[1].toLowerCase());
  if (monthIndex === -1) return null;

  const month = String(monthIndex + 1).padStart(2, '0');
  const day = match[2].padStart(2, '0');
  const year = match[3];

  return `${month}/${day}/${year}`;
}

/**
 * Normalize various date formats to MM/DD/YYYY
 * Handles: ISO (YYYY-MM-DD), US (M/D/YYYY), European (D.M.YYYY), written (March 12, 2026)
 */
export function normalizeDate(value: string): string {
  if (!value || typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  // Already normalized?
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // Try written date first (March 12, 2026)
  const written = parseWrittenDate(trimmed);
  if (written) return written;

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (isoMatch) {
    let [, year, month, day] = isoMatch;
    let monthNum = parseInt(month, 10);
    let dayNum = parseInt(day, 10);
    
    // Auto-correct
    if (monthNum === 0) monthNum = 1;
    if (monthNum > 12) monthNum = 12;
    if (dayNum === 0) dayNum = 1;
    if (dayNum > 31) dayNum = 31;
    
    const daysInMonth = new Date(parseInt(year), monthNum, 0).getDate();
    if (dayNum > daysInMonth) dayNum = daysInMonth;
    
    return `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}/${year}`;
  }

  // European format: DD-MM-YYYY or DD.MM.YYYY (detect by first number > 12)
  const euroMatch = trimmed.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})$/);
  if (euroMatch) {
    let [, first, second, year] = euroMatch;
    let firstNum = parseInt(first, 10);
    let secondNum = parseInt(second, 10);
    
    // If first number > 12, it's likely day (European format)
    if (firstNum > 12) {
      let dayNum = firstNum;
      let monthNum = secondNum;
      
      if (monthNum === 0) monthNum = 1;
      if (monthNum > 12) monthNum = 12;
      if (dayNum === 0) dayNum = 1;
      if (dayNum > 31) dayNum = 31;
      
      const daysInMonth = new Date(parseInt(year), monthNum, 0).getDate();
      if (dayNum > daysInMonth) dayNum = daysInMonth;
      
      return `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}/${year}`;
    }
  }

  // US format: M/D/YYYY or MM/DD/YYYY or M-D-YYYY
  const usMatch = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (usMatch) {
    let [, month, day, year] = usMatch;

    // Handle 2-digit years
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      year = yearNum < 50 ? `20${year}` : `19${year}`;
    }

    // Parse and auto-correct values
    let monthNum = parseInt(month, 10);
    let dayNum = parseInt(day, 10);
    const yearNum = parseInt(year, 10);

    // Auto-correct invalid month (00 → 01, >12 → 12)
    if (monthNum === 0) {
      monthNum = 1;
    } else if (monthNum > 12) {
      monthNum = 12;
    }

    // Auto-correct invalid day (00 → 01, >31 → 31)
    if (dayNum === 0) {
      dayNum = 1;
    } else if (dayNum > 31) {
      dayNum = 31;
    }

    // Adjust day for months with fewer days
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    if (dayNum > daysInMonth) {
      dayNum = daysInMonth;
    }

    return `${String(monthNum).padStart(2, '0')}/${String(dayNum).padStart(2, '0')}/${year}`;
  }

  // Compact format: MMDDYYYY or DDMMYYYY (8 digits)
  const compactMatch = trimmed.match(/^(\d{8})$/);
  if (compactMatch) {
    const digits = compactMatch[1];
    let month = parseInt(digits.slice(0, 2), 10);
    let day = parseInt(digits.slice(2, 4), 10);
    const year = digits.slice(4);
    
    // If month > 12, assume DDMMYYYY
    if (month > 12) {
      const temp = month;
      month = day;
      day = temp;
    }
    
    // Fix invalid values
    if (month === 0) month = 1;
    if (month > 12) month = 12;
    if (day === 0) day = 1;
    if (day > 31) day = 31;
    
    const daysInMonth = new Date(parseInt(year), month, 0).getDate();
    if (day > daysInMonth) day = daysInMonth;
    
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  }

  return trimmed;
}

/**
 * Normalize various time formats to HH:MM (24-hour)
 */
export function normalizeTime(value: string): string {
  if (!value || typeof value !== 'string') return '';

  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return '';

  // Already normalized?
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Military time (1430 → 14:30)
  const militaryMatch = trimmed.match(/^(\d{1,2})(\d{2})$/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const minutes = militaryMatch[2];
    if (hours <= 23 && parseInt(minutes, 10) <= 59) {
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
  }

  // Standard format with optional AM/PM
  const standardMatch = trimmed.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
  if (standardMatch) {
    let hours = parseInt(standardMatch[1], 10);
    const minutes = standardMatch[2] || '00';
    const meridiem = standardMatch[3];

    if (parseInt(minutes, 10) > 59) return trimmed;

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    if (hours > 23) return trimmed;

    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  return trimmed;
}

/**
 * Check if value is a valid date in MM/DD/YYYY format
 */
export function isValidDate(value: string): boolean {
  if (!value) return false;
  return /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim());
}

/**
 * Check if value is a valid time in HH:MM format
 */
export function isValidTime(value: string): boolean {
  if (!value) return false;
  return /^\d{2}:\d{2}$/.test(value.trim());
}

/**
 * Check if date string has a valid month/day combination
 */
export function isDatePlausible(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  // Check days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;

  return true;
}

/**
 * Get current date in MM/DD/YYYY format
 */
export function getCurrentDate(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
}

/**
 * Get current time in HH:MM format
 */
export function getCurrentTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format a date for display
 */
export function formatDateForDisplay(value: string): string {
  const normalized = normalizeDate(value);
  if (!isValidDate(normalized)) return value;

  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return value;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = match[3];

  return `${MONTH_NAMES[month - 1].charAt(0).toUpperCase() + MONTH_NAMES[month - 1].slice(1)} ${day}, ${year}`;
}

/**
 * DateTime utilities object for convenient access
 */
export const DateTimeUtils = {
  normalizeDate,
  normalizeTime,
  parseWrittenDate,
  isValidDate,
  isValidTime,
  isDatePlausible,
  getCurrentDate,
  getCurrentTime,
  formatDateForDisplay,
};
