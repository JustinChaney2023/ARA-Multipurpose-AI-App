import { useState, useCallback, useEffect, useRef } from 'react';
import { type ExtractionResult } from '@ara/shared';
import { ProgressBar } from '../components/ProgressBar';

interface ImportScreenProps {
  onExtracted: (result: ExtractionResult) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ImportScreen({ onExtracted }: ImportScreenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check Ollama status on mount
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
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

    // Start polling progress - EXTRACT is the operation name used by backend
    const pollProgress = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/progress/EXTRACT`);
        if (response.ok) {
          const data = await response.json();
          setProgress(data.percent);
          setStatusMessage(data.message);
        }
      } catch {
        // Ignore polling errors
      }
    };

    progressIntervalRef.current = setInterval(pollProgress, 500);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/extract/pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing failed');
      }

      const result: ExtractionResult = await response.json();
      onExtracted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsProcessing(false);
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
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

    // Poll for FILL operation progress
    const pollProgress = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/progress/FILL`);
        if (response.ok) {
          const data = await response.json();
          setProgress(data.percent);
          setStatusMessage(data.message);
        }
      } catch {}
    };

    progressIntervalRef.current = setInterval(pollProgress, 500);

    try {
      const response = await fetch(`${API_BASE_URL}/extract/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text, ocrConfidence: 100 }),
      });

      if (!response.ok) {
        throw new Error('Processing failed');
      }

      const result: ExtractionResult = await response.json();
      onExtracted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setIsProcessing(false);
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
  };

  const startBlank = () => {
    onExtracted({
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
      {/* Status Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        padding: '0.75rem 1rem',
        background: 'var(--color-surface)',
        borderRadius: '8px',
        border: '1px solid var(--color-border)',
      }}>
        <span style={{ fontWeight: 500 }}>AI Assistant</span>
        <span style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          fontSize: '0.875rem',
          color: ollamaStatus === 'connected' ? '#16a34a' : '#dc2626',
        }}>
          <span style={{ 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            background: ollamaStatus === 'connected' ? '#16a34a' : '#dc2626',
          }} />
          {ollamaStatus === 'connected' ? 'Ready' : 'Offline - Using basic extraction'}
        </span>
      </div>

      {/* Upload Area */}
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
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
          <h3 style={{ marginBottom: '0.5rem' }}>Drop a PDF or image here</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Or click to browse • PDF, PNG, JPG supported
          </p>
        </label>
      </div>

      {/* OR Divider */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem',
        margin: '1.5rem 0',
        color: 'var(--color-text-muted)',
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span>OR</span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      {/* Text Input */}
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
          <p style={{ color: '#dc2626', margin: 0 }}>⚠️ {error}</p>
        </div>
      )}

      {/* Start Blank */}
      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <button 
          onClick={startBlank}
          disabled={isProcessing}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Start with a blank form →
        </button>
      </div>
    </div>
  );
}

// Sub-component for text input
function TextInputForm({ onSubmit, disabled }: { onSubmit: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState('');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(text); }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste caregiver notes here..."
        rows={6}
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
          {disabled ? 'Processing...' : '🤖 Analyze with AI'}
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
