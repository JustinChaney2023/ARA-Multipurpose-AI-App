import { useEffect, useMemo, useState } from 'react';

import { Btn, Card } from '../components/ui';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PromptRecord {
  name: string;
  body: string;
  defaultBody: string;
  description: string;
  updatedAt: string;
  isDefault: boolean;
}

interface Props {
  onBack: () => void;
}

function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  const regex = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = regex.exec(body)) !== null) found.add(match[1]);
  return Array.from(found).sort();
}

export function SettingsScreen({ onBack }: Props) {
  const [prompts, setPrompts] = useState<PromptRecord[] | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/prompts`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        if (cancelled) return;
        setPrompts(data.prompts);
        if (data.prompts.length > 0) {
          setSelectedName(data.prompts[0].name);
          setDraft(data.prompts[0].body);
        }
        setLoadError(null);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load prompts');
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => prompts?.find(p => p.name === selectedName) ?? null, [prompts, selectedName]);

  const handleSelect = (name: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    const next = prompts?.find(p => p.name === name);
    if (!next) return;
    setSelectedName(name); setDraft(next.body); setSaveError(null); setStatusNote(null);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true); setSaveError(null); setStatusNote(null);
    try {
      const res = await fetch(`${API_BASE_URL}/prompts/${selected.name}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const updated: PromptRecord = await res.json();
      setPrompts(prev => prev?.map(p => p.name === updated.name ? updated : p) ?? null);
      setDraft(updated.body);
      setStatusNote('Saved. Takes effect on the next summary.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!selected) return;
    setSaving(true); setSaveError(null); setStatusNote(null);
    try {
      const res = await fetch(`${API_BASE_URL}/prompts/${selected.name}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const updated: PromptRecord = await res.json();
      setPrompts(prev => prev?.map(p => p.name === updated.name ? updated : p) ?? null);
      setDraft(updated.body); setStatusNote('Reset to default.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reset failed');
    } finally { setSaving(false); }
  };

  const placeholders = useMemo(() => selected ? extractPlaceholders(selected.defaultBody) : [], [selected]);
  const dirty = selected !== null && draft !== selected.body;

  return (
    <div className="screen" style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 0' }}>
      {/* Header */}
      <div className="settings-header">
        <Btn variant="secondary" size="sm" onClick={onBack}>← Back</Btn>
        <h2>Settings</h2>
      </div>

      {/* Load error */}
      {loadError && (
        <Card style={{ background: 'var(--red-dim)', border: '1px solid var(--red)' }}>
          <span style={{ color: 'var(--red)', fontSize: 13 }}>
            Could not load prompts: {loadError}. Make sure the local-ai service is running.
          </span>
        </Card>
      )}

      {prompts && (
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.75rem' }}>
          {/* Left nav */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: 'var(--text-sub)', padding: '4px 8px', marginBottom: 4,
            }}>
              AI Prompts
            </div>
            {prompts.map(p => (
              <button
                key={p.name}
                onClick={() => handleSelect(p.name)}
                className={`prompt-list-item${selectedName === p.name ? ' active' : ''}`}
              >
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{p.name}</span>
                {!p.isDefault && (
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--amber)', marginTop: 1 }}>
                    customized
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Editor pane */}
          {selected ? (
            <Card style={{ marginBottom: 0 }}>
              <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.description}</div>
              </div>

              {/* Variable chips */}
              {placeholders.length > 0 && (
                <div style={{ marginBottom: 10, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Variables:</span>
                  {placeholders.map(v => (
                    <code key={v} style={{
                      background: 'var(--surface2)', border: '1px solid var(--border2)',
                      padding: '1px 6px', borderRadius: 4, marginRight: 6, fontSize: 11,
                      color: 'var(--accent)', fontFamily: 'ui-monospace, monospace',
                    }}>{`{{${v}}}`}</code>
                  ))}
                </div>
              )}

              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
                rows={12}
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg)', border: '1px solid var(--border2)',
                  borderRadius: 'var(--radius)', color: 'var(--text)',
                  fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5,
                  lineHeight: 1.65, resize: 'vertical', outline: 'none', marginBottom: '0.75rem',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border2)')}
              />

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Btn onClick={handleSave} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Btn>
                <Btn variant="secondary" onClick={handleReset}
                  disabled={selected.isDefault || saving}
                  title={selected.isDefault ? 'Already at factory default' : 'Restore factory default'}>
                  Reset to default
                </Btn>
                <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>
                  Updated {new Date(selected.updatedAt).toLocaleString()}
                </span>
              </div>

              {statusNote && (
                <div style={{ color: 'var(--green)', fontSize: 13, marginTop: 10 }}>{statusNote}</div>
              )}
              {saveError && (
                <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{saveError}</div>
              )}

              {/* Factory default collapsible */}
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>
                  Factory default (read-only)
                </summary>
                <pre style={{
                  background: 'var(--bg)', padding: '10px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', whiteSpace: 'pre-wrap', fontSize: 12,
                  marginTop: 8, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace',
                  lineHeight: 1.6,
                }}>
                  {selected.defaultBody}
                </pre>
              </details>
            </Card>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>No prompts available.</p>
          )}
        </div>
      )}
    </div>
  );
}
