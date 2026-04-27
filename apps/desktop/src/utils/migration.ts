/**
 * One-time localStorage → SQLite migration (Phase 3).
 *
 * On first run after the Phase 3 update, this reads the legacy
 * `ara_extraction_history` localStorage entries and ships them to the
 * backend `/migrate/localstorage` endpoint. They are imported under an
 * "Unassigned" patient so nothing is lost.
 *
 * The migration is idempotent from the frontend perspective: once the
 * `ara_phase3_migrated` flag is set in localStorage, we never run again.
 * The backend endpoint is also safe to call multiple times because it
 * always creates new rows (sessions are immutable).
 */

import { migrateLocalStorage, type LegacyHistoryItem } from '../api/patients';

const MIGRATION_FLAG_KEY = 'ara_phase3_migrated';
const HISTORY_KEY = 'ara_extraction_history';

interface LegacyHistoryEntry {
  id: string;
  timestamp: number;
  preview: string;
  recipientName: string;
  date: string;
  extractionMethod: string;
  form: unknown;
  rawText: string;
}

function readLegacyHistory(): LegacyHistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? (JSON.parse(stored) as LegacyHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function hasMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
  } catch {
    return true; // If localStorage is broken, don't attempt migration.
  }
}

function setMigratedFlag(): void {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
  } catch {
    // ignore
  }
}

/**
 * Run the migration if it hasn't already been performed.
 * Returns the result summary, or null if skipped.
 */
export async function runMigrationIfNeeded(): Promise<{
  migrated: boolean;
  patientId: number;
  sessionsCreated: number;
  summariesCreated: number;
} | null> {
  if (hasMigrated()) return null;

  const history = readLegacyHistory();
  if (history.length === 0) {
    setMigratedFlag();
    return null;
  }

  const items: LegacyHistoryItem[] = history.map(h => ({
    rawText: h.rawText,
    timestamp: h.timestamp,
    source: h.extractionMethod === 'manual' ? 'text' : 'ocr',
  }));

  const result = await migrateLocalStorage(items);
  setMigratedFlag();
  return result;
}
