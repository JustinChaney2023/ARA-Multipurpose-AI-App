/**
 * Patient / Folder / Session API client
 *
 * Thin wrapper around fetch for the Phase 3 CRUD endpoints.
 * All functions throw on non-2xx responses so callers can handle errors
 * via try/catch or .catch().
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Types (mirroring backend shapes)
// ---------------------------------------------------------------------------

export interface Patient {
  id: number;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  folderIds: number[];
}

export interface Folder {
  id: number;
  name: string;
  createdAt: string;
  patientCount: number;
}

export interface Session {
  id: number;
  patientId: number;
  source: string;
  rawText: string;
  createdAt: string;
}

export interface Summary {
  id: number;
  sessionId: number;
  body: string;
  promptName: string;
  model: string;
  createdAt: string;
}

export interface SessionWithSummaries extends Session {
  summaries: Summary[];
}

export interface PatientWithSessions extends Patient {
  sessions: SessionWithSummaries[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export async function listPatients(): Promise<Patient[]> {
  const data = await fetchJson<{ patients: Patient[] }>(`${API_BASE_URL}/patients`);
  return data.patients;
}

export async function createPatient(displayName: string): Promise<Patient> {
  return fetchJson<Patient>(`${API_BASE_URL}/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
}

export async function updatePatient(id: number, displayName: string): Promise<Patient> {
  return fetchJson<Patient>(`${API_BASE_URL}/patients/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
}

export async function deletePatient(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/patients/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
}

export async function getPatientWithSessions(id: number): Promise<PatientWithSessions> {
  return fetchJson<PatientWithSessions>(`${API_BASE_URL}/patients/${id}`);
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function listFolders(): Promise<Folder[]> {
  const data = await fetchJson<{ folders: Folder[] }>(`${API_BASE_URL}/folders`);
  return data.folders;
}

export async function createFolder(name: string): Promise<Folder> {
  return fetchJson<Folder>(`${API_BASE_URL}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function updateFolder(id: number, name: string): Promise<Folder> {
  return fetchJson<Folder>(`${API_BASE_URL}/folders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/folders/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Patient ↔ Folder links
// ---------------------------------------------------------------------------

export async function addPatientToFolder(patientId: number, folderId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/patients/${patientId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
}

export async function removePatientFromFolder(patientId: number, folderId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/patients/${patientId}/folders/${folderId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Sessions & Summaries
// ---------------------------------------------------------------------------

export async function listSessions(patientId: number): Promise<Session[]> {
  const data = await fetchJson<{ sessions: Session[] }>(
    `${API_BASE_URL}/patients/${patientId}/sessions`
  );
  return data.sessions;
}

export async function getSessionWithSummaries(id: number): Promise<SessionWithSummaries> {
  const data = await fetchJson<{ summaries: Summary[] } & Session>(
    `${API_BASE_URL}/sessions/${id}`
  );
  return { ...data, summaries: data.summaries };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export interface LegacyHistoryItem {
  rawText: string;
  summary?: string;
  timestamp?: number;
  source?: string;
}

export async function migrateLocalStorage(items: LegacyHistoryItem[]): Promise<{
  migrated: boolean;
  patientId: number;
  sessionsCreated: number;
  summariesCreated: number;
}> {
  return fetchJson(`${API_BASE_URL}/migrate/localstorage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}
