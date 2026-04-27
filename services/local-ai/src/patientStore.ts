/**
 * Patient store — repository for patients, folders, sessions, and summaries.
 *
 * This is the data access layer for all Phase 3 persistence. Every table
 * defined in the initial migration (001_initial.sql) that isn't covered by
 * promptStore.ts lives here.
 *
 * Design choices:
 * - Synchronous (better-sqlite3) like promptStore.ts — no async/await noise.
 * - Returns plain objects so the HTTP layer can serialize them directly.
 * - Cascading deletes are handled by SQLite foreign keys, but we still clean
 *   up related in-memory state (progress trackers) where needed.
 */

import { getDb } from './db/index.js';
import { logger } from './logger.js';
import { deleteEmbeddingsForPatient, deleteEmbeddingsForSession } from './ragStore.js';

// ============================================================================
// Types
// ============================================================================

export interface Patient {
  id: number;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  folderIds: number[];
}

export interface Folder {
  id: number;
  name: string;
  createdAt: string;
  patientCount: number;
}

export interface Session {
  id: number;
  patientId: number;
  source: string;
  rawText: string;
  createdAt: string;
}

export interface Summary {
  id: number;
  sessionId: number;
  body: string;
  promptName: string;
  model: string;
  createdAt: string;
}

export interface SessionWithSummaries extends Session {
  summaries: Summary[];
}

export interface PatientWithSessions extends Patient {
  sessions: SessionWithSummaries[];
}

// ============================================================================
// Patients
// ============================================================================

export function createPatient(displayName: string): Patient {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO patients (display_name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(displayName, now, now);
  const id = Number(result.lastInsertRowid);
  logger.info('[PATIENTS] Created', { id, displayName });
  return { id, displayName, createdAt: now, updatedAt: now, folderIds: [] };
}

export function listPatients(): Patient[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.display_name,
        p.created_at,
        p.updated_at,
        GROUP_CONCAT(pf.folder_id) as folder_ids
      FROM patients p
      LEFT JOIN patient_folders pf ON pf.patient_id = p.id
      GROUP BY p.id
      ORDER BY p.display_name COLLATE NOCASE
      `
    )
    .all() as Array<{
    id: number;
    display_name: string;
    created_at: string;
    updated_at: string;
    folder_ids: string | null;
  }>;

  return rows.map(r => ({
    id: r.id,
    displayName: r.display_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    folderIds: r.folder_ids ? r.folder_ids.split(',').map(Number) : [],
  }));
}

export function getPatient(id: number): Patient | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        p.id,
        p.display_name,
        p.created_at,
        p.updated_at,
        GROUP_CONCAT(pf.folder_id) as folder_ids
      FROM patients p
      LEFT JOIN patient_folders pf ON pf.patient_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
      `
    )
    .get(id) as
    | {
        id: number;
        display_name: string;
        created_at: string;
        updated_at: string;
        folder_ids: string | null;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    folderIds: row.folder_ids ? row.folder_ids.split(',').map(Number) : [],
  };
}

export function updatePatient(id: number, displayName: string): Patient | null {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare('UPDATE patients SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName, now, id);
  if (info.changes === 0) return null;
  logger.info('[PATIENTS] Updated', { id, displayName });
  return getPatient(id);
}

export function deletePatient(id: number): boolean {
  const db = getDb();
  deleteEmbeddingsForPatient(id);
  const info = db.prepare('DELETE FROM patients WHERE id = ?').run(id);
  const removed = info.changes > 0;
  if (removed) logger.info('[PATIENTS] Deleted', { id });
  return removed;
}

// ============================================================================
// Folders
// ============================================================================

export function createFolder(name: string): Folder {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO folders (name, created_at) VALUES (?, ?)').run(name, now);
  const id = Number(result.lastInsertRowid);
  logger.info('[FOLDERS] Created', { id, name });
  return { id, name, createdAt: now, patientCount: 0 };
}

export function listFolders(): Folder[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        f.id,
        f.name,
        f.created_at,
        COUNT(pf.patient_id) as patient_count
      FROM folders f
      LEFT JOIN patient_folders pf ON pf.folder_id = f.id
      GROUP BY f.id
      ORDER BY f.name COLLATE NOCASE
      `
    )
    .all() as Array<{
    id: number;
    name: string;
    created_at: string;
    patient_count: number;
  }>;

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    patientCount: r.patient_count,
  }));
}

export function getFolder(id: number): Folder | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        f.id,
        f.name,
        f.created_at,
        COUNT(pf.patient_id) as patient_count
      FROM folders f
      LEFT JOIN patient_folders pf ON pf.folder_id = f.id
      WHERE f.id = ?
      GROUP BY f.id
      `
    )
    .get(id) as { id: number; name: string; created_at: string; patient_count: number } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    patientCount: row.patient_count,
  };
}

