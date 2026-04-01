import type { ExtractionResult } from '@ara/shared';

const AUTOSAVE_KEY = 'ara_autosave';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

export interface AutoSaveData {
  timestamp: number;
  form: ExtractionResult['form'];
  rawText: string;
}

let autoSaveInterval: NodeJS.Timeout | null = null;

export function startAutoSave(
  getData: () => { form: ExtractionResult['form']; rawText: string }
): void {
  stopAutoSave();
  
  autoSaveInterval = setInterval(() => {
    const data = getData();
    if (data.form && data.rawText) {
      saveDraft(data.form, data.rawText);
    }
  }, AUTOSAVE_INTERVAL);
}

export function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

export function saveDraft(form: ExtractionResult['form'], rawText: string): void {
  try {
    const data: AutoSaveData = {
      timestamp: Date.now(),
      form,
      rawText,
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

export function loadDraft(): AutoSaveData | null {
  try {
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    if (!stored) return null;
    
    const data: AutoSaveData = JSON.parse(stored);
    // Only return if less than 7 days old
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - data.timestamp > oneWeek) {
      clearDraft();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
}

export function getDraftAge(): string | null {
  const draft = loadDraft();
  if (!draft) return null;
  
  const diff = Date.now() - draft.timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

export function hasDraft(): boolean {
  return loadDraft() !== null;
}
