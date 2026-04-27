/**
 * Bootstrap - loads .env before any other module runs.
 *
 * In ESM, every `import` at the top of index.ts is resolved before index.ts's
 * own top-level code executes. That meant the previous layout — dotenv.config()
 * after the imports — was racing the module graph: `config/index.ts` would
 * read process.env at module-load time and the default `qwen2.5:0.5b` would
 * win before `.env` was ever parsed.
 *
 * Fix: put dotenv.config() inside a module and import it FIRST in index.ts.
 * Because imports execute in order, this module runs before any config / model
 * / client module can observe process.env, so env values reliably take effect.
 */

import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env lives at services/local-ai/.env; src/ is one level down.
const envPath = path.join(__dirname, '..', '.env');

const result = dotenv.config({ path: envPath });
if (result.error) {
  // Not fatal — we fall back to defaults in config/index.ts.
  // Surface the error so setup issues are visible in the dev log.
  console.warn('[BOOTSTRAP] .env not loaded:', result.error.message);
} else {
  console.info('[BOOTSTRAP] .env loaded from', envPath);
}
