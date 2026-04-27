/**
 * Settings — Prompts editor.
 *
 * Surface for the Phase 2 editable-prompts feature. Lists every prompt the
 * service exposes, lets the user edit the body in a textarea, save, and reset
 * to the factory default. Variable placeholders the prompt accepts (e.g.
 * `{{rawText}}`) are extracted from the default body and shown as chips under
 * the editor so users know what tokens stay live.
 *
 * No routing library — parent App.tsx flips a screen state between 'settings'
 * and the others, matching the rest of the app's conditional-rendering flow.
 */

import { useEffect, useMemo, useState } from 'react';

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

/**
 * Pull out `{{varName}}` placeholders from a template. Used to show the user
 * which variables are available while editing — if they remove a placeholder
 * the runtime will still render, it just won't substitute the value.
 */
function extractPlaceholders(body: string): string[] {
  const found = new Set<string>();
  const regex = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found).sort();
}

export function SettingsScreen({ onBack }: Props) {
  const [prompts, setPrompts] = useState<PromptRecord[] | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // Draft body — separate from the server-state prompt so typing in the editor
  // doesn't fight with the "isDefault" indicator. Saved on explicit Save click.
  const [draft, setDraft] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Load the list on mount. One request; if it fails, show the error with a
  // retry — the service might be starting up or Ollama warming.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/prompts`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        if (cancelled) return;
        setPrompts(data.prompts);
        // Auto-select the first one so the user sees an editor without a click.
        if (data.prompts.length > 0) {
          setSelectedName(data.prompts[0].name);
          setDraft(data.prompts[0].body);
        }
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load prompts');
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => prompts?.find(p => p.name === selectedName) ?? null,
    [prompts, selectedName]
  );

  // When the user picks a different prompt, swap the draft to match that
  // prompt's current body. If there are unsaved edits, confirm before discarding.
  const handleSelect = (name: string) => {
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    const next = prompts?.find(p => p.name === name);
    if (!next) return;
    setSelectedName(name);
    setDraft(next.body);
    setSaveError(null);
    setStatusNote(null);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    setStatusNote(null);
    try {
      const res = await fetch(`${API_BASE_URL}/prompts/${selected.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const updated: PromptRecord = await res.json();
      setPrompts(prev => prev?.map(p => (p.name === updated.name ? updated : p)) ?? null);
      setDraft(updated.body);
      setStatusNote('Saved. Takes effect on the next summary.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    // Intentional: no confirmation dialog. The action is fully reversible —
    // the user can edit back to a prior body from memory, and the default is
    // always visible in the "Factory default" preview below.
    setSaving(true);
    setSaveError(null);
    setStatusNote(null);
    try {
      const res = await fetch(`${API_BASE_URL}/prompts/${selected.name}/reset`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const updated: PromptRecord = await res.json();
      setPrompts(prev => prev?.map(p => (p.name === updated.name ? updated : p)) ?? null);
      setDraft(updated.body);
      setStatusNote('Reset to default.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const placeholders = useMemo(
    () => (selected ? extractPlaceholders(selected.defaultBody) : []),
    [selected]
  );

  const dirty = selected !== null && draft !== selected.body;

  return (
    <div className="screen">
      <div className="settings-header">
        <h2>Settings — Prompts</h2>
        <button onClick={onBack} className="btn btn-secondary">
          Back
        </button>
      </div>

      {loadError && (
        <div
          className="card"
          style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}
        >
          Could not load prompts: {loadError}. Make sure the local-ai service is running.
        </div>
      )}

      {prompts && (
        <div className="settings-body" style={{ display: 'flex', gap: '1rem' }}>
          {/* Left rail: prompt picker. Thin list, selection highlights. */}
          <aside className="prompt-list" style={{ minWidth: 220 }}>
            {prompts.map(p => (
              <button
                key={p.name}
                onClick={() => handleSelect(p.name)}
                className={`prompt-list-item ${selectedName === p.name ? 'active' : ''}`}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.5rem 0.75rem',
                  marginBottom: 4,
                  background: selectedName === p.name ? '#e8f0fe' : 'transparent',
                  border: '1px solid #d0d7de',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.name}</div>
                {!p.isDefault && <span style={{ fontSize: 11, color: '#0969da' }}>customized</span>}
              </button>
            ))}
          </aside>

          {/* Right pane: editor for the selected prompt. */}
          {selected ? (
            <section style={{ flex: 1 }}>
              <p style={{ color: '#57606a', marginTop: 0 }}>{selected.description}</p>

              {placeholders.length > 0 && (
                <div style={{ marginBottom: 8, fontSize: 13 }}>
                  <strong>Available variables:</strong>{' '}
                  {placeholders.map(v => (
                    <code
                      key={v}
                      style={{
                        background: '#f6f8fa',
                        padding: '2px 6px',
                        borderRadius: 3,
                        marginRight: 6,
                      }}
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              )}

              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                spellCheck={false}
                style={{
                  width: '100%',
                  minHeight: 320,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  fontSize: 13,
                  padding: 8,
                  border: '1px solid #d0d7de',
                  borderRadius: 4,
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="btn btn-primary"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleReset}
                  disabled={selected.isDefault || saving}
                  className="btn btn-secondary"
                  title={
                    selected.isDefault
                      ? 'Already at factory default'
                      : 'Restore the factory default body'
                  }
                >
                  Reset to default
                </button>
                <span style={{ fontSize: 12, color: '#57606a' }}>
                  Updated {new Date(selected.updatedAt).toLocaleString()}
                </span>
              </div>

              {statusNote && (
                <div style={{ color: '#1a7f37', fontSize: 13, marginTop: 8 }}>{statusNote}</div>
              )}
              {saveError && (
                <div
                  className="card"
                  style={{
                    marginTop: 8,
                    background: '#fef2f2',
                    borderColor: '#fecaca',
                    color: '#991b1b',
                  }}
                >
                  {saveError}
                </div>
              )}

              {/* Factory default preview — collapsed by default so the editor
                  gets the vertical space. Useful when the user wants to mentally
                  diff their edit against the original. */}
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer' }}>Factory default (read-only)</summary>
                <pre
                  style={{
                    background: '#f6f8fa',
                    padding: 12,
                    borderRadius: 4,
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  {selected.defaultBody}
                </pre>
              </details>
            </section>
          ) : (
            <p>No prompts available.</p>
          )}
        </div>
      )}
    </div>
  );
}
