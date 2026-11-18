'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Download, UserRound } from 'lucide-react';
import { API, api, authenticatedImage, Patient, Scan } from '@/lib/api';

export default function ScanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id);
  const [scan, setScan] = useState<Scan | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('token')) { location.href = '/login'; return; }
    let active = true; let objectUrl = '';
    async function load() {
      try {
        const result = await api<Scan>(`/scans/${id}`);
        const [record, imageUrl] = await Promise.all([api<Patient>(`/patients/${result.patient_id}`), authenticatedImage(result.annotated_url)]);
        objectUrl = imageUrl;
        if (active) { setScan(result); setPatient(record); setImage(imageUrl); }
        else URL.revokeObjectURL(imageUrl);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Could not load the scan.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);

  async function downloadPdf() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/scans/${id}/report.pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('Could not download the PDF report.');
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `dental-scan-${id}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not download the PDF report.'); }
  }

  const counts = scan?.findings.reduce<Map<string, number>>((map, finding) => map.set(finding.label, (map.get(finding.label) ?? 0) + 1), new Map()) ?? new Map();
  return <main className="page-stack">
    <div className="page-heading"><div><Link className="subtle-link back-link" href={patient ? `/patients/${patient.id}` : '/patients'}><ArrowLeft size={15}/> {patient?.name ?? 'Patient record'}</Link><span className="eyebrow detail-eyebrow">SAVED SCAN · #{id}</span><h1>Scan review</h1><p className="muted">Review the annotated image and saved model findings.</p></div>{scan && <button className="btn primary-action" onClick={() => void downloadPdf()}><Download size={17}/> Download PDF report</button>}</div>
    {error && <div className="notice notice-error" role="alert"><strong>Scan unavailable</strong><span>{error}</span></div>}
    {loading && <section className="scan-detail-grid"><div className="panel"><div className="skeleton scan-loading-image"/></div><aside className="panel"><div className="table-skeleton"><div className="skeleton"/><div className="skeleton"/></div></aside></section>}
    {scan && <section className="scan-detail-grid"><article className="panel scan-image-panel">{image ? <img className="scan-view-image" src={image} alt="Annotated panoramic X-ray with detected regions"/> : <div className="skeleton scan-view-image"/>}</article>
      <aside className="panel"><div className="section-heading"><div><h2>Scan details</h2><p className="muted">{scan.model_name}</p></div></div>
        <div className="scan-info-list"><div className="scan-info-row"><span><UserRound className="heading-inline-icon" size={15}/> Patient</span><strong>{patient ? <Link className="subtle-link" href={`/patients/${patient.id}`}>{patient.name}</Link> : '—'}</strong></div><div className="scan-info-row"><span><CalendarDays className="heading-inline-icon" size={15}/> Date</span><strong>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(scan.created_at))}</strong></div><div className="scan-info-row"><span>Findings</span><strong>{scan.findings.length}</strong></div></div>
        <h3 className="findings-title">Findings by class</h3>{counts.size ? <div className="findings-summary">{[...counts].map(([label, count]) => <span className="finding-pill" key={label}>{label} · {count}</span>)}</div> : <p className="muted small-copy">No findings detected.</p>}
        {scan.findings.length > 0 && <div className="scan-box-list">{scan.findings.map((finding, index) => <div className="scan-box-row" key={`${finding.label}-${index}`}><span>{finding.label}</span><strong>{(finding.confidence * 100).toFixed(1)}%</strong></div>)}</div>}
      </aside>
    </section>}
  </main>;
}
