/**
 * RAG (Retrieval-Augmented Generation) — Phase 4 core logic.
 *
 * Responsibilities:
 *   1. Embed new sessions / summaries and store vectors.
 *   2. Embed a query and retrieve top-K similar prior records for a patient.
 *   3. Format retrieved snippets into a context string for prompt injection.
 *
 * Patient scoping is hard — we never mix contexts across patients.
 */

import { config } from './config/index.js';
import { getDb } from './db/index.js';
import { logger } from './logger.js';
import { getOllamaClient } from './ollamaClient.js';
import {
  storeEmbedding,
  deleteEmbeddingsForSource,
  findTopK,
  type EmbeddingRecord,
} from './ragStore.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Embedding model. nomic-embed-text is local, fast on CPU, 768 dims. */
const EMBED_MODEL = config.ollama.embedModel;

/** Top-K records to retrieve. */
const DEFAULT_TOP_K = 3;

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

/**
 * Generate an embedding vector for a piece of text using Ollama.
 * Returns a Float32Array.
 */
export async function embedText(text: string): Promise<Float32Array> {
  const client = getOllamaClient();
  const vector = await client.embed(text, EMBED_MODEL, {
    timeout: 30000, // Embeddings are fast even on CPU
    retries: 1,
  });
  return new Float32Array(vector);
}

let missingModelLogged = false;

// ---------------------------------------------------------------------------
// Write path: embed + store sessions and summaries
// ---------------------------------------------------------------------------

/**
 * Embed and store a session's raw text.
 * Idempotent: deletes old embeddings for this session first.
 */
export async function embedSession(sessionId: number, rawText: string): Promise<void> {
  try {
    deleteEmbeddingsForSource('session.raw', sessionId);
    const vector = await embedText(rawText.substring(0, 8000)); // Cap at ~2k tokens
    storeEmbedding('session.raw', sessionId, vector, EMBED_MODEL);
    logger.info('[RAG] Embedded session', { sessionId, textLength: rawText.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') && !missingModelLogged) {
      missingModelLogged = true;
      logger.warn(
        '[RAG] Embedding model not available. RAG disabled. Run: ollama pull nomic-embed-text'
      );
    } else if (!msg.includes('not found')) {
      logger.warn('[RAG] Failed to embed session', { sessionId, error: msg });
    }
    throw err;
  }
}

/**
 * Embed and store a summary body.
 * Idempotent: deletes old embeddings for this summary first.
 */
export async function embedSummary(summaryId: number, body: string): Promise<void> {
  try {
    deleteEmbeddingsForSource('summary', summaryId);
    const vector = await embedText(body.substring(0, 8000));
    storeEmbedding('summary', summaryId, vector, EMBED_MODEL);
    logger.info('[RAG] Embedded summary', { summaryId, bodyLength: body.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not found') && !missingModelLogged) {
      missingModelLogged = true;
      logger.warn(
        '[RAG] Embedding model not available. RAG disabled. Run: ollama pull nomic-embed-text'
      );
    } else if (!msg.includes('not found')) {
      logger.warn('[RAG] Failed to embed summary', { summaryId, error: msg });
    }
    throw err;
  }
}

/**
 * Convenience: embed both a session and its summary after creation.
 * Fire-and-forget wrapper — logs errors but does not throw.
 */
export async function embedSessionAndSummary(
  sessionId: number,
  rawText: string,
  summaryId: number,
  body: string
): Promise<void> {
  try {
    await embedSession(sessionId, rawText);
    await embedSummary(summaryId, body);
  } catch {
    // Errors are already logged inside embedSession / embedSummary.
    // This wrapper exists so callers can fire-and-forget safely.
  }
}

// ---------------------------------------------------------------------------
// Read path: retrieve source text for an embedding record
// ---------------------------------------------------------------------------

/**
 * Look up the human-readable text for an embedding record.
 */
function getSourceText(record: EmbeddingRecord): string | null {
  const db = getDb();

  if (record.sourceKind === 'session.raw') {
    const row = db.prepare('SELECT raw_text FROM sessions WHERE id = ?').get(record.sourceId) as
      | { raw_text: string }
      | undefined;
    return row?.raw_text || null;
  }

  if (record.sourceKind === 'summary') {
    const row = db.prepare('SELECT body FROM summaries WHERE id = ?').get(record.sourceId) as
      | { body: string }
      | undefined;
    return row?.body || null;
  }

  if (record.sourceKind === 'chat_turn') {
    const row = db.prepare('SELECT body FROM chat_turns WHERE id = ?').get(record.sourceId) as
      | { body: string }
      | undefined;
    return row?.body || null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Query path: embed query → retrieve top-K → format context
// ---------------------------------------------------------------------------

export interface RagContextResult {
  /** Formatted context string ready for prompt injection. Empty if no matches. */
  context: string;
  /** Metadata about what was retrieved (for debugging/auditing). */
  sources: Array<{ sourceKind: string; sourceId: number; score: number; preview: string }>;
}

/**
 * Retrieve relevant prior context for a patient given new input text.
 *
 * Steps:
 *   1. Embed the query text.
 *   2. Load all embeddings for the patient.
 *   3. Find top-K most similar.
 *   4. Fetch the source text for each.
 *   5. Format into a concise context block.
 */
export async function queryRagContext(
  patientId: number,
  queryText: string,
  k: number = DEFAULT_TOP_K
): Promise<RagContextResult> {
  const queryVector = await embedText(queryText.substring(0, 8000));
  const topK = findTopK(patientId, queryVector, k, EMBED_MODEL);

  if (topK.length === 0) {
    return { context: '', sources: [] };
  }

  const sources: RagContextResult['sources'] = [];
  const snippets: string[] = [];

  for (const { record, score } of topK) {
    const text = getSourceText(record);
    if (!text) continue;

    // Truncate snippet to ~400 chars to keep prompt size reasonable
    const preview = text.substring(0, 400).trim();
    sources.push({
      sourceKind: record.sourceKind,
      sourceId: record.sourceId,
      score: Math.round(score * 1000) / 1000,
      preview,
    });
    snippets.push(preview);
  }

  const context =
    snippets.length > 0
      ? `[REFERENCE ONLY — prior visits for this patient. Do NOT include any of this in the summary unless the same information appears explicitly in the current notes below.]\n${snippets
          .map((s, i) => `[${i + 1}] ${s}`)
          .join('\n\n')}\n\n`
      : '';

  logger.info('[RAG] Context retrieved', { patientId, records: sources.length, k });
  return { context, sources };
}
