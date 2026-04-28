import React, { useState } from 'react';

import { Btn, Card, Badge, CopyBtn } from '../components/ui';

export interface SummaryPayload {
  summary: string;
  rawText: string;
  keyPoints?: string[];
  concerns?: string[];
  actions?: string[];
  sessionId?: number;
  summaryId?: number;
  inputSource?: 'file' | 'text';
}

interface SummaryScreenProps {
  payload: SummaryPayload;
  onBack: () => void;
  onNew: () => void;
}

export function SummaryScreen({ payload, onBack, onNew }: SummaryScreenProps) {
  const isFile = payload.inputSource === 'file';
  const [showRaw, setShowRaw] = useState(isFile);

  return (
    <div className="screen" style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 0' }}>
      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={onBack}>
            ← Back
          </Btn>
          <Btn variant="secondary" size="sm" onClick={onNew}>
            + New
          </Btn>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CopyBtn text={payload.summary} label="Copy summary" />
          <Btn variant="secondary" size="sm" onClick={() => window.print()}>
            ↓ Print
          </Btn>
        </div>
      </div>

      {/* Summary card */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--accent-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            ✦
          </div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>AI Summary</span>
          <Badge color="green">✓ Generated</Badge>
        </div>
        <SummaryBody markdown={payload.summary} />
      </Card>

      {/* Raw input collapsible */}
      <Card>
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
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            fontWeight: 500,
            color: 'var(--text)',
            fontSize: 13,
          }}
          aria-expanded={showRaw}
        >
          <span>
            {isFile ? 'OCR output' : 'Original input'}{' '}
            {!showRaw && (
              <span style={{ color: 'var(--text-sub)', fontWeight: 400 }}>
                ({payload.rawText.length} chars)
              </span>
            )}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{showRaw ? '▾' : '▸'}</span>
        </button>

        {showRaw && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
              <CopyBtn text={payload.rawText} label="Copy raw" />
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--bg)',
                padding: '1rem',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 12.5,
                lineHeight: 1.65,
                margin: 0,
                maxHeight: '18rem',
                overflow: 'auto',
                color: 'var(--text-muted)',
              }}
            >
              {payload.rawText || '(no raw input)'}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryBody({ markdown }: { markdown: string }) {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>No summary available.</p>;
  }

  return (
    <div style={{ lineHeight: 1.75 }}>
      {paragraphs.map((para, i) => (
        <p key={i} style={{ margin: '0 0 0.85rem 0', fontSize: 13.5, color: 'var(--text)' }}>
          {renderInline(para)}
        </p>
      ))}
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <strong key={`b${key++}`} style={{ color: 'var(--text)', fontWeight: 600 }}>
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
