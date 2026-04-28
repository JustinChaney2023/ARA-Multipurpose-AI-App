import { type ExtractionResult } from '@ara/shared';
import { useState, useCallback, useEffect, useRef } from 'react';

import { Icon } from '../components/Icon';
import { ProgressBar } from '../components/ProgressBar';
import { Btn, Card, StatusDot, Spinner, Divider } from '../components/ui';

import type { SummaryPayload } from './SummaryScreen';

interface ImportScreenProps {
  onSummarized: (payload: SummaryPayload) => void;
  onFormRequested: (result: ExtractionResult) => void;
  selectedPatientId?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const SUMMARIZE_PROGRESS_KEY = 'SUMMARIZE';

export function ImportScreen({
  onSummarized,
  onFormRequested,
  selectedPatientId,
}: ImportScreenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>(
    'checking'
  );
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      const data = await response.json();
      setOllamaStatus(data.ollama === 'connected' ? 'connected' : 'disconnected');
    } catch {
      setOllamaStatus('disconnected');
    }
  };

  const startProgressPolling = (operationKey: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/progress/${operationKey}`);
        if (response.ok) {
          const data = await response.json();
          if (data) {
            setProgress(data.percent);
            setStatusMessage(data.message);
          }
        }
      } catch {
        // network blips during polling are harmless; next tick retries
      }
    };
    progressIntervalRef.current = setInterval(poll, 500);
  };

  const stopProgressPolling = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setStatusMessage('Reading document...');
    startProgressPolling(SUMMARIZE_PROGRESS_KEY);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedPatientId) formData.append('patientId', String(selectedPatientId));
      const response = await fetch(`${API_BASE_URL}/summarize/file`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error?.message || d.error || 'Processing failed');
      }
      const payload: SummaryPayload = await response.json();
      onSummarized(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsProcessing(false);
    } finally {
      stopProgressPolling();
    }
  };

  const processText = async (text: string) => {
    if (!text.trim()) {
      setError('Please enter some text');
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setStatusMessage('Analyzing notes...');
    startProgressPolling(SUMMARIZE_PROGRESS_KEY);
    try {
      const response = await fetch(`${API_BASE_URL}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, patientId: selectedPatientId }),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error?.message || d.error || 'Processing failed');
      }
      const payload: SummaryPayload = await response.json();
      onSummarized(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setIsProcessing(false);
    } finally {
      stopProgressPolling();
    }
  };

  const openBlankForm = () => {
    onFormRequested({
      form: {
        header: {
          recipientName: '',
          date: '',
          time: '',
          recipientIdentifier: '',
          dob: '',
          location: '',
        },
        careCoordinationType: { sih: false, hcbw: false },
        narrative: {
          recipientAndVisitObservations: '',
          healthEmotionalStatus: '',
          reviewOfServices: '',
          progressTowardGoals: '',
          additionalNotes: '',
          followUpTasks: '',
        },
        signature: { careCoordinatorName: '', signature: '', dateSigned: '' },
      },
      confidence: [],
      rawText: '',
      extractionMethod: 'manual',
      ollamaAvailable: false,
    });
  };

  const aiOnline = ollamaStatus === 'connected';

  return (
    <div className="screen" style={{ maxWidth: 620, margin: '0 auto', padding: '2rem 0' }}>
      {/* AI status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          marginBottom: '1.25rem',
        }}
      >
        <span style={{ fontWeight: 500, fontSize: 13 }}>AI Assistant</span>
        <StatusDot online={aiOnline} />
      </div>

      {/* Tab switcher */}
      <div className="input-tabs">
        {(['file', 'text'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`input-tab${activeTab === tab ? ' active' : ''}`}
          >
            <Icon name={tab === 'file' ? 'document' : 'template'} size={13} />
            {tab === 'file' ? 'Upload file' : 'Paste notes'}
          </button>
        ))}
      </div>

      {/* File drop zone */}
      {activeTab === 'file' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className={`file-drop-zone${isDragging ? ' drag-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files;
              if (f.length > 0) processFile(f[0]);
            }}
            style={{
              opacity: isProcessing ? 0.5 : 1,
              pointerEvents: isProcessing ? 'none' : 'auto',
            }}
          >
            <input
              type="file"
              id="file-input"
              accept=".pdf,image/*"
              style={{ display: 'none' }}
              onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
              disabled={isProcessing}
            />
            <label htmlFor="file-input" style={{ cursor: 'pointer', display: 'block' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'var(--accent-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  color: 'var(--accent)',
                }}
              >
                <Icon name="document" size={24} color="var(--accent)" />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>
                Drop a PDF or image here
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                or <span style={{ color: 'var(--accent)' }}>browse files</span> — we&apos;ll OCR and
                summarize it
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                {['PDF', 'PNG', 'JPG', 'TIFF'].map(f => (
                  <span
                    key={f}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border2)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </label>
          </div>
        </Card>
      )}

      {/* Text paste */}
      {activeTab === 'text' && (
        <Card>
          <TextInputForm onSubmit={processText} disabled={isProcessing} />
        </Card>
      )}

      {/* Progress */}
      {isProcessing && (
        <Card style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Spinner />
            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
              {statusMessage}
            </span>
          </div>
          <ProgressBar percentage={progress} status="" title="" />
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card style={{ background: 'var(--red-dim)', border: '1px solid var(--red)' }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              color: 'var(--red)',
              fontSize: 13,
            }}
          >
            <Icon name="warning" size={15} color="var(--red)" />
            {error}
          </div>
        </Card>
      )}

      {/* Manual form path */}
      <Divider label="or" />
      <div style={{ textAlign: 'center' }}>
        <Btn variant="secondary" onClick={openBlankForm} disabled={isProcessing}>
          Fill MCCMC form manually →
        </Btn>
        <div style={{ fontSize: 11, color: 'var(--text-sub)', marginTop: 6 }}>
          Opens the structured form with empty fields
        </div>
      </div>
    </div>
  );
}

function TextInputForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSubmit(text);
      }}
    >
      <div className="text-input-hint">Paste or type caregiver notes below</div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Patient was visited on… vitals checked… medications administered…"
        rows={9}
        disabled={disabled}
        className="text-input-area"
      />
      <div className="text-input-actions">
        <Btn type="submit" disabled={disabled || !text.trim()} style={{ flex: 1 }}>
          {disabled ? 'Processing…' : 'Summarize with AI'}
        </Btn>
        <Btn
          variant="secondary"
          type="button"
          onClick={() => setText('')}
          disabled={disabled || !text}
        >
          Clear
        </Btn>
      </div>
    </form>
  );
}
