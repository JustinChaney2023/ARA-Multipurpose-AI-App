import { useState, useEffect } from 'react';
import { getQuickHistory, formatRelativeTime, type HistoryItem } from '../utils/quickHistory';

interface QuickHistoryProps {
  onSelect: (item: HistoryItem) => void;
}

export function QuickHistory({ onSelect }: QuickHistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setHistory(getQuickHistory());
  }, []);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="card" style={{ background: '#f8fafc' }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
          Recent Forms ({history.length})
        </h3>
        <span style={{ 
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>
          ▼
        </span>
      </div>
      
      {isExpanded && (
        <div style={{ marginTop: '0.75rem' }}>
          {history.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{item.recipientName}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {item.date}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
