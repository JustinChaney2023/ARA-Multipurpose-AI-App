import { useState, useEffect, useCallback, useRef } from 'react';

import { listPatients, createPatient, deletePatient, type Patient } from '../api/patients';

import { Icon } from './Icon';

interface PatientSidebarProps {
  selectedPatientId?: number;
  onSelectPatient: (id: number | undefined) => void;
}

export function PatientSidebar({ selectedPatientId, onSelectPatient }: PatientSidebarProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listPatients();
      setPatients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (isCreating && inputRef.current) inputRef.current.focus();
  }, [isCreating]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const patient = await createPatient(name);
      setPatients(prev =>
        [...prev, patient].sort((a, b) => a.displayName.localeCompare(b.displayName))
      );
      setNewName('');
      setIsCreating(false);
      onSelectPatient(patient.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient');
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this patient and all their sessions?')) return;
    try {
      await deletePatient(id);
      setPatients(prev => prev.filter(p => p.id !== id));
      if (selectedPatientId === id) onSelectPatient(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete patient');
    }
  };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        {!collapsed && <h2>Patients</h2>}
        <div style={{ display: 'flex', gap: 4 }}>
          {!collapsed && (
            <button className="btn-icon" onClick={() => setIsCreating(v => !v)} title="New patient">
              <Icon name="plus" size={14} />
            </button>
          )}
          <button
            className="btn-icon"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          </button>
        </div>
      </div>

      {/* New patient form */}
      {!collapsed && isCreating && (
        <div className="sidebar-form">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewName('');
              }
            }}
            placeholder="Patient name"
            maxLength={200}
          />
          <div className="sidebar-form-actions">
            <button className="btn btn-primary" onClick={handleCreate}>
              Save
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setIsCreating(false);
                setNewName('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !collapsed && (
        <div style={{ padding: '6px 10px' }}>
          <span className="status error" style={{ display: 'block', fontSize: 12 }}>
            {error}
          </span>
        </div>
      )}

      {/* List */}
      <div className="sidebar-list">
        {loading && patients.length === 0 ? (
          <div className="sidebar-empty">Loading…</div>
        ) : patients.length === 0 ? (
          <div className="sidebar-empty">No patients yet.{'\n'}Click + to add one.</div>
        ) : (
          patients.map(patient => (
            <button
              key={patient.id}
              className={`sidebar-item${patient.id === selectedPatientId ? ' active' : ''}`}
              onClick={() => onSelectPatient(patient.id)}
              title={patient.displayName}
            >
              {collapsed ? (
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                  {patient.displayName.charAt(0)}
                </span>
              ) : (
                <>
                  <span className="sidebar-item-name">{patient.displayName}</span>
                  <div className="patient-actions">
                    <button onClick={e => handleDelete(patient.id, e)} title="Delete patient">
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </>
              )}
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {!collapsed && !isCreating && selectedPatientId && (
        <div className="sidebar-footer">
          <button
            className="btn btn-secondary"
            onClick={() => onSelectPatient(undefined)}
            style={{ width: '100%', fontSize: 11 }}
          >
            Clear selection
          </button>
        </div>
      )}
    </aside>
  );
}
