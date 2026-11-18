'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Activity, ArrowLeft, CalendarDays, Download, FileImage, Plus, ScanLine, Trash2 } from 'lucide-react';
import { API, api, authenticatedImage, Patient, Scan } from '@/lib/api';

const readableDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [images, setImages] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) { location.href = '/login'; return; }
    let active = true; let objectUrls: string[] = [];
    async function load() {
      setLoading(true); setError('');
      try {
        const [record, history] = await Promise.all([api<Patient>(`/patients/${id}`), api<Scan[]>(`/patients/${id}/scans`)]);
        const imagePairs = await Promise.all(history.map(async (scan) => {
          try { const url = await authenticatedImage(scan.annotated_url); objectUrls.push(url); return [scan.id, url] as const; }
          catch { return [scan.id, ''] as const; }
        }));
        if (active) { setPatient(record); setScans(history); setImages(Object.fromEntries(imagePairs)); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not load this patient record.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; objectUrls.forEach(URL.revokeObjectURL); };
  }, [id]);

  const totalFindings = scans.reduce((total, scan) => total + scan.findings.length, 0);
  const classCounts = useMemo(() => {
    const counts = new Map<string, number>();
    scans.forEach((scan) => scan.findings.forEach((finding) => counts.set(finding.label, (counts.get(finding.label) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [scans]);

  async function downloadPdf(scan: Scan) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/scans/${scan.id}/report.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('Could not download the PDF report.');
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `dental-scan-${scan.id}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Could not download the PDF report.'); }
  }

  async function deleteScan(scan: Scan) {
    if (!window.confirm('Delete this saved scan and its images?')) return;
    try { await api(`/scans/${scan.id}`, { method: 'DELETE' }); setScans((current) => current.filter((item) => item.id !== scan.id)); setToast('Scan deleted.'); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Could not delete this scan.'); }
  }

  return <main className="page-stack">
    <div className="page-heading"><div><Link className="subtle-link back-link" href="/patients"><ArrowLeft size={15}/> Patients</Link><span className="eyebrow detail-eyebrow">PATIENT RECORD</span><h1>{loading ? 'Loading patient…' : patient?.name ?? 'Patient record'}</h1><p className="muted">Patient details and saved imaging history.</p></div>{patient && <Link className="btn primary-action" href={`/detect?patient=${patient.id}`}><Plus size={17}/> New scan for this patient</Link>}</div>
    {error && <div className="notice notice-error" role="alert"><strong>Could not open patient</strong><span>{error}</span><Link className="text-button" href="/patients">Back to patients</Link></div>}
    {loading ? <section className="panel"><div className="table-skeleton"><div className="skeleton"/><div className="skeleton"/></div></section> : patient && <>
      <section className="panel"><div className="section-heading"><div><h2>Patient information</h2><p className="muted">Record #{patient.id}</p></div><span className="count-pill">{scans.length} {scans.length === 1 ? 'scan' : 'scans'}</span></div>
        <div className="patient-summary-grid"><div className="summary-item"><span>Age</span><strong>{patient.age ?? '—'}</strong></div><div className="summary-item"><span>Gender</span><strong>{patient.gender || '—'}</strong></div><div className="summary-item"><span>Phone</span><strong>{patient.phone || '—'}</strong></div><div className="summary-item"><span>Total findings</span><strong>{totalFindings}</strong></div></div>
        {patient.notes && <p className="patient-notes"><strong>Notes</strong><br/>{patient.notes}</p>}
      </section>
      <section className="page-stack scan-history-section"><div className="section-heading"><div><h2>Scan history</h2><p className="muted">Annotated images and model findings saved for this patient.</p></div></div>
        {scans.length ? <div className="scan-card-grid">{scans.map((scan) => {
          const counts = scan.findings.reduce<Map<string, number>>((map, finding) => map.set(finding.label, (map.get(finding.label) ?? 0) + 1), new Map());
          return <article className="panel patient-scan-card" key={scan.id}>
            <Link href={`/scans/${scan.id}`} aria-label={`Open scan ${scan.id}`}>{images[scan.id] ? <img className="patient-scan-image" src={images[scan.id]} alt={`Annotated dental X-ray from ${readableDate(scan.created_at)}`}/> : <div className="patient-scan-placeholder"><FileImage size={27}/><span>Annotated image unavailable</span></div>}</Link>
            <div className="patient-scan-body"><Link href={`/scans/${scan.id}`} className="scan-date"><CalendarDays size={15}/>{readableDate(scan.created_at)}<span className="table-secondary">Scan #{scan.id}</span></Link>
              <div className="findings-summary">{counts.size ? [...counts].map(([label, count]) => <span className="finding-pill" key={label}>{label} · {count}</span>) : <span className="muted small-copy">No findings detected</span>}</div>
              <div className="scan-actions"><Link className="btn secondary" href={`/scans/${scan.id}`}><Activity size={15}/> Open scan</Link><button className="btn" onClick={() => void downloadPdf(scan)}><Download size={15}/> Download PDF report</button><button className="icon-button danger" onClick={() => void deleteScan(scan)} aria-label={`Delete scan ${scan.id}`} title="Delete scan"><Trash2 size={16}/></button></div>
            </div>
          </article>;
        })}</div> : <div className="panel empty-state"><div className="empty-icon"><ScanLine size={23}/></div><h3>No scans for this patient</h3><p>Analyze an X-ray and save the result to start this patient’s scan history.</p><Link className="btn" href={`/detect?patient=${patient.id}`}><Plus size={16}/> New scan for this patient</Link></div>}
      </section>
    </>}
    {toast && <div className="toast error" role="alert">{toast}</div>}
  </main>;
}
