import { useState } from 'react';
import type { ExtractionResult } from '@ara/shared';

interface PDFPreviewProps {
  form: ExtractionResult['form'];
  isOpen: boolean;
  onClose: () => void;
}

export function PDFPreview({ form, isOpen, onClose }: PDFPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePreview = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/export/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form }),
      });
      
      if (!response.ok) throw new Error('Preview generation failed');
      
      const data = await response.json();
      const blob = new Blob([Buffer.from(data.preview, 'base64')], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      setError('Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          padding: '1rem 1.5rem', 
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0 }}>PDF Preview</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
            }}
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
          {!previewUrl && !loading && !error && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
                Generate a preview to see how your form will look
              </p>
              <button className="btn btn-primary" onClick={generatePreview}>
                Generate Preview
              </button>
            </div>
          )}
          
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 1rem' }} />
              <p>Generating preview...</p>
            </div>
          )}
          
          {error && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#dc2626' }}>
              <p>{error}</p>
              <button className="btn btn-secondary" onClick={generatePreview} style={{ marginTop: '1rem' }}>
                Try Again
              </button>
            </div>
          )}
          
          {previewUrl && (
            <iframe
              src={previewUrl}
              style={{ 
                width: '100%', 
                height: '600px', 
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              title="PDF Preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}
