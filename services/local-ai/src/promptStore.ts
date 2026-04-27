/**
 * Prompt store — the single source of truth for all prompts at runtime.
 *
 * Everything the summarizer / categorizer / Q&A pipeline uses passes through
 * here instead of hard-coded strings. That gives us three things:
 *
 *   1. **User-editable** — a settings UI can GET/PUT any prompt by name.
 *   2. **Resettable** — the factory default is stored alongside so a bad edit
 *      can be undone with one click.
 *   3. **Auditable** — future summary rows can link back to the prompt name
 *      (and a hash of its body) so we know which version produced them.
 *
 * Templates use `{{variable}}` placeholders. `render()` substitutes them in a
 * single pass so a later variable's value can contain `{{...}}` without being
 * re-expanded (avoids accidental recursion and injection surprises).
 */

import { getDb } from './db/index.js';
import { DEFAULT_PROMPTS, type PromptDefault } from './defaults/prompts.js';
import { logger } from './logger.js';

export interface PromptRecord {
  name: string;
  body: string;
  defaultBody: string;
  description: string;
  updatedAt: string;
  // True if the current body matches the default — handy for the UI to grey
  // out the "Reset" button.
  isDefault: boolean;
}

interface PromptRow {
  name: string;
  body: string;
  default_body: string;
  description: string;
  updated_at: string;
}

/**
 * Seed any missing prompts from the defaults catalog. Called once on startup.
 *
 * We do NOT overwrite existing rows — a user may have already customized the
 * body. If a default *body* changes in code, we update only `default_body`
 * and `description` so the UI's "Preview default" still reflects the latest
 * factory text, while the user's edit stays intact.
 */
export function seedDefaultPrompts(): void {
  const db = getDb();
  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO prompts (name, body, default_body, description, updated_at)
    VALUES (@name, @body, @body, @description, @now)
  `);
  const updateDefaultOnly = db.prepare(`
    UPDATE prompts
    SET default_body = @body, description = @description
    WHERE name = @name AND (default_body != @body OR description != @description)
  `);
  const updateBodyIfUnchanged = db.prepare(`
    UPDATE prompts
    SET body = @body, default_body = @body, description = @description
    WHERE name = @name AND body = default_body
  `);
  const existing = db.prepare('SELECT name FROM prompts WHERE name = ?');

  const seed = db.transaction((prompts: PromptDefault[]) => {
    let inserted = 0;
    let refreshed = 0;
    let synced = 0;
    for (const p of prompts) {
      if (existing.get(p.name)) {
        // If user never customized (body === old default), sync body too
        const syncInfo = updateBodyIfUnchanged.run({
          name: p.name,
          body: p.body,
          description: p.description,
        });
        if (syncInfo.changes > 0) {
          synced++;
          continue;
        }
        // Otherwise just refresh the stored factory default for "Reset" UI
        const info = updateDefaultOnly.run({
          name: p.name,
          body: p.body,
          description: p.description,
        });
        if (info.changes > 0) refreshed++;
      } else {
        insert.run({ name: p.name, body: p.body, description: p.description, now });
        inserted++;
      }
    }
    return { inserted, refreshed, synced };
  });

  const result = seed(DEFAULT_PROMPTS);
  if (result.inserted > 0 || result.refreshed > 0 || result.synced > 0) {
    logger.info('[PROMPTS] Seed complete', result);
  }
}

/**
 * Fetch a single prompt body (currently-active text).
 * Throws if the name is unknown — callers should use known names from the
 * defaults catalog, so a miss indicates a bug, not user input.
 */
export function getPromptBody(name: string): string {
  const db = getDb();
  const row = db.prepare('SELECT body FROM prompts WHERE name = ?').get(name) as
    | { body: string }
    | undefined;
  if (!row) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return row.body;
}

/**
 * Fetch the full record (for the settings UI).
 */
export function getPromptRecord(name: string): PromptRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT name, body, default_body, description, updated_at FROM prompts WHERE name = ?')
    .get(name) as PromptRow | undefined;
  return row ? toRecord(row) : null;
}

/**
 * List all prompts. Ordered by name so the UI presentation is stable.
 */
export function listPrompts(): PromptRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT name, body, default_body, description, updated_at FROM prompts ORDER BY name')
    .all() as PromptRow[];
  return rows.map(toRecord);
}

/**
 * Update a prompt body. Returns the updated record, or null if the name is
 * unknown (so the HTTP layer can 404).
 */
export function setPromptBody(name: string, body: string): PromptRecord | null {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare('UPDATE prompts SET body = ?, updated_at = ? WHERE name = ?')
    .run(body, now, name);
  if (info.changes === 0) return null;
  logger.info('[PROMPTS] Updated', { name, bodyLength: body.length });
  return getPromptRecord(name);
}

/**
 * Reset a prompt to its factory default.
 */
export function resetPrompt(name: string): PromptRecord | null {
  const db = getDb();
  const defaultRow = db.prepare('SELECT default_body FROM prompts WHERE name = ?').get(name) as
    | { default_body: string }
    | undefined;
  if (!defaultRow) return null;
  return setPromptBody(name, defaultRow.default_body);
}

/**
 * Render a template body by substituting {{var}} placeholders in a single pass.
 *
 * Done as a single regex so values containing `{{...}}` aren't re-expanded.
 * Unknown placeholders are left intact rather than silently replaced with an
 * empty string — makes typos in prompt edits visible in the output instead of
 * disappearing into the void.
 */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

function toRecord(row: PromptRow): PromptRecord {
  return {
    name: row.name,
    body: row.body,
    defaultBody: row.default_body,
    description: row.description,
    updatedAt: row.updated_at,
    isDefault: row.body === row.default_body,
  };
}
