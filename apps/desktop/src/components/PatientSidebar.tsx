/**
 * PatientSidebar - Phase 3 persistent sidebar for patient selection & management.
 *
 * Shows a scrollable list of patients. Clicking a patient selects them;
 * the parent (App.tsx) receives the selection so it can be passed to
 * ImportScreen for the summary-write hook.
 *
 * Patients can be created inline and deleted with a hover action.
 * Folders exist in the backend but the UI keeps a flat list for now
 * (folder grouping can be added later without changing the API).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import {
  listPatients,
  createPatient,
  deletePatient,
  type Patient,
} from '../api/patients';

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
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const patient = await createPatient(name);
      setPatients(prev => [...prev, patient].sort((a, b) => a.displayName.localeCompare(b.displayName)));
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
      if (selectedPatientId === id) {
        onSelectPatient(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete patient');
    }
  };

  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <div className="sidebar-header">
          <button
            className="btn-icon"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        <div className="sidebar-list">
          {patients.map(p => (
            <button
              key={p.id}
              className={`sidebar-item ${p.id === selectedPatientId ? 'active' : ''}`}
              onClick={() => onSelectPatient(p.id)}
              title={p.displayName}
            >
              <Icon name="user" size={16} />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Patients</h2>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            className="btn-icon"
            onClick={() => setIsCreating(v => !v)}
            title="New patient"
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            className="btn-icon"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
          >
            <Icon name="chevron-left" size={16} />
          </button>
        </div>
      </div>

      {isCreating && (
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

      {error && (
        <div style={{ padding: '0.5rem 1rem' }}>
          <span className="status error" style={{ display: 'block', fontSize: '0.75rem' }}>
            {error}
          </span>
        </div>
      )}

      <div className="sidebar-list">
        {loading && patients.length === 0 ? (
          <div className="sidebar-empty">Loading…</div>
        ) : patients.length === 0 ? (
          <div className="sidebar-empty">
            No patients yet.
            <br />
            Click + to create one.
          </div>
        ) : (
          patients.map(patient => (
            <button
              key={patient.id}
              className={`sidebar-item ${patient.id === selectedPatientId ? 'active' : ''}`}
              onClick={() => onSelectPatient(patient.id)}
            >
              <span className="sidebar-item-name">{patient.displayName}</span>
              <div className="patient-actions">
                <button
                  onClick={e => handleDelete(patient.id, e)}
                  title="Delete patient"
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </button>
          ))
        )}
      </div>

      {!isCreating && (
        <div className="sidebar-footer">
          <button
            className="btn btn-secondary"
            onClick={() => onSelectPatient(undefined)}
            style={{ fontSize: '0.75rem' }}
          >
            Clear selection
          </button>
        </div>
      )}
    </aside>
  );
}
