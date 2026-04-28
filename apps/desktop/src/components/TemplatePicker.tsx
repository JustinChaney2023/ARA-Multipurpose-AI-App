import { type CSSProperties, useState } from 'react';

import { getTemplatesByCategory, type Template, saveCustomTemplate } from '../utils/templates';

import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

interface TemplatePickerProps {
  onSelect: (text: string) => void;
}

export function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ category: '', label: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const templatesByCategory = getTemplatesByCategory();

  const filteredCategories: Record<string, Template[]> = {};
  for (const [category, templates] of Object.entries(templatesByCategory)) {
    const filtered = templates.filter(
      t =>
        t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      filteredCategories[category] = filtered;
    }
  }

  const handleSelect = (template: Template) => {
    onSelect(template.text);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleAddCustom = () => {
    if (newTemplate.label && newTemplate.text) {
      saveCustomTemplate({
        category: newTemplate.category || 'Custom',
        label: newTemplate.label,
        text: newTemplate.text,
      });
      setNewTemplate({ category: '', label: '', text: '' });
      setShowAddCustom(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    background: 'var(--bg)',
    border: '1px solid var(--border2)',
    borderRadius: 'var(--radius)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'var(--font)',
    outline: 'none',
    marginBottom: '0.5rem',
  };

  return (
    <>
      <Tooltip content="Insert template text">
        <button
          className="btn btn-secondary"
          onClick={() => setIsOpen(true)}
          style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
        >
          <Icon name="template" size={16} /> Templates
        </button>
      </Tooltip>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Text Templates
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                ×
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, marginBottom: '0.75rem' }}
            />

            {/* Add Custom Toggle */}
            <button
              onClick={() => setShowAddCustom(!showAddCustom)}
              style={{
                background: 'transparent',
                border: '1px dashed var(--border2)',
                padding: '0.5rem',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
                marginBottom: '0.75rem',
                fontFamily: 'var(--font)',
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              {showAddCustom ? 'Cancel' : '+ Add Custom Template'}
            </button>

            {/* Add Custom Form */}
            {showAddCustom && (
              <div
                style={{
                  background: 'var(--surface2)',
                  padding: '1rem',
                  borderRadius: 'var(--radius)',
                  marginBottom: '0.75rem',
                  border: '1px solid var(--border)',
                }}
              >
                <input
                  type="text"
                  placeholder="Category (e.g., Custom)"
                  value={newTemplate.category}
                  onChange={e => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Label (e.g., My Template)"
                  value={newTemplate.label}
                  onChange={e => setNewTemplate({ ...newTemplate, label: e.target.value })}
                  style={inputStyle}
                />
                <textarea
                  placeholder="Template text..."
                  value={newTemplate.text}
                  onChange={e => setNewTemplate({ ...newTemplate, text: e.target.value })}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
                <button
                  onClick={handleAddCustom}
                  disabled={!newTemplate.label || !newTemplate.text}
                  className="btn btn-primary"
                  style={{ fontSize: '0.875rem' }}
                >
                  Save Template
                </button>
              </div>
            )}

            {/* Templates List */}
            <div style={{ overflow: 'auto', flex: 1 }}>
              {Object.entries(filteredCategories).length === 0 ? (
                <p
                  style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}
                >
                  No templates found
                </p>
              ) : (
                Object.entries(filteredCategories).map(([category, templates]) => (
                  <div key={category} style={{ marginBottom: '1rem' }}>
                    <h3
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: 'var(--text-sub)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        margin: '0 0 0.5rem',
                      }}
                    >
                      {category}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      {templates.map(template => (
                        <button
                          key={template.id}
                          onClick={() => handleSelect(template)}
                          style={{
                            textAlign: 'left',
                            padding: '0.625rem 0.75rem',
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            color: 'var(--text)',
                            fontFamily: 'var(--font)',
                            transition: 'border-color 0.15s, background 0.15s',
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor =
                              'var(--accent)';
                            (e.currentTarget as HTMLButtonElement).style.background =
                              'var(--accent-dim)';
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.borderColor =
                              'var(--border)';
                            (e.currentTarget as HTMLButtonElement).style.background =
                              'var(--surface2)';
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: '0.2rem' }}>
                            {template.label}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {template.text}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
