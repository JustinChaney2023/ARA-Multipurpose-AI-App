/**
 * Field validation utilities
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  formatted?: string;
}

/**
 * Validate and format dates (MM/DD/YYYY)
 */
export function validateDate(value: string): ValidationResult {
  if (!value || value.trim() === '') {
    return { valid: true };
  }
  
  // Common date patterns
  const patterns = [
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: 'MM/DD/YYYY' },
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, format: 'MM-DD-YYYY' },
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, format: 'M/D/YY' },
    { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, format: 'MM.DD.YYYY' },
  ];
  
  for (const pattern of patterns) {
    const match = value.match(pattern.regex);
    if (match) {
      let [_, month, day, year] = match;
      
      if (year.length === 2) {
        const yearNum = parseInt(year);
        year = yearNum < 50 ? `20${year}` : `19${year}`;
      }
      
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);
      
      if (monthNum < 1 || monthNum > 12) {
        return { valid: false, error: 'Month must be 1-12' };
      }
      if (dayNum < 1 || dayNum > 31) {
        return { valid: false, error: 'Day must be 1-31' };
      }
      
      const formattedMonth = monthNum.toString().padStart(2, '0');
      const formattedDay = dayNum.toString().padStart(2, '0');
      
      return { 
        valid: true, 
        formatted: `${formattedMonth}/${formattedDay}/${year}` 
      };
    }
  }
  
  return { valid: false, error: 'Use format MM/DD/YYYY' };
}

/**
 * Validate and format time (HH:MM)
 */
export function validateTime(value: string): ValidationResult {
  if (!value || value.trim() === '') {
    return { valid: true };
  }
  
  const patterns = [
    { regex: /^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/, hasAmPm: true },
    { regex: /^(\d{1,2}):(\d{2})$/, hasAmPm: false },
    { regex: /^(\d{4})$/, hasAmPm: false, military: true },
  ];
  
  for (const pattern of patterns) {
    const match = value.match(pattern.regex);
    if (match) {
      let hours: number;
      let minutes: number;
      
      if ((pattern as { military?: boolean }).military) {
        hours = parseInt(match[1].substring(0, 2));
        minutes = parseInt(match[1].substring(2, 4));
      } else {
        hours = parseInt(match[1]);
        minutes = parseInt(match[2]);
      }
      
      if (pattern.hasAmPm && match[3]) {
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
      }
      
      if (hours < 0 || hours > 23) {
        return { valid: false, error: 'Hours must be 0-23' };
      }
      if (minutes < 0 || minutes > 59) {
        return { valid: false, error: 'Minutes must be 0-59' };
      }
      
      const formattedHours = hours.toString().padStart(2, '0');
      const formattedMinutes = minutes.toString().padStart(2, '0');
      
      return { 
        valid: true, 
        formatted: `${formattedHours}:${formattedMinutes}` 
      };
    }
  }
  
  return { valid: false, error: 'Use format HH:MM' };
}

/**
 * Auto-format field based on type
 */
export function autoFormatField(value: string, fieldType: 'date' | 'time' | 'text'): string {
  switch (fieldType) {
    case 'date': {
      const result = validateDate(value);
      return result.formatted || value;
    }
    case 'time': {
      const result = validateTime(value);
      return result.formatted || value;
    }
    default:
      return value;
  }
}
