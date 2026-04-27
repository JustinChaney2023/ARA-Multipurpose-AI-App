# Running Tests

Quick reference for running the test suites in this monorepo. Tests are written
with **Vitest** and live in two packages:

- `services/local-ai/src/__tests__/` — backend (Express, OCR, LLM pipeline)
- `packages/shared/src/__tests__/` — shared schemas and utilities

## All tests (root)

Run from the repo root.

```bash
# Run every workspace's test suite
npm run test

# Run with coverage (uses root vitest config)
npm run test:coverage

# Full CI pipeline: lint + typecheck + test
npm run ci
```

## Backend service — `@ara/local-ai`

```bash
# One-shot run
npm run -w services/local-ai test

# Watch mode (re-runs on file change)
npm run -w services/local-ai test:watch
```

Or from inside the package:

```bash
cd services/local-ai
npx vitest run                           # all tests once
npx vitest                               # watch mode
npx vitest run src/__tests__/narrativeQA.test.ts    # single file
npx vitest run src/__tests__/integration.test.ts    # integration only
npx vitest run -t "extracts recipient name"         # single test by name
```

## Shared package — `@ara/shared`

```bash
npm run -w packages/shared test

# Or from inside the package
cd packages/shared
npx vitest run
npx vitest run src/__tests__/schema.test.ts
```

## Speeding up LLM tests

LLM integration tests hit Ollama and have a **5-minute timeout per test**. For
fast iteration:

```bash
# Skip LLM entirely — uses rule-based fallbacks
DISABLE_LLM=true npm run -w services/local-ai test

# PowerShell
$env:DISABLE_LLM="true"; npm run -w services/local-ai test
```

See [fast-testing.md](fast-testing.md) for using tiny Ollama models (e.g.
`qwen2.5:0.5b`) to keep LLM tests on but fast.

## Coverage

```bash
npm run test:coverage
```

Coverage thresholds (enforced on `services/local-ai`):

- Lines: **50%**
- Functions: **50%**
- Branches: **40%**

HTML report lands in `coverage/index.html` at the repo root.

## Related quality checks

These aren't tests, but are part of `npm run ci` and worth running alongside:

```bash
npm run lint            # ESLint
npm run lint:fix        # ESLint with auto-fix
npm run typecheck       # TypeScript across all workspaces
npm run format:check    # Prettier (check only)
npm run format          # Prettier (write)
```

## Troubleshooting

- **Integration tests hang or time out** → Ollama likely isn't running or the
  configured model isn't pulled. Check `curl http://localhost:11434/api/tags`,
  or set `DISABLE_LLM=true`.
- **`Cannot find module '@ara/shared'`** → Run
  `npm run -w packages/shared build` first; the service imports the compiled
  `dist/`.
- **Vitest can't find tests** → Make sure you're running from the correct
  workspace root; test files must match `**/*.test.ts`.
