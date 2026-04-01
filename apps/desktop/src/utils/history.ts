import type { ExtractionResult } from '@ara/shared';

const HISTORY_KEY = 'ara_extraction_history';
const MAX_HISTORY_ITEMS = 10;

export interface HistoryItem {
  id: string;
  timestamp: number;
  preview: string;
  recipientName: string;
  date: string;
  extractionMethod: string;
  form: ExtractionResult['form'];
  rawText: string;
}

export function saveToHistory(result: ExtractionResult): void {
  try {
    const history = getHistory();
    const existingIndex = history.findIndex(h => h.rawText === result.rawText);
    
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      preview: result.rawText.slice(0, 100) + (result.rawText.length > 100 ? '...' : ''),
      recipientName: result.form.header.recipientName || 'Unknown',
      date: result.form.header.date || new Date().toLocaleDateString(),
      extractionMethod: result.extractionMethod,
      form: result.form,
      rawText: result.rawText,
    };

    if (existingIndex >= 0) {
      history[existingIndex] = { ...newItem, id: history[existingIndex].id };
    } else {
      history.unshift(newItem);
      if (history.length > MAX_HISTORY_ITEMS) {
        history.pop();
      }
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

export function getHistory(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function deleteHistoryItem(id: string): void {
  const history = getHistory().filter(h => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function findSimilarText(text: string, threshold: number = 0.8): HistoryItem | null {
  const history = getHistory();
  if (!text || history.length === 0) return null;

  const textLower = text.toLowerCase();
  const textWords = new Set(textLower.split(/\s+/));

  for (const item of history) {
    const itemLower = item.rawText.toLowerCase();
    const itemWords = new Set(itemLower.split(/\s+/));
    
    const intersection = new Set([...textWords].filter(x => itemWords.has(x)));
    const similarity = intersection.size / Math.max(textWords.size, itemWords.size);
    
    if (similarity >= threshold) {
      return item;
    }
  }

  return null;
}

export function exportHistoryToJSON(): string {
  const history = getHistory();
  return JSON.stringify(history, null, 2);
}

export function importHistoryFromJSON(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      localStorage.setItem(HISTORY_KEY, json);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
