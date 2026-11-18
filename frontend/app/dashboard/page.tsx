'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowUpRight, Image as ImageIcon, ScanLine, Users, WandSparkles } from 'lucide-react';
import { API, api, Dashboard as DashboardData, logout, Patient, Scan } from '@/lib/api';

type ModelInfo = {
  model_name: string;
  class_names: string[];
  loaded: boolean;
  metrics?: { map50?: number; map50_95?: number; precision?: number; recall?: number } | null;
};
type ScanItem = Scan & { patient_name: string; thumbnail?: string };

const chipColors = ['mint', 'blue', 'violet', 'amber', 'rose', 'cyan'];
const pct = (n?: number) => (typeof n === 'number' && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—');
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [allScans, setAllScans] = useState<Scan[]>([]);
  const [recent, setRecent] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) { location.href = '/login'; return; }
    let active = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const [dashboard, info, patients] = await Promise.all([
          api<DashboardData>('/dashboard'), api<ModelInfo>('/model-info'), api<Patient[]>('/patients'),
        ]);
        const scanGroups = await Promise.all(patients.map((p) => api<Scan[]>(`/patients/${p.id}/scans`)));
        const scans = scanGroups.flat();
        const patientById = new Map(patients.map((p) => [p.id, p.name]));
        const imageItems = await Promise.all(dashboard.recent_scans.map(async (scan) => {
          let thumbnail = '';
          try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API}${scan.annotated_url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if (response.ok) thumbnail = URL.createObjectURL(await response.blob());
          } catch { /* Keep the table usable if a thumbnail is unavailable. */ }
          return { ...scan, patient_name: patientById.get(scan.patient_id) ?? 'Patient record', thumbnail };
        }));
        if (active) { setData(dashboard); setModel(info); setAllScans(scans); setRecent(imageItems); }
        else imageItems.forEach((item) => item.thumbnail && URL.revokeObjectURL(item.thumbnail));
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load dashboard data.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => () => recent.forEach((item) => item.thumbnail && URL.revokeObjectURL(item.thumbnail)), [recent]);

  const totalFindings = allScans.reduce((sum, scan) => sum + scan.findings.length, 0);
  const findings = useMemo(() => {
    const counts = new Map<string, number>();
    allScans.forEach((scan) => scan.findings.forEach(({ label }) => counts.set(label, (counts.get(label) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [allScans]);
  const maxFindingCount = Math.max(1, ...findings.map(([, count]) => count));

  return <main className="page-stack">
    <div className="page-heading">
      <div><span className="eyebrow">CLINIC OVERVIEW</span><h1>Dashboard</h1><p className="muted">A clear view of saved patient imaging and model results.</p></div>
      <Link className="btn primary-action" href="/detect"><WandSparkles size={17}/> Analyze an X-ray <ArrowUpRight size={16}/></Link>
    </div>

    {error && <div className="notice notice-error" role="alert"><strong>Dashboard unavailable</strong><span>{error}</span><button className="text-button" onClick={() => location.reload()}>Try again</button></div>}

    <section className="stats-grid" aria-label="Practice statistics">
      {[
        { label: 'Patients', value: data?.patients, icon: Users, tone: 'teal' },
        { label: 'Saved scans', value: data?.scans, icon: ScanLine, tone: 'blue' },
        { label: 'Total findings', value: totalFindings, icon: Activity, tone: 'violet' },
        { label: 'Model', value: model?.model_name ?? '—', icon: WandSparkles, tone: 'amber', model: true },
      ].map(({ label, value, icon: Icon, tone, model: isModel }) => <article className="stat-card" key={label}>
        <div className={`stat-icon ${tone}`}><Icon size={19}/></div><p className="stat-label">{label}</p>
        {loading ? <div className="skeleton stat-skeleton"/> : <strong className={isModel ? 'stat-model-value' : 'stat-value'}>{value ?? '—'}</strong>}
        {isModel && !loading && <span className="stat-caption">{model?.loaded ? 'Configured model loaded' : 'Configured model unavailable'}</span>}
      </article>)}
    </section>

    <div className="dashboard-grid">
      <section className="panel recent-panel">
        <div className="section-heading"><div><h2>Recent scans</h2><p className="muted">The latest saved X-ray reviews.</p></div><Link className="subtle-link" href="/patients">View patients <ArrowUpRight size={15}/></Link></div>
        {loading ? <div className="table-skeleton"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : recent.length ? <div className="table-scroll"><table className="data-table recent-table"><thead><tr><th>Image</th><th>Patient</th><th>Date</th><th>Findings</th><th/></tr></thead><tbody>{recent.map((scan) => <tr key={scan.id}>
          <td><Link href={`/scans/${scan.id}`} className="scan-thumb">{scan.thumbnail ? <img src={scan.thumbnail} alt={`Annotated scan for ${scan.patient_name}`}/> : <ImageIcon size={19}/>}</Link></td>
          <td><Link className="table-primary" href={`/patients/${scan.patient_id}`}>{scan.patient_name}</Link><span className="table-secondary">Scan #{scan.id}</span></td>
          <td>{date(scan.created_at)}</td><td><span className="count-pill">{scan.findings.length}</span></td>
          <td><Link className="view-link" href={`/scans/${scan.id}`}>View <ArrowUpRight size={14}/></Link></td>
        </tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><ScanLine size={23}/></div><h3>No scans yet</h3><p>No scans yet. Analyze your first X-ray.</p><Link className="btn" href="/detect">Analyze first X-ray</Link></div>}
      </section>

      <aside className="panel model-panel">
        <div className="section-heading"><div><h2>Model overview</h2><p className="muted">Evaluation and detection classes</p></div></div>
        {loading ? <div className="table-skeleton"><div className="skeleton"/><div className="skeleton"/></div> : <>
          <div className="model-title-row"><span className="model-file">{model?.model_name ?? 'Model unavailable'}</span></div>
          <p className="class-count">{model?.class_names.length ?? 0} classes</p>
          <div className="class-chips">{model?.class_names.map((name, i) => <span className={`class-chip ${chipColors[i % chipColors.length]}`} key={name}>{name}</span>)}</div>
          <p className="training-note">YOLO11m - Roboflow Universe</p>
          <div className="metric-grid">
            {[['mAP@50', model?.metrics?.map50], ['mAP@50–95', model?.metrics?.map50_95], ['Precision', model?.metrics?.precision], ['Recall', model?.metrics?.recall]].map(([label, score]) => <div className="metric-tile" key={String(label)}><span>{label}</span><strong>{pct(typeof score === 'number' ? score : undefined)}</strong></div>)}
          </div>
          <p className="metric-source">Test-set metrics from the project evaluation report.</p>
        </>}
      </aside>
    </div>

    <section className="panel findings-panel">
      <div className="section-heading"><div><h2>Findings by class</h2><p className="muted">Counts from all saved scans.</p></div><span className="section-total">{totalFindings} total</span></div>
      {loading ? <div className="table-skeleton"><div className="skeleton"/><div className="skeleton"/><div className="skeleton"/></div> : findings.length ? <div className="bar-list">{findings.map(([label, count], i) => <div className="bar-row" key={label}><div className="bar-label-row"><span className={`bar-dot ${chipColors[i % chipColors.length]}`}/><span className="bar-label">{label}</span><strong>{count}</strong></div><div className="bar-track"><span className={`bar-fill ${chipColors[i % chipColors.length]}`} style={{ width: `${(count / maxFindingCount) * 100}%` }}/></div></div>)}</div> : <div className="empty-state compact-empty"><div className="empty-icon"><Activity size={22}/></div><h3>No saved findings</h3><p>Class totals will appear after scans are saved to a patient record.</p></div>}
    </section>
  </main>;
}
