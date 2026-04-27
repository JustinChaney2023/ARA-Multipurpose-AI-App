/**
 * Migration runner.
 *
 * Philosophy: dead simple. Numbered .sql files in migrations/ are applied in
 * lexical order. A `schema_migrations` table records which ones have run so we
 * don't re-apply. Each file runs in its own transaction — if any statement
 * fails, nothing partial is left behind.
 *
 * Why not a heavyweight tool (knex, kysely, drizzle)? For a single-user local
 * DB with maybe a handful of migrations over the app's lifetime, the overhead
 * of an ORM migration framework is pure cost. This fits in 50 lines.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { logger } from '../logger.js';

import { getDb } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Apply all pending migrations in order.
 * Idempotent — safe to call on every startup.
 */
export function runMigrations(): void {
  const db = getDb();

  // Track which migrations have been applied. Self-bootstrapping: this table
  // is created on first run by this function, not by a migration file.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r: unknown) => (r as { name: string }).name)
  );

  // Sort lexically so 001_ runs before 002_ regardless of filesystem order.
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  const recordMigration = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    if (applied.has(file)) continue;

    const sqlPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Wrap the whole file in a transaction. better-sqlite3's transaction()
    // helper rolls back automatically on any thrown error from inside.
    const apply = db.transaction(() => {
      db.exec(sql);
      recordMigration.run(file, new Date().toISOString());
    });

    try {
      apply();
      logger.info('[DB] Applied migration', { file });
      appliedCount++;
    } catch (error) {
      logger.error('[DB] Migration failed', {
        file,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Fail loud — a half-migrated DB should block startup.
    }
  }

  if (appliedCount === 0) {
    logger.info('[DB] Schema up to date', { total: files.length });
  } else {
    logger.info('[DB] Migrations applied', { applied: appliedCount, total: files.length });
  }
}
