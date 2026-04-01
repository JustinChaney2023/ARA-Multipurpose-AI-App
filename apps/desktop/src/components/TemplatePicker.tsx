import { useState } from 'react';
import { getTemplatesByCategory, type Template, saveCustomTemplate } from '../utils/templates';
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
  
  // Filter templates by search
  const filteredCategories: Record<string, Template[]> = {};
  for (const [category, templates] of Object.entries(templatesByCategory)) {
    const filtered = templates.filter(t => 
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

  return (
    <>
      <Tooltip content="Insert template text">
        <button
          className="btn btn-secondary"
          onClick={() => setIsOpen(true)}
          style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}
        >
          📝 Templates
        </button>
      </Tooltip>

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
          onClick={() => setIsOpen(false)}
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
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Text Templates</h2>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#64748b',
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
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.875rem',
              }}
            />

            {/* Add Custom Button */}
            <button
              onClick={() => setShowAddCustom(!showAddCustom)}
              style={{
                background: 'none',
                border: '1px dashed #cbd5e1',
                padding: '0.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#64748b',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}
            >
              {showAddCustom ? 'Cancel' : '+ Add Custom Template'}
            </button>

            {/* Add Custom Form */}
            {showAddCustom && (
              <div style={{ 
                background: '#f8fafc', 
                padding: '1rem', 
                borderRadius: '8px', 
                marginBottom: '1rem',
                border: '1px solid #e2e8f0',
              }}>
                <input
                  type="text"
                  placeholder="Category (e.g., Custom)"
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                />
                <input
                  type="text"
                  placeholder="Label (e.g., My Template)"
                  value={newTemplate.label}
                  onChange={(e) => setNewTemplate({ ...newTemplate, label: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                />
                <textarea
                  placeholder="Template text..."
                  value={newTemplate.text}
                  onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
                <button
                  onClick={handleAddCustom}
                  disabled={!newTemplate.label || !newTemplate.text}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    opacity: (!newTemplate.label || !newTemplate.text) ? 0.5 : 1,
                  }}
                >
                  Save Template
                </button>
              </div>
            )}

            {/* Templates List */}
            <div style={{ overflow: 'auto', flex: 1 }}>
              {Object.entries(filteredCategories).length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                  No templates found
                </p>
              ) : (
                Object.entries(filteredCategories).map(([category, templates]) => (
                  <div key={category} style={{ marginBottom: '1rem' }}>
                    <h3 style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      color: '#64748b', 
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      margin: '0 0 0.5rem',
                    }}>
                      {category}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {templates.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleSelect(template)}
                          style={{
                            textAlign: 'left',
                            padding: '0.75rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                          }}
                        >
                          <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>{template.label}</div>
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
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
