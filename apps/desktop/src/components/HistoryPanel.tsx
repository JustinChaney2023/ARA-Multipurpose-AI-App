import { useState, useEffect } from 'react';

import { getHistory, deleteHistoryItem, clearHistory, type HistoryItem, findSimilarText } from '../utils/history';

import { Icon } from './Icon';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
  currentText?: string;
}

export function HistoryPanel({ isOpen, onClose, onSelect, currentText }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [similarWarning, setSimilarWarning] = useState<HistoryItem | null>(null);

  useEffect(() => {
    if (isOpen) {
      setHistory(getHistory());
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentText) {
      const similar = findSimilarText(currentText, 0.75);
      setSimilarWarning(similar);
    } else {
      setSimilarWarning(null);
    }
  }, [currentText]);

  if (!isOpen && !similarWarning) return null;

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteHistoryItem(id);
    setHistory(getHistory());
  };

  const handleClearAll = () => {
    if (confirm('Clear all history? This cannot be undone.')) {
      clearHistory();
      setHistory([]);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Similar Content Warning */}
      {similarWarning && !isOpen && (
        <div
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '1rem',
            maxWidth: '350px',
            zIndex: 100,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}><Icon name="warning" size={18} color="#f59e0b" /></span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 500, color: '#92400e' }}>
                Similar notes detected
              </p>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: '#a16207' }}>
                You processed similar notes for <strong>{similarWarning.recipientName}</strong> on {formatDate(similarWarning.timestamp)}.
              </p>
              <button
                onClick={() => onSelect(similarWarning)}
                style={{
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Load Previous
              </button>
            </div>
            <button
              onClick={() => setSimilarWarning(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#92400e',
                cursor: 'pointer',
                fontSize: '1.25rem',
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* History Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={onClose}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideUp 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Recent Extractions</h2>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '0.25rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                
                <p>No recent extractions</p>
              </div>
            ) : (
              <>
                <div style={{ overflow: 'auto', flex: 1, marginBottom: '1rem' }}>
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        onSelect(item);
                        onClose();
                      }}
                      style={{
                        padding: '1rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        marginBottom: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <strong style={{ color: '#1e293b' }}>{item.recipientName || 'Unknown'}</strong>
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>•</span>
                            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>{item.date}</span>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '4px',
                                background: item.extractionMethod.includes('llm') ? '#dbeafe' : '#f1f5f9',
                                color: item.extractionMethod.includes('llm') ? '#1e40af' : '#64748b',
                              }}
                            >
                              {item.extractionMethod}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: 1.4 }}>
                            {item.preview}
                          </p>
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {formatDate(item.timestamp)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(item.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '0.25rem',
                            fontSize: '1rem',
                            opacity: 0.6,
                          }}
                          title="Delete"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleClearAll}
                  style={{
                    background: 'none',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    alignSelf: 'flex-end',
                  }}
                >
                  Clear All History
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