export function updateFolder(id: number, name: string): Folder | null {
  const db = getDb();
  const info = db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
  if (info.changes === 0) return null;
  logger.info('[FOLDERS] Updated', { id, name });
  return getFolder(id);
}

export function deleteFolder(id: number): boolean {
  const db = getDb();
  const info = db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  const removed = info.changes > 0;
  if (removed) logger.info('[FOLDERS] Deleted', { id });
  return removed;
}

// ============================================================================
// Patient ↔ Folder links
// ============================================================================

export function addPatientToFolder(patientId: number, folderId: number): boolean {
  const db = getDb();
  try {
    db.prepare('INSERT INTO patient_folders (patient_id, folder_id) VALUES (?, ?)').run(
      patientId,
      folderId
    );
    logger.info('[PATIENT_FOLDERS] Linked', { patientId, folderId });
    return true;
  } catch (err) {
    // UNIQUE constraint violation = already linked; treat as success
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      return true;
    }
    throw err;
  }
}

export function removePatientFromFolder(patientId: number, folderId: number): boolean {
  const db = getDb();
  const info = db
    .prepare('DELETE FROM patient_folders WHERE patient_id = ? AND folder_id = ?')
    .run(patientId, folderId);
  const removed = info.changes > 0;
  if (removed) logger.info('[PATIENT_FOLDERS] Unlinked', { patientId, folderId });
  return removed;
}

// ============================================================================
// Sessions
// ============================================================================

export function createSession(
  patientId: number,
  source: 'text' | 'ocr' | 'audio',
  rawText: string
): Session {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO sessions (patient_id, source, raw_text, created_at) VALUES (?, ?, ?, ?)')
    .run(patientId, source, rawText, now);
  const id = Number(result.lastInsertRowid);
  logger.info('[SESSIONS] Created', { id, patientId, source, rawTextLength: rawText.length });
  return { id, patientId, source, rawText, createdAt: now };
}

export function listSessionsForPatient(patientId: number): Session[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, patient_id, source, raw_text, created_at FROM sessions WHERE patient_id = ? ORDER BY created_at DESC'
    )
    .all(patientId) as Array<{
    id: number;
    patient_id: number;
    source: string;
    raw_text: string;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    patientId: r.patient_id,
    source: r.source,
    rawText: r.raw_text,
    createdAt: r.created_at,
  }));
}

export function getSession(id: number): Session | null {
  const db = getDb();
  const row = db
    .prepare('SELECT id, patient_id, source, raw_text, created_at FROM sessions WHERE id = ?')
    .get(id) as
    | { id: number; patient_id: number; source: string; raw_text: string; created_at: string }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    source: row.source,
    rawText: row.raw_text,
    createdAt: row.created_at,
  };
}

export function deleteSession(id: number): boolean {
  const db = getDb();
  deleteEmbeddingsForSession(id);
  const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  const removed = info.changes > 0;
  if (removed) logger.info('[SESSIONS] Deleted', { id });
  return removed;
}

// ============================================================================
// Summaries
// ============================================================================

export function createSummary(
  sessionId: number,
  body: string,
  promptName: string,
  model: string
): Summary {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(
      'INSERT INTO summaries (session_id, body, prompt_name, model, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(sessionId, body, promptName, model, now);
  const id = Number(result.lastInsertRowid);
  logger.info('[SUMMARIES] Created', { id, sessionId, promptName, model });
  return { id, sessionId, body, promptName, model, createdAt: now };
}

export function listSummariesForSession(sessionId: number): Summary[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, session_id, body, prompt_name, model, created_at FROM summaries WHERE session_id = ? ORDER BY created_at DESC'
    )
    .all(sessionId) as Array<{
    id: number;
    session_id: number;
    body: string;
    prompt_name: string;
    model: string;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    sessionId: r.session_id,
    body: r.body,
    promptName: r.prompt_name,
    model: r.model,
    createdAt: r.created_at,
  }));
}

