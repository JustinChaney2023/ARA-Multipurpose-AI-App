/**
 * SQLite connection module.
 *
 * One Database instance is shared across the service lifetime. better-sqlite3
 * is synchronous and thread-safe for our single-process access pattern — we
 * don't need a pool.
 *
 * Design choices:
 * - File lives under `services/local-ai/data/ara.db` by default. Overridable
 *   via DB_PATH so power users can put it on a faster drive or external volume.
 * - WAL mode is enabled for better read-during-write behavior. That matters
 *   when the summarizer is generating (a long write) while the UI polls for
 *   history or prompts.
 * - Foreign keys are OFF by default in SQLite — we turn them on per-connection
 *   so ON DELETE CASCADE actually fires.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Database from 'better-sqlite3';

import { config } from '../config/index.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * Resolve the absolute DB file path and ensure its directory exists.
 * Kept as a function (not a constant) so tests can override process.env.DB_PATH
 * between runs without module caching issues.
 */
function resolveDbPath(): string {
  const configured = config.db.path;
  // config.db.path is already resolved to absolute during loadConfig, but we
  // defensively normalize here so tests that pass a relative path still work.
  const absolute = path.isAbsolute(configured)
    ? configured
    : path.resolve(__dirname, '..', '..', configured);
  const dir = path.dirname(absolute);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return absolute;
}

/**
 * Lazily open the database. Called by getDb() and by migrate().
 * Returns the same instance on subsequent calls.
 */
function open(): Database.Database {
  if (db) return db;
  const dbPath = resolveDbPath();
  db = new Database(dbPath);
  // WAL: readers don't block writers, critical while a summary is streaming.
  db.pragma('journal_mode = WAL');
  // Foreign keys must be enabled per-connection in SQLite.
  db.pragma('foreign_keys = ON');
  logger.info('[DB] Connected', { path: dbPath });
  return db;
}

/**
 * Get the shared Database instance, opening it on first call.
 * Callers should use prepared statements for hot paths.
 */
export function getDb(): Database.Database {
  return open();
}

/**
 * Close the database. Called during graceful shutdown.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('[DB] Closed');
  }
}
