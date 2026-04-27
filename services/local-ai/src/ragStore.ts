/**
 * RAG Store — vector storage and retrieval for Phase 4.
 *
 * Uses the `embeddings` table from the initial migration. Each row stores a
 * single Float32Array vector as a BLOB alongside metadata (source_kind,
 * source_id, model).
 *
 * Retrieval is patient-scoped: we load ALL embeddings for a given patient
 * into memory and compute cosine similarity in JS. This is fine for a few
 * hundred records per patient; move to sqlite-vec if corpus sizes grow.
 */

import { getDb } from './db/index.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmbeddingRecord {
  id: number;
  sourceKind: 'session.raw' | 'summary' | 'chat_turn';
  sourceId: number;
  vector: Float32Array;
  model: string;
  createdAt: string;
}

export interface RetrievedContext {
  sourceKind: string;
  sourceId: number;
  score: number;
  text: string;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Store a single embedding vector.
 */
export function storeEmbedding(
  sourceKind: EmbeddingRecord['sourceKind'],
  sourceId: number,
  vector: Float32Array,
  model: string
): number {
  const db = getDb();
  const now = new Date().toISOString();
  const buffer = Buffer.from(vector.buffer);
  const result = db
    .prepare(
      'INSERT INTO embeddings (source_kind, source_id, vector, model, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(sourceKind, sourceId, buffer, model, now);
  const id = Number(result.lastInsertRowid);
  logger.debug('[RAG] Stored embedding', { id, sourceKind, sourceId, model, dims: vector.length });
  return id;
}

/**
 * Delete all embeddings tied to a specific source.
 * Call this before re-embedding a session/summary to avoid duplicates.
 */
export function deleteEmbeddingsForSource(
  sourceKind: EmbeddingRecord['sourceKind'],
  sourceId: number
): void {
  const db = getDb();
  const info = db
    .prepare('DELETE FROM embeddings WHERE source_kind = ? AND source_id = ?')
    .run(sourceKind, sourceId);
  if (info.changes > 0) {
    logger.debug('[RAG] Deleted old embeddings', { sourceKind, sourceId, count: info.changes });
  }
}

export function deleteEmbeddingsForSession(sessionId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM embeddings WHERE source_kind = 'session.raw' AND source_id = ?").run(
      sessionId
    );
    db.prepare(
      `
      DELETE FROM embeddings
      WHERE source_kind = 'summary'
        AND source_id IN (SELECT id FROM summaries WHERE session_id = ?)
      `
    ).run(sessionId);
  })();
  logger.debug('[RAG] Deleted session embeddings', { sessionId });
}

export function deleteEmbeddingsForPatient(patientId: number): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `
      DELETE FROM embeddings
      WHERE source_kind = 'session.raw'
        AND source_id IN (SELECT id FROM sessions WHERE patient_id = ?)
      `
    ).run(patientId);
    db.prepare(
      `
      DELETE FROM embeddings
      WHERE source_kind = 'summary'
        AND source_id IN (
          SELECT su.id
          FROM summaries su
          JOIN sessions s ON s.id = su.session_id
          WHERE s.patient_id = ?
        )
      `
    ).run(patientId);
    db.prepare(
      `
      DELETE FROM embeddings
      WHERE source_kind = 'chat_turn'
        AND source_id IN (SELECT id FROM chat_turns WHERE patient_id = ?)
      `
    ).run(patientId);
  })();
  logger.debug('[RAG] Deleted patient embeddings', { patientId });
}

// ---------------------------------------------------------------------------
// Read (patient-scoped)
// ---------------------------------------------------------------------------

/**
 * Load every embedding for a patient by walking their sessions, summaries,
 * and chat turns and pulling the matching embedding rows.
 *
 * This JOINs against sessions/summaries/chat_turns so we only get embeddings
 * that belong to the patient — enforcing patient scoping at the SQL level.
 */
export function loadEmbeddingsForPatient(patientId: number, model?: string): EmbeddingRecord[] {
  const db = getDb();
  const modelClause = model ? ' AND e.model = ?' : '';
  const params = model ? [patientId, model] : [patientId];

  // Sessions → embeddings
  const sessionRows = db
    .prepare(
      `
      SELECT e.id, e.source_kind, e.source_id, e.vector, e.model, e.created_at
      FROM embeddings e
      JOIN sessions s ON s.id = e.source_id
      WHERE e.source_kind = 'session.raw' AND s.patient_id = ?${modelClause}
      `
    )
    .all(...params) as RawRow[];

  // Summaries → embeddings (via sessions)
  const summaryRows = db
    .prepare(
      `
      SELECT e.id, e.source_kind, e.source_id, e.vector, e.model, e.created_at
      FROM embeddings e
      JOIN summaries su ON su.id = e.source_id
      JOIN sessions s ON s.id = su.session_id
      WHERE e.source_kind = 'summary' AND s.patient_id = ?${modelClause}
      `
    )
    .all(...params) as RawRow[];

  // Chat turns → embeddings
  const chatRows = db
    .prepare(
      `
      SELECT e.id, e.source_kind, e.source_id, e.vector, e.model, e.created_at
      FROM embeddings e
      JOIN chat_turns c ON c.id = e.source_id
      WHERE e.source_kind = 'chat_turn' AND c.patient_id = ?${modelClause}
      `
    )
    .all(...params) as RawRow[];

  return [...sessionRows, ...summaryRows, ...chatRows].map(parseRow);
}

interface RawRow {
  id: number;
  source_kind: string;
  source_id: number;
  vector: Buffer;
  model: string;
  created_at: string;
}

function parseRow(row: RawRow): EmbeddingRecord {
  return {
    id: row.id,
    sourceKind: row.source_kind as EmbeddingRecord['sourceKind'],
    sourceId: row.source_id,
    vector: bufferToFloat32Array(row.vector),
    model: row.model,
    createdAt: row.created_at,
  };
}

function bufferToFloat32Array(buf: Buffer): Float32Array {
  // Safe copy — avoids alignment issues with Buffer's underlying ArrayBuffer.
  const arr = new Float32Array(buf.length / 4);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = buf.readFloatLE(i * 4);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/**
 * Cosine similarity between two equal-length Float32Arrays.
 * Returns a value between -1 and 1.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Retrieve the top-K most similar records for a query vector, scoped to a
 * single patient. Returns records augmented with their similarity score.
 */
export function findTopK(
  patientId: number,
  queryVector: Float32Array,
  k: number,
  model?: string
): Array<{ record: EmbeddingRecord; score: number }> {
  const records = loadEmbeddingsForPatient(patientId, model).filter(
    record => record.vector.length === queryVector.length
  );
  if (records.length === 0) return [];

  const scored = records.map(record => ({
    record,
    score: cosineSimilarity(queryVector, record.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
