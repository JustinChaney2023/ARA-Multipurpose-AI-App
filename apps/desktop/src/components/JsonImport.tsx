import type { ExtractionResult } from '@ara/shared';
import { useState, useRef } from 'react';

import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

interface JsonImportProps {
  onImport: (result: ExtractionResult) => void;
}

export function JsonImport({ onImport }: JsonImportProps) {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setError(null);

    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string);

        // Validate structure
        if (!data.form || !data.version) {
          throw new Error('Invalid file format');
        }

        const result: ExtractionResult = {
          form: data.form,
          rawText: data.rawText || '',
          confidence: data.confidence || [],
          extractionMethod: data.extractionMethod || 'manual',
          ollamaAvailable: false,
        };

        onImport(result);
      } catch (err) {
        setError('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Tooltip content="Import previously exported JSON file">
      <div style={{ position: 'relative' }}>
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
        >
          <Icon name="import" size={16} /> Import JSON
        </button>

        {error && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '0.5rem',
              background: '#fef2f2',
              color: '#991b1b',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
              zIndex: 100,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Tooltip>
  );
}
