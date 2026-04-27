import type { ExtractionResult } from '@ara/shared';

const HISTORY_KEY = 'ara_quick_history';
const MAX_ITEMS = 5;

export interface HistoryItem {
  id: string;
  timestamp: number;
  recipientName: string;
  date: string;
  preview: string;
  result?: ExtractionResult;
}

export function saveToQuickHistory(result: ExtractionResult): void {
  try {
    const history = getQuickHistory();
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      recipientName: result.form.header.recipientName || 'Unknown',
      date: result.form.header.date || new Date().toLocaleDateString(),
      preview: result.rawText?.substring(0, 100) || '',
      result,
    };

    const filtered = history.filter(
      item => !(item.recipientName === newItem.recipientName && item.date === newItem.date)
    );

    filtered.unshift(newItem);
    if (filtered.length > MAX_ITEMS) {
      filtered.pop();
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage errors.
  }
}

export function getQuickHistory(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored
      ? (JSON.parse(stored) as HistoryItem[]).filter(item => typeof item?.id === 'string')
      : [];
  } catch {
    return [];
  }
}

export function clearQuickHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
