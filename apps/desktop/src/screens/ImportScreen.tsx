import { useState, useCallback } from 'react';
import { createEmptyForm, type ExtractionResult } from '@ara/shared';
import { ProgressBar } from '../components/ProgressBar';

interface ImportScreenProps {
  onExtracted: (result: ExtractionResult) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface SummaryResult {
  summary: string;
  keyPoints: string[];
  concerns: string[];
  actions: string[];
}

type ProcessingStage = 'idle' | 'uploading' | 'ocr' | 'analyzing' | 'filling';

export function ImportScreen({ onExtracted }: ImportScreenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Processing state
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Results
  const [ocrResult, setOcrResult] = useState<{ text: string; confidence: number; method: string } | null>(null);
  const [summary, setSummary] = useState<SummaryResult | null>(null);

  // Helper to animate progress gradually
  const animateProgress = async (targetProgress: number, duration: number = 800) => {
    const startProgress = progress;
    const startTime = Date.now();
    
    return new Promise<void>((resolve) => {
      const update = () => {
        const elapsed = Date.now() - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - rawProgress, 3);
        const current = startProgress + (targetProgress - startProgress) * eased;
        
        setProgress(current);
        
        if (rawProgress < 1) {
          requestAnimationFrame(update);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(update);
    });
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
    setStage('uploading');
    setProgress(0);
    setError(null);
    setOcrResult(null);
    setSummary(null);

    try {
      // Stage 1: Upload (animate to 15%)
      await animateProgress(15, 400);
      setStatusMessage(`Uploading ${file.name}`);
      
      const formData = new FormData();
      formData.append('file', file);

      // Stage 2: OCR Processing (animate to 70% during processing)
      setStage('ocr');
      setStatusMessage('Extracting text from document');
      
      // Start progress animation toward 70%
      const progressPromise = animateProgress(70, 3000);

      const extractResponse = await fetch(`${API_BASE_URL}/extract/pdf`, {
        method: 'POST',
        body: formData,
      });

      await progressPromise;

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        throw new Error(errorData.error || 'Extraction failed');
      }

      // Stage 3: Processing result (animate to 100%)
      setStatusMessage('Processing extracted text');
      await animateProgress(100, 500);

      const result: ExtractionResult = await extractResponse.json();
      
      // Show OCR preview to user
      setOcrResult({
        text: result.rawText,
        confidence: result.confidence[0]?.ocrConfidence || 0,
        method: result.extractionMethod
      });
      
      // Store the result for later
      (window as unknown as { lastExtractionResult: ExtractionResult }).lastExtractionResult = result;
      
      // Small delay for visual completion
      await new Promise(r => setTimeout(r, 300));
      setStage('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStage('idle');
    }
  };

  const generateSummary = async () => {
    if (!ocrResult) return;
    
    setStage('analyzing');
    setProgress(0);
    setStatusMessage('Initializing analysis');
    
    try {
      // Animate to 40% during request
      await animateProgress(40, 1000);
      setStatusMessage('Analyzing caregiver notes');
      
      const response = await fetch(`${API_BASE_URL}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrResult.text }),
      });

      if (!response.ok) {
        throw new Error('Summary generation failed');
      }

      // Animate to 80%
      await animateProgress(80, 800);
      setStatusMessage('Generating summary report');

      const summaryData: SummaryResult = await response.json();
      setSummary(summaryData);
      
      // Complete
      await animateProgress(100, 500);
      setStatusMessage('Analysis complete');
      
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      setError('Failed to generate summary: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setStage('idle');
    }
  };

  const handleAutoFill = async () => {
    const storedResult = (window as unknown as { lastExtractionResult: ExtractionResult }).lastExtractionResult;
    if (!storedResult) return;
    
    setStage('filling');
    setProgress(0);
    setStatusMessage('Preparing data');
    
    try {
      // Animate through stages
      await animateProgress(25, 600);
      setStatusMessage('Sending to AI for processing');
      
      const response = await fetch(`${API_BASE_URL}/extract/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rawText: storedResult.rawText,
          ocrConfidence: storedResult.confidence[0]?.ocrConfidence || 50
        }),
      });

      await animateProgress(60, 1500);
      setStatusMessage('Processing AI response');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `Form filling failed: ${response.status}`);
      }

      const fillResult: ExtractionResult = await response.json();
      
      await animateProgress(85, 600);
      setStatusMessage('Validating extracted fields');
      
      // Check if form was actually filled
      const filledFields = Object.values(fillResult.form.header).filter(v => v).length +
                         Object.values(fillResult.form.narrative).filter(v => v).length;
      
      if (filledFields === 0) {
        setError('AI returned empty form. Please try manual fill or check Ollama status.');
        setStage('idle');
        return;
      }
      
      await animateProgress(100, 400);
      setStatusMessage('Form filled successfully');
      
      await new Promise(r => setTimeout(r, 400));
      onExtracted(fillResult);
    } catch (err) {
      setError('Failed to fill form: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setStage('idle');
    }
  };

  const handleManualFill = () => {
    const result = (window as unknown as { lastExtractionResult: ExtractionResult }).lastExtractionResult;
    if (result) {
      onExtracted({
        ...result,
        form: createEmptyForm(),
        extractionMethod: 'manual'
      });
    }
  };

  const handleStartBlank = () => {
    const emptyResult: ExtractionResult = {
      form: createEmptyForm(),
      confidence: [],
      rawText: '',
      extractionMethod: 'manual',
      ollamaAvailable: false,
    };
    onExtracted(emptyResult);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        processFile(file);
      } else {
        setError('Please upload a PDF or image file');
      }
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, []);

  const formatSummary = (s: SummaryResult) => {
    return (
      <div style={{ fontSize: '0.875rem', lineHeight: '1.7' }}>
        <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px' }}>
          <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', color: 'var(--color-text-muted)' }}>Visit Summary</h4>
          <p style={{ color: 'var(--color-text)', margin: 0, whiteSpace: 'pre-wrap' }}>{s.summary}</p>
        </div>
        
        {s.keyPoints.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', color: 'var(--color-text-muted)' }}>Key Points</h4>
            <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {s.keyPoints.map((point, i) => (
                <li key={i} style={{ marginBottom: '0.375rem' }}>{point}</li>
              ))}
            </ul>
          </div>
        )}
        
        {s.concerns.length > 0 && (
          <div style={{ marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '6px' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', color: '#dc2626' }}>Concerns</h4>
            <ul style={{ paddingLeft: '1.25rem', margin: 0, color: '#991b1b' }}>
              {s.concerns.map((concern, i) => (
                <li key={i} style={{ marginBottom: '0.375rem' }}>{concern}</li>
              ))}
            </ul>
          </div>
        )}
        
        {s.actions.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.025em', color: 'var(--color-text-muted)' }}>Follow-Up Actions</h4>
            <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {s.actions.map((action, i) => (
                <li key={i} style={{ marginBottom: '0.375rem' }}>{action}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const isProcessing = stage !== 'idle';

  // Progress steps for different stages
  const getProgressSteps = () => {
    if (stage === 'ocr') {
      return [
        { id: 'upload', label: 'Upload', status: 'complete' as const },
        { id: 'ocr', label: 'OCR', status: progress < 75 ? 'active' as const : 'complete' as const },
        { id: 'process', label: 'Process', status: progress >= 75 ? 'active' as const : 'pending' as const },
      ];
    }
    if (stage === 'analyzing') {
      return [
        { id: 'analyze', label: 'Analyze', status: 'active' as const },
        { id: 'report', label: 'Report', status: progress >= 80 ? 'active' as const : 'pending' as const },
      ];
    }
    if (stage === 'filling') {
      return [
        { id: 'send', label: 'Send', status: 'complete' as const },
        { id: 'extract', label: 'Extract', status: progress >= 40 ? 'active' as const : 'pending' as const },
        { id: 'validate', label: 'Validate', status: progress >= 90 ? 'active' as const : 'pending' as const },
      ];
    }
    return [];
  };

  const getStageTitle = () => {
    switch (stage) {
      case 'uploading': return 'Uploading File';
      case 'ocr': return 'Extracting Text';
      case 'analyzing': return 'Analyzing Notes';
      case 'filling': return 'Filling Form';
      default: return '';
    }
  };

  return (
    <div className="screen">
      {!ocrResult ? (
        <>
          <div className="card">
            <h2 className="card-title">Import Caregiver Notes</h2>
            
            <div
              className={`file-drop-zone ${isDragging ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="file-input"
                accept=".pdf,image/*"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
              <label htmlFor="file-input" style={{ cursor: 'pointer', display: 'block' }}>
                <div style={{ 
                  border: '2px dashed var(--color-border)', 
                  borderRadius: '12px', 
                  padding: '2rem',
                  background: isDragging ? '#f0f9ff' : 'transparent',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isDragging ? 'scale(1.02)' : 'scale(1)'
                }}>
                  <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                    Drop PDF or image here, or click to browse
                  </p>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    Supports: PDF, PNG, JPG, JPEG
                  </p>
                </div>
              </label>
            </div>

            {isProcessing && (
              <div className="processing-card" style={{ marginTop: '1.5rem', padding: '1.25rem', borderRadius: '8px' }}>
                <div className="processing-header">
                  <span className="spinner" />
                  <span className="processing-title">{getStageTitle()}</span>
                </div>
                <ProgressBar
                  title=""
                  percentage={progress}
                  status={statusMessage}
                  steps={getProgressSteps()}
                />
              </div>
            )}

            {error && (
              <div className="status error" style={{ marginTop: '1rem', animation: 'shake 0.5s ease-in-out' }}>
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>

          <div className="card" style={{ background: '#f8fafc' }}>
            <h2 className="card-title">Start Fresh</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Create a new blank form without importing existing notes.
            </p>
            <button className="btn btn-secondary" onClick={handleStartBlank}>
              Start with Blank Form
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Success Banner */}
          <div className="card" style={{ 
            background: '#f0fdf4', 
            borderLeft: '4px solid #22c55e',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            animation: 'slideInRight 0.5s ease-out'
          }}>
            <div style={{ 
              width: '44px', 
              height: '44px', 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
            }}>
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>Document Processed</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                OCR Confidence: {ocrResult.confidence.toFixed(0)}% | Method: {ocrResult.method}
              </p>
            </div>
          </div>

          {/* AI Summary Section */}
          {!summary && !isProcessing && (
            <div className="card" style={{ 
              background: '#eff6ff', 
              textAlign: 'center',
              animation: 'fadeInUp 0.4s ease-out'
            }}>
              <h2 className="card-title">AI Summary</h2>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Let AI analyze the notes and create a summary before filling the form.
              </p>
              <button className="btn btn-primary" onClick={generateSummary}>
                Generate AI Summary
              </button>
            </div>
          )}

          {isProcessing && stage === 'analyzing' && (
            <div className="card" style={{ background: '#eff6ff' }}>
              <ProgressBar
                title="Analyzing Notes"
                percentage={progress}
                status={statusMessage}
                steps={getProgressSteps()}
              />
            </div>
          )}

          {summary && (
            <div className="card" style={{ 
              background: '#f8fafc',
              animation: 'fadeInUp 0.5s ease-out'
            }}>
              <h2 className="card-title">AI Summary</h2>
              {formatSummary(summary)}
            </div>
          )}

          {/* Raw OCR Preview */}
          <div className="card">
            <h2 className="card-title">Extracted Text Preview</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              This is the raw text extracted from your document. Review it before proceeding.
            </p>
            <div 
              style={{ 
                background: '#f8fafc', 
                padding: '1rem', 
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
                maxHeight: '300px',
                overflow: 'auto',
                border: '1px solid var(--color-border)'
              }}
            >
              {ocrResult.text || '(No text extracted)'}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="card" style={{ 
            background: '#f0f9ff',
            animation: 'fadeInUp 0.4s ease-out 0.1s backwards'
          }}>
            <h2 className="card-title">Next Step: Fill Out Form</h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Choose how to populate the form fields:
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleAutoFill}
                disabled={isProcessing}
                style={{ flex: 1, minWidth: '200px' }}
              >
                <strong>Auto-Fill with AI</strong>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'normal', marginTop: '0.25rem', opacity: 0.9 }}>
                  Let AI analyze and fill the form automatically
                </span>
              </button>
              
              <button 
                className="btn btn-secondary" 
                onClick={handleManualFill}
                disabled={isProcessing}
                style={{ flex: 1, minWidth: '200px' }}
              >
                <strong>Manual Fill</strong>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'normal', marginTop: '0.25rem', opacity: 0.9 }}>
                  Start with empty form and fill yourself
                </span>
              </button>
            </div>
          </div>

          {isProcessing && stage === 'filling' && (
            <div className="card" style={{ background: '#fefce8' }}>
              <ProgressBar
                title="Filling Form with AI"
                percentage={progress}
                status={statusMessage}
                steps={getProgressSteps()}
              />
            </div>
          )}

          {error && (
            <div className="status error" style={{ animation: 'shake 0.5s ease-in-out' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setOcrResult(null);
                setSummary(null);
                setError(null);
              }}
              style={{ background: 'transparent' }}
            >
              &lt;- Upload Different File
            </button>
          </div>
        </>
      )}

      <div className="card" style={{ 
        background: '#f8fafc', 
        marginTop: '2rem',
        animation: 'fadeIn 0.6s ease-out 0.3s backwards'
      }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          HIPAA-Compliant Processing
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          All processing happens locally on your device. OCR and AI processing use local models only. 
          No data leaves your computer.
        </p>
      </div>
    </div>
  );
}
