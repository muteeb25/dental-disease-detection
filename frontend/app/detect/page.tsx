'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Activity, Check, ImagePlus, LoaderCircle, Save, ScanSearch, X } from 'lucide-react';
import { api, Box, Patient } from '@/lib/api';

type DetectionResult = {
  boxes: Box[];
  image_width: number;
  image_height: number;
  model_name: string;
  original_url: string;
  annotated_url: string;
};
const palette = ['#00a98f', '#ed8b2f', '#7565dc', '#d94f75', '#c39418', '#268cb8', '#608c31', '#b654b8'];
function colorFor(label: string) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export default function DetectPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [confidence, setConfidence] = useState(0.10);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const filteredBoxes = useMemo(() => result?.boxes.filter((box) => box.confidence >= confidence) ?? [], [result, confidence]);
  const legendClasses = useMemo(() => [...new Set(result?.boxes.map((box) => box.label) ?? [])], [result]);

  useEffect(() => {
    if (!localStorage.getItem('token')) { location.href = '/login'; return; }
    const requestedPatient = new URLSearchParams(window.location.search).get('patient');
    if (requestedPatient) setPatientId(requestedPatient);
    api<Patient[]>('/patients').then(setPatients).catch(() => setError('Could not load patients. You can still analyze an image.'));
  }, []);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected); setPreviewUrl(URL.createObjectURL(selected)); setResult(null); setVisible({}); setError('');
  }

  async function analyze() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      // Ask the detector for its full useful range. The slider filters this
      // cached response locally, so changing the threshold never reruns YOLO.
      const response = await api<DetectionResult>('/detect?conf=0.01', { method: 'POST', body: form });
      setResult(response); setVisible({});
    } catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed. Please try again.'); }
    finally { setBusy(false); }
  }

  async function saveScan() {
    try {
      let targetId = patientId;
      if (!targetId) {
        if (!newPatientName.trim()) { setError('Choose a patient or enter a name for a new patient.'); return; }
        const patient = await api<Patient>('/patients', { method: 'POST', body: JSON.stringify({ name: newPatientName.trim() }) });
        targetId = String(patient.id);
      }
      await api(`/patients/${targetId}/scans`, {
        method: 'POST',
        body: JSON.stringify({ boxes: filteredBoxes, model_name: result?.model_name, original_path: result?.original_url, annotated_path: result?.annotated_url }),
      });
      setShowSave(false); setError(''); setSaveMessage('Scan saved to the patient record.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this scan.'); }
  }

  const [saveMessage, setSaveMessage] = useState('');
  useEffect(() => { if (!saveMessage) return; const timer = window.setTimeout(() => setSaveMessage(''), 3500); return () => window.clearTimeout(timer); }, [saveMessage]);

  return <main className="page-stack detect-page">
    <div className="page-heading"><div><span className="eyebrow">IMAGE REVIEW</span><h1>Analyze panoramic X-ray</h1><p className="muted">Upload a JPG or PNG, then review the model’s suggested regions.</p></div></div>
    <section className="panel detect-controls">
      <label className="upload-drop" htmlFor="xray-file"><span className="upload-icon"><ImagePlus size={22}/></span><span><strong>{file?.name ?? 'Choose a panoramic X-ray'}</strong><small>JPG or PNG · maximum 15 MB</small></span><input id="xray-file" type="file" accept="image/jpeg,image/png" onChange={chooseFile}/></label>
      <div className="confidence-control"><div className="confidence-heading"><label htmlFor="confidence">Confidence threshold</label><output htmlFor="confidence">{confidence.toFixed(2)}</output></div><input id="confidence" type="range" min="0.01" max="0.90" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}/><div className="range-labels"><span>0.01</span><span>0.90</span></div></div>
      <button className="btn analyze-button" disabled={!file || busy} onClick={() => void analyze()}>{busy ? <><LoaderCircle className="spin" size={17}/> Analyzing…</> : <><ScanSearch size={17}/> Analyze image</>}</button>
    </section>
    {error && <div className="notice notice-error" role="alert"><strong>Could not complete action</strong><span>{error}</span><button className="text-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
    {saveMessage && <div className="notice notice-success" role="status"><Check size={17}/>{saveMessage}</div>}

    {previewUrl && <section className="panel result-panel">
      <div className="section-heading result-heading"><div><h2>Analysis result</h2><p className="muted">Box positions scale with the image as the page resizes.</p></div>{result && <span className="count-pill result-count">{filteredBoxes.length} {filteredBoxes.length === 1 ? 'finding' : 'findings'}</span>}</div>
      <div className="image-stage">
        <div className="image-overlay-wrapper" style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0 }}>
          <img src={previewUrl} alt="Uploaded panoramic dental X-ray"/>
          {result && filteredBoxes.filter((box) => visible[box.label] !== false).map((box, index) => {
            const color = colorFor(box.label);
            return <div
              key={`${box.label}-${index}`}
              title={`${box.label}: ${(box.confidence * 100).toFixed(1)}%`}
              style={{
                position: 'absolute',
                left: `${(box.x1 / result.image_width) * 100}%`,
                top: `${(box.y1 / result.image_height) * 100}%`,
                width: `${((box.x2 - box.x1) / result.image_width) * 100}%`,
                height: `${((box.y2 - box.y1) / result.image_height) * 100}%`,
                boxSizing: 'border-box',
                border: `2px solid ${color}`,
              }}
            ><span style={{ position: 'absolute', left: 0, top: 0, padding: '1px 4px', background: color, color: '#fff', fontSize: 10, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{box.label} {(box.confidence * 100).toFixed(0)}%</span></div>;
          })}
        </div>
      </div>
      {result && <div className="result-summary">
        {filteredBoxes.length === 0 ? <div className="no-findings" role="status"><Activity size={18}/><div><strong>No findings above the confidence threshold ({confidence.toFixed(2)}). Try lowering the threshold.</strong><span>{result.boxes.length ? `${result.boxes.length} lower-confidence ${result.boxes.length === 1 ? 'detection is' : 'detections are'} available if you reduce the slider.` : 'The model returned no detections for this image.'}</span></div></div> : <p className="found-count">Found <strong>{filteredBoxes.length}</strong> {filteredBoxes.length === 1 ? 'finding' : 'findings'} above {confidence.toFixed(2)} confidence.</p>}
        {legendClasses.length > 0 && <div className="class-legend" aria-label="Finding class color legend"><span className="legend-title">Classes</span>{legendClasses.map((label) => <label className={`legend-chip ${visible[label] === false ? 'muted-chip' : ''}`} key={label}><input type="checkbox" checked={visible[label] !== false} onChange={(event) => setVisible((current) => ({ ...current, [label]: event.target.checked }))}/><span className="legend-swatch" style={{ background: colorFor(label) }}/>{label}</label>)}</div>}
        {filteredBoxes.length > 0 && <div className="table-scroll"><table className="data-table finding-table"><thead><tr><th>Class</th><th>Confidence</th></tr></thead><tbody>{filteredBoxes.map((box, index) => <tr key={`${box.label}-${index}`}><td><span className="legend-swatch inline-swatch" style={{ background: colorFor(box.label) }}/>{box.label}</td><td>{(box.confidence * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>}
        <div className="save-result-row"><span className="muted">Model: {result.model_name}</span><button className="btn" onClick={() => setShowSave(true)}><Save size={16}/> Save to patient</button></div>
      </div>}
    </section>}

    {showSave && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSave(false); }}><section className="modal save-modal" role="dialog" aria-modal="true" aria-labelledby="save-scan-title"><div className="modal-heading"><div><h2 id="save-scan-title">Save scan to a patient</h2><p>Choose an existing patient or create a new record.</p></div><button className="icon-button" onClick={() => setShowSave(false)} aria-label="Close dialog"><X size={18}/></button></div><div className="form-field"><label htmlFor="save-patient">Patient</label><select id="save-patient" className="field" value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Create a new patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></div>{!patientId && <div className="form-field new-patient-field"><label htmlFor="new-patient-name">New patient name</label><input id="new-patient-name" className="field" value={newPatientName} onChange={(event) => setNewPatientName(event.target.value)} placeholder="Patient name"/> </div>}<div className="form-actions"><button className="btn secondary" onClick={() => setShowSave(false)}>Cancel</button><button className="btn" onClick={() => void saveScan()}>Save scan</button></div></section></div>}
    <p className="muted detect-disclaimer">Decision-support only — not a diagnosis. A qualified dentist must review every result.</p>
  </main>;
}
