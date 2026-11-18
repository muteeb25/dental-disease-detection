'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Pencil, Plus, Search, Trash2, UserRoundPlus, X } from 'lucide-react';
import { api, Patient, Scan } from '@/lib/api';

type PatientForm = { name: string; age: string; gender: string; phone: string; notes: string };
type PatientRow = Patient & { scans: Scan[] };
const emptyForm: PatientForm = { name: '', age: '', gender: '', phone: '', notes: '' };
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';

function validate(form: PatientForm) {
  const name = form.name.trim();
  if (!name) return 'Enter the patient’s name.';
  if (name.length > 120) return 'Name must be 120 characters or fewer.';
  if (form.age && (!/^\d{1,3}$/.test(form.age) || Number(form.age) > 120)) return 'Age must be a whole number from 0 to 120.';
  if (form.phone.trim() && !/^\+?[\d\s().-]{5,20}$/.test(form.phone.trim())) return 'Enter a phone number using 5–20 digits and common phone punctuation.';
  return '';
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<PatientForm>(emptyForm);
  const [editTarget, setEditTarget] = useState<PatientRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const rows = await api<Patient[]>('/patients');
      const result = await Promise.all(rows.map(async (patient) => ({ ...patient, scans: await api<Scan[]>(`/patients/${patient.id}/scans`) })));
      setPatients(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'The patient list could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (!localStorage.getItem('token')) { location.href = '/login'; return; } void load(); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 3600); return () => window.clearTimeout(timer); }, [toast]);

  const visiblePatients = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return patients.filter((patient) => patient.name.toLocaleLowerCase().includes(needle) || (patient.phone ?? '').toLocaleLowerCase().includes(needle));
  }, [patients, query]);

  async function submit(event: FormEvent<HTMLFormElement>, target?: PatientRow | null) {
    event.preventDefault();
    const issue = validate(form);
    if (issue) { setToast({ text: issue, kind: 'error' }); return; }
    const body = { name: form.name.trim(), age: form.age ? Number(form.age) : null, gender: form.gender || null, phone: form.phone.trim() || null, notes: form.notes.trim() || null };
    setSaving(true);
    try {
      if (target) { await api(`/patients/${target.id}`, { method: 'PUT', body: JSON.stringify(body) }); setToast({ text: 'Patient details updated.', kind: 'success' }); setEditTarget(null); }
      else { await api('/patients', { method: 'POST', body: JSON.stringify(body) }); setForm(emptyForm); setToast({ text: 'Patient added successfully.', kind: 'success' }); }
      await load();
    } catch (e) { setToast({ text: e instanceof Error ? e.message : 'Could not save the patient.', kind: 'error' }); }
    finally { setSaving(false); }
  }

  function beginEdit(patient: PatientRow) {
    setForm({ name: patient.name, age: patient.age == null ? '' : String(patient.age), gender: patient.gender ?? '', phone: patient.phone ?? '', notes: patient.notes ?? '' });
    setEditTarget(patient);
  }

  async function remove(patient: PatientRow) {
    if (!window.confirm('This also deletes this patient’s scans. Continue?')) return;
    try { await api(`/patients/${patient.id}`, { method: 'DELETE' }); setToast({ text: 'Patient and saved scans deleted.', kind: 'success' }); await load(); }
    catch (e) { setToast({ text: e instanceof Error ? e.message : 'Could not delete the patient.', kind: 'error' }); }
  }

  function renderFields() {
    return <div className="patient-form-grid">
      <div className="form-field form-span-2"><label htmlFor="patient-name">Name <span className="required-mark">*</span></label><input id="patient-name" autoFocus={Boolean(editTarget)} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Patient name" required/></div>
      <div className="form-field"><label htmlFor="patient-age">Age</label><input id="patient-age" type="number" min="0" max="120" step="1" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age"/></div>
      <div className="form-field"><label htmlFor="patient-gender">Gender</label><select id="patient-gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></div>
      <div className="form-field form-span-2"><label htmlFor="patient-phone">Phone</label><input id="patient-phone" type="tel" inputMode="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +1 555 010 2040"/></div>
      <div className="form-field form-span-full"><label htmlFor="patient-notes">Notes</label><textarea id="patient-notes" maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes for this patient record"/></div>
    </div>;
  }

  return <main className="page-stack">
    <div className="page-heading"><div><span className="eyebrow">PATIENT RECORDS</span><h1>Patients</h1><p className="muted">Manage patient details and follow-up imaging in one place.</p></div><div className="patients-count"><strong>{patients.length}</strong> {patients.length === 1 ? 'patient' : 'patients'}</div></div>

    <section className="panel patient-form">
      <div className="section-heading"><div><h2><UserRoundPlus className="heading-inline-icon" size={19}/> Add a patient</h2><p className="muted">Fields marked with an asterisk are required.</p></div></div>
      <form onSubmit={(event) => void submit(event)}>{renderFields()}<div className="form-actions"><button className="btn" type="submit" disabled={saving}><Plus size={17}/>{saving ? 'Saving…' : 'Add patient'}</button></div></form>
    </section>

    <section className="panel patient-list-panel">
      <div className="section-heading patients-toolbar"><div><h2>Patient list</h2><p className="muted">Search by name or phone number.</p></div><label className="search-field"><Search size={17}/><input className="field" type="search" aria-label="Search patients by name or phone" placeholder="Search patients…" value={query} onChange={(e) => setQuery(e.target.value)}/></label></div>
      {error && <div className="notice notice-error" role="alert"><strong>Could not load patients</strong><span>{error}</span><button className="text-button" onClick={() => void load()}>Try again</button></div>}
      {loading ? <div className="table-skeleton"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : patients.length === 0 ? <div className="empty-state"><div className="empty-icon"><UserRoundPlus size={23}/></div><h3>No patients yet</h3><p>Add a patient above to start a record and save scans.</p></div> : visiblePatients.length === 0 ? <div className="empty-state"><div className="empty-icon"><Search size={22}/></div><h3>No matching patients</h3><p>Try another name or phone number.</p><button className="text-button" onClick={() => setQuery('')}>Clear search</button></div> : <div className="table-scroll"><table className="data-table patients-table"><thead><tr><th>Patient</th><th>Age</th><th>Gender</th><th>Phone</th><th>Scans</th><th>Last scan</th><th>Actions</th></tr></thead><tbody>{visiblePatients.map((patient) => {
        const lastScan = [...patient.scans].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
        return <tr key={patient.id}><td><div className="patient-name-cell"><span className="patient-avatar">{patient.name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span><span><Link className="patient-name-text" href={`/patients/${patient.id}`}>{patient.name}</Link><span className="patient-subtle">Record #{patient.id}</span></span></div></td><td>{patient.age ?? '—'}</td><td>{patient.gender || '—'}</td><td>{patient.phone || '—'}</td><td><span className="count-pill">{patient.scans.length}</span></td><td>{formatDate(lastScan?.created_at)}</td><td><div className="action-group"><Link className="icon-button" href={`/patients/${patient.id}`} aria-label={`Open ${patient.name}`} title="Open"><ArrowUpRight size={17}/></Link><button className="icon-button" onClick={() => beginEdit(patient)} aria-label={`Edit ${patient.name}`} title="Edit"><Pencil size={16}/></button><button className="icon-button danger" onClick={() => void remove(patient)} aria-label={`Delete ${patient.name}`} title="Delete"><Trash2 size={16}/></button></div></td></tr>;
      })}</tbody></table></div>}
    </section>

    {editTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditTarget(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-patient-title">
      <div className="modal-heading"><div><h2 id="edit-patient-title">Edit patient</h2><p>Update {editTarget.name}’s record details.</p></div><button className="icon-button" onClick={() => setEditTarget(null)} aria-label="Close edit dialog"><X size={19}/></button></div>
      <form onSubmit={(event) => void submit(event, editTarget)}>{renderFields()}<div className="form-actions"><button className="btn secondary" type="button" onClick={() => setEditTarget(null)}>Cancel</button><button className="btn" type="submit" disabled={saving}><Check size={16}/>{saving ? 'Saving…' : 'Save changes'}</button></div></form>
    </section></div>}
    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.kind === 'success' ? <Check size={17}/> : <X size={17}/>}<span>{toast.text}</span></div>}
  </main>;
}
