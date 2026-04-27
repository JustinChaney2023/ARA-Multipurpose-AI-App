/**
 * ImportScreen - the app's entry point.
 *
 * Three ways in after the Phase 1 refactor:
 *   1. Drop / pick a PDF or image file → OCR → summary (primary).
 *   2. Paste or type text → summary (primary).
 *   3. Click "Fill form manually" → opens the structured MCCMC form with empty
 *      fields for users who prefer filling the form in-app.
 *
 * The summary path posts to /summarize or /summarize/file and forwards the
 * response to `onSummarized`. The form path short-circuits with a blank
 * ExtractionResult via `onFormRequested`.
 */

import { type ExtractionResult } from '@ara/shared';
import { useState, useCallback, useEffect, useRef } from 'react';

import { Icon } from '../components/Icon';
import { ProgressBar } from '../components/ProgressBar';

import type { SummaryPayload } from './SummaryScreen';

interface ImportScreenProps {
  /** Called when a summary is produced (text or file path). Routes to SummaryScreen. */
  onSummarized: (payload: SummaryPayload) => void;
  /** Called when the user asks to fill the form manually. Routes to ReviewScreen with a blank form. */
  onFormRequested: (result: ExtractionResult) => void;
  /** Phase 3: if set, the summary-write hook will persist the session under this patient. */
  selectedPatientId?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Operation name used by the backend progress tracker for both /summarize and
// /summarize/file. Must match the string passed to createProgressTracker server-side.
const SUMMARIZE_PROGRESS_KEY = 'SUMMARIZE';

export function ImportScreen({ onSummarized, onFormRequested, selectedPatientId }: ImportScreenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll /health on mount and every 30s so the indicator stays accurate if the
  // user leaves the screen open while Ollama starts/stops.
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Clean up the progress poller on unmount — belt-and-suspenders; each request
  // path also clears its own interval in a finally block.
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

  /**
   * Start polling the service's progress store for a given operation key.
   * Updates `progress` and `statusMessage` until cleared.
   */
  const startProgressPolling = (operationKey: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/progress/${operationKey}`);
        if (response.ok) {
          const data = await response.json();
          // Null means no progress entry yet — ignore until the server writes one.
          if (data) {
            setProgress(data.percent);
            setStatusMessage(data.message);
          }
        }
      } catch {
        // Network blips during polling are harmless; the next tick retries.
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

  /**
   * File path: POST /summarize/file (multipart) → SummaryScreen.
   * Backend handles OCR + summarization together; we just forward the result.
   */
  const processFile = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setStatusMessage('Reading document...');
    startProgressPolling(SUMMARIZE_PROGRESS_KEY);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedPatientId) {
        formData.append('patientId', String(selectedPatientId));
      }

      const response = await fetch(`${API_BASE_URL}/summarize/file`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.error || 'Processing failed');
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

  /**
   * Text path: POST /summarize (JSON) → SummaryScreen.
   */
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.error || 'Processing failed');
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

  /**
   * Form-fill path: skips the AI entirely and hands the user a blank MCCMC form.
   * Mirrors the shape `ExtractionResult` so ReviewScreen can consume it unchanged.
   */
  const openBlankForm = () => {
    onFormRequested({
      form: {
        header: { recipientName: '', date: '', time: '', recipientIdentifier: '', dob: '', location: '' },
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

  return (
    <div className="screen">
      {/* Ollama status indicator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          padding: '0.75rem 1rem',
          background: 'var(--color-surface)',
          borderRadius: '8px',
          border: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontWeight: 500 }}>AI Assistant</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            color: ollamaStatus === 'connected' ? '#16a34a' : '#dc2626',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: ollamaStatus === 'connected' ? '#16a34a' : '#dc2626',
            }}
          />
          {ollamaStatus === 'connected' ? 'Ready' : 'Offline - summary unavailable'}
        </span>
      </div>

      {/* File drop zone */}
      <div
        className={`card file-drop-zone ${isDragging ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const files = e.dataTransfer.files;
          if (files.length > 0) processFile(files[0]);
        }}
        style={{
          padding: '3rem 2rem',
          textAlign: 'center',
          opacity: isProcessing ? 0.5 : 1,
          pointerEvents: isProcessing ? 'none' : 'auto',
        }}
      >
        <input
          type="file"
          id="file-input"
          accept=".pdf,image/*"
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          style={{ display: 'none' }}
          disabled={isProcessing}
        />
        <label htmlFor="file-input" style={{ cursor: 'pointer', display: 'block' }}>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
            <Icon name="document" size={48} color="var(--color-primary)" />
          </div>
          <h3 style={{ marginBottom: '0.5rem' }}>Drop a PDF or image here</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Or click to browse. We&apos;ll OCR and summarize it.
          </p>
        </label>
      </div>

      {/* OR divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          margin: '1.5rem 0',
          color: 'var(--color-text-muted)',
        }}
      >
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span>OR</span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      {/* Text input */}
      <div className="card" style={{ opacity: isProcessing ? 0.5 : 1 }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Type or Paste Notes</h3>
        <TextInputForm onSubmit={processText} disabled={isProcessing} />
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="card" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <ProgressBar title="Processing" percentage={progress} status={statusMessage} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p style={{ color: '#dc2626', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icon name="warning" size={18} color="#dc2626" />
            {error}
          </p>
        </div>
      )}

      {/* Opt-in form-fill path. Separate from the summary flow so users who want
          to fill the structured MCCMC form in-app have a direct entry point. */}
      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <button
          onClick={openBlankForm}
          disabled={isProcessing}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 1.25rem' }}
        >
          Fill form manually →
        </button>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Opens the structured MCCMC form with empty fields.
        </p>
      </div>
    </div>
  );
}

// Text input sub-component. Keeps ImportScreen's top-level JSX readable.
function TextInputForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(text); }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste caregiver notes here..."
        rows={8}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.875rem',
          border: '1.5px solid var(--color-border)',
          borderRadius: '8px',
          fontSize: '0.9rem',
          lineHeight: 1.6,
          resize: 'vertical',
          marginBottom: '0.75rem',
        }}
      />
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={disabled || !text.trim()}
          style={{ flex: 1 }}
        >
          {disabled ? 'Processing...' : 'Summarize with AI'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setText('')}
          disabled={disabled || !text}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
