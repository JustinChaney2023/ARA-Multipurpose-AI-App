# Phase 4 — RAG Over Prior Patient Notes

**Status**: planned, starts after Phase 3 (depends on the DB being in place).
**Goal**: when summarizing or chatting about a patient, let the LLM pull relevant context from that patient's prior sessions, summaries, and chat turns.

## Why

Justin's requirement: *"the llm can use RAG if needed so the llm has context on previous talks about the same patient."* Longitudinal context is the difference between generic summaries and genuinely useful caregiving notes.

## Shape of the feature

1. On write: each new session's raw text, each new summary, and each chat turn is embedded and stored.
2. On read: when generating a summary or answering a chat, pull the top-K most similar prior records **scoped to the same patient**, inject as context into the prompt.
3. Patient scoping is a hard constraint — never mix patients' context even if vectors are close.

## Building blocks

### Embedding model

Candidates:
- **Ollama `nomic-embed-text`** — local, matches the existing Ollama-first architecture, 768 dims, fast on CPU.
- **Ollama `mxbai-embed-large`** — larger, higher quality, slower.
- **Sentence-transformers via Python sidecar** — rules out if we want to keep one runtime.

**Leaning: `nomic-embed-text`** — fits the local-first story, reuses the existing Ollama client, good enough for retrieval inside a single patient's corpus.

### Vector storage

- Use the `embeddings` table from Phase 3 with `vector BLOB` (`Float32Array` serialized).
- **Option A: [`sqlite-vec`](https://github.com/asg017/sqlite-vec)** — purpose-built SQLite vector extension, fast nearest-neighbor via SQL. Needs bundling the extension with the app.
- **Option B: in-memory cosine sim** — load patient's vectors into JS, compute similarity. Simpler, fine for <10k vectors per patient.

**Leaning: start with Option B** because a patient's corpus is unlikely to exceed a few hundred records. Move to `sqlite-vec` if perf becomes an issue.

### Retrieval query

```
SELECT top K records
WHERE patient_id = ?
ORDER BY cosine_similarity(vector, query_vector) DESC
LIMIT K
```

Chunking: sessions can be long. Chunk raw text into ~500-token windows with 50-token overlap before embedding, store chunk-level embeddings with a back-reference to the source session.

## Prompt integration

Summarization and chat prompts gain a new `{{context}}` placeholder populated with retrieved snippets:

```
Here is prior context about this patient from earlier visits:
<context>
{{context}}
</context>

New input:
{{rawText}}
```

The prompt-editing UI (Phase 2) exposes this placeholder so users can tune how context is presented.

## API surface

New endpoints on `services/local-ai`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/embed` | Embed a piece of text (internal, called during write paths) |
| POST | `/rag/query` | Given `{patientId, query, k}` return top-K context records |

The summarize / chat endpoints gain an optional `patientId` that triggers RAG context injection.

## Non-goals for Phase 4

- No cross-patient retrieval.
- No re-ranking beyond cosine similarity (add later if retrieval quality is poor).
- No live incremental index updates — embed on write, done.

## Open questions

- Embedding model choice — confirm `nomic-embed-text` works with the current Ollama build and has acceptable latency.
- Chunk size and overlap tuning — start with 500/50 tokens, measure.
- Is there a privacy concern with embedding sidetracks? (Probably no — stays local like everything else. Worth a line in the HIPAA notes.)
