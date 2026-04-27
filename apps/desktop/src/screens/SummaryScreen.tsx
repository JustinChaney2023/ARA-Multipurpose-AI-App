/**
 * SummaryScreen - Phase 1 primary output surface.
 *
 * Renders the AI-generated summary as the headline content, with the original
 * raw input tucked into a collapsible panel below. This intentionally avoids the
 * rigid multi-section MCCMC form — that path is still available via the
 * "Fill form manually" button on ImportScreen.
 *
 * The summary itself is plain Markdown produced by the backend summarizer
 * (services/local-ai/src/summarizer.ts). We render it lightly — bold section
 * headings and paragraph breaks — without pulling in a full Markdown library.
 */

import { useState } from 'react';

import { CopyButton } from '../components/CopyButton';

// Shape of the response from POST /summarize and POST /summarize/file.
// Kept local until/unless we promote a shared type.
export interface SummaryPayload {
  summary: string;
  rawText: string;
  keyPoints?: string[];
  concerns?: string[];
  actions?: string[];
  // Phase 3: populated when the backend persisted the session + summary.
  sessionId?: number;
  summaryId?: number;
}

interface SummaryScreenProps {
  payload: SummaryPayload;
  onBack: () => void;
  onNew: () => void;
}

export function SummaryScreen({ payload, onBack, onNew }: SummaryScreenProps) {
  // Raw input is hidden by default — summary is the headline content. Users can
  // expand it when they want to verify the AI didn't miss or invent anything.
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="screen">
      {/* Action bar: navigation + copy on the right */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          <button className="btn btn-secondary" onClick={onNew}>
            + New
          </button>
        </div>
        <CopyButton text={payload.summary} label="Copy summary" size="medium" />
      </div>

      {/* Summary card — the primary output. */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Summary</h2>
        <SummaryBody markdown={payload.summary} />
      </div>

      {/* Raw input card — collapsed by default. Retains sidetracks and any
          non-health content that the summary intentionally drops. */}
      <div className="card">
        <button
          type="button"
          onClick={() => setShowRaw(v => !v)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'none',
            border: 'none',
            padding: '0.5rem 0',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
          aria-expanded={showRaw}
        >
          <span>Original input {showRaw ? '' : `(${payload.rawText.length} chars)`}</span>
          <span>{showRaw ? '▾' : '▸'}</span>
        </button>

        {showRaw && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
              <CopyButton text={payload.rawText} label="Copy raw" />
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--color-surface)',
                padding: '1rem',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                margin: 0,
                maxHeight: '24rem',
                overflow: 'auto',
              }}
            >
              {payload.rawText || '(no raw input)'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Minimal Markdown renderer for the summary body.
 *
 * The summarizer produces output shaped like:
 *   **Overview** — text...
 *   **Observations** — text...
 *
 * We only need three things:
 *   1. Bold inline (`**text**`) rendered as <strong>.
 *   2. Blank-line-separated paragraphs.
 *   3. Safe rendering (no raw HTML / XSS).
 *
 * Anything more ambitious (lists, links) can be added later if the prompt
 * format expands. Deliberately not pulling in react-markdown for this.
 */
function SummaryBody({ markdown }: { markdown: string }) {
  // Split on blank lines to get paragraphs. The summarizer currently emits
  // one section per line, but leaves room for multi-line paragraphs too.
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No summary available.</p>;
  }

  return (
    <div style={{ lineHeight: 1.7 }}>
      {paragraphs.map((para, i) => (
        <p key={i} style={{ margin: '0 0 0.75rem 0' }}>
          {renderInline(para)}
        </p>
      ))}
    </div>
  );
}

/**
 * Render a single paragraph, converting **bold** runs to <strong> elements.
 * Everything else is emitted as plain text, so there's no HTML injection risk.
 */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`b${key++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