export function getSummary(id: number): Summary | null {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT id, session_id, body, prompt_name, model, created_at FROM summaries WHERE id = ?'
    )
    .get(id) as
    | {
        id: number;
        session_id: number;
        body: string;
        prompt_name: string;
        model: string;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    body: row.body,
    promptName: row.prompt_name,
    model: row.model,
    createdAt: row.created_at,
  };
}

// ============================================================================
// Composite reads (for detail views)
// ============================================================================

export function getPatientWithSessions(patientId: number): PatientWithSessions | null {
  const patient = getPatient(patientId);
  if (!patient) return null;

  const sessions = listSessionsForPatient(patientId);
  const sessionsWithSummaries: SessionWithSummaries[] = sessions.map(s => ({
    ...s,
    summaries: listSummariesForSession(s.id),
  }));

  return { ...patient, sessions: sessionsWithSummaries };
}

// ============================================================================
// Chat turns
// ============================================================================

export interface ChatTurn {
  id: number;
  patientId: number;
  role: 'user' | 'assistant';
  body: string;
  createdAt: string;
}

export function createChatTurn(
  patientId: number,
  role: 'user' | 'assistant',
  body: string
): ChatTurn {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO chat_turns (patient_id, role, body, created_at) VALUES (?, ?, ?, ?)')
    .run(patientId, role, body, now);
  const id = Number(result.lastInsertRowid);
  logger.info('[CHAT] Turn created', { id, patientId, role });
  return { id, patientId, role, body, createdAt: now };
}

export function listChatTurnsForPatient(patientId: number): ChatTurn[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, patient_id, role, body, created_at FROM chat_turns WHERE patient_id = ? ORDER BY created_at ASC'
    )
    .all(patientId) as Array<{
    id: number;
    patient_id: number;
    role: string;
    body: string;
    created_at: string;
  }>;

  return rows.map(r => ({
    id: r.id,
    patientId: r.patient_id,
    role: r.role as 'user' | 'assistant',
    body: r.body,
    createdAt: r.created_at,
  }));
}

export function deleteChatTurn(id: number): boolean {
  const db = getDb();
  const info = db.prepare('DELETE FROM chat_turns WHERE id = ?').run(id);
  const removed = info.changes > 0;
  if (removed) logger.info('[CHAT] Turn deleted', { id });
  return removed;
}

// ============================================================================
// Migration helpers
// ============================================================================

/**
 * Ensure an "Unassigned" patient exists for localStorage migration.
 * Returns the patient id (creates if necessary).
 */
export function getOrCreateUnassignedPatient(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM patients WHERE display_name = 'Unassigned' ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;

  if (row) return row.id;

  const created = createPatient('Unassigned');
  return created.id;
}

/**
 * Import a batch of legacy history items as sessions + summaries under a
 * single patient. Used by the one-time localStorage → DB migration endpoint.
 */
export function importLegacyHistoryItems(
  patientId: number,
  items: Array<{ rawText: string; summary?: string; timestamp?: number; source?: string }>
): { sessionsCreated: number; summariesCreated: number } {
  const db = getDb();
  let sessionsCreated = 0;
  let summariesCreated = 0;

  const now = new Date().toISOString();

  const insertSession = db.prepare(
    'INSERT INTO sessions (patient_id, source, raw_text, created_at) VALUES (?, ?, ?, ?)'
  );
  const insertSummary = db.prepare(
    'INSERT INTO summaries (session_id, body, prompt_name, model, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  const batch = db.transaction((data: typeof items) => {
    for (const item of data) {
      const createdAt = item.timestamp ? new Date(item.timestamp).toISOString() : now;
      const sessionResult = insertSession.run(
        patientId,
        item.source || 'text',
        item.rawText,
        createdAt
      );
      sessionsCreated++;

      const sessionId = Number(sessionResult.lastInsertRowid);
      if (item.summary && item.summary.trim().length > 0) {
        insertSummary.run(sessionId, item.summary.trim(), 'summarizer.main', 'unknown', createdAt);
        summariesCreated++;
      }
    }
  });

  batch(items);
  logger.info('[MIGRATE] Imported legacy history', {
    patientId,
    sessionsCreated,
    summariesCreated,
  });
  return { sessionsCreated, summariesCreated };
}
