import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Crosshair, FileText, MapPin, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useToast } from '../context/ToastContext';
import type { Mine, RecordBase } from '../types';
import { Button, Card } from '../components/ui';
import { UploadField } from '../components/FormFields';
import { useEffect } from 'react';

export function InspectionFormPage() {
  const { user } = useAuth(); const { selectedMine } = useScope(); const navigate = useNavigate(); const toast = useToast();
  const [mines, setMines] = useState<Mine[]>([]); const [busy, setBusy] = useState(false); const [files, setFiles] = useState<FileList | null>(null); const [locationBusy, setLocationBusy] = useState(false); const [locationMessage, setLocationMessage] = useState('Location has not been captured yet.');
  const [values, setValues] = useState({ mineId: '', inspectionType: 'Safety', date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5), lat: '', lng: '', observation: '', severity: 'MEDIUM', remarks: '' });
  useEffect(() => { api.get<Mine[]>('/mines').then((data) => { setMines(data); setValues((current) => ({ ...current, mineId: selectedMine !== 'all' ? selectedMine : data[0]?.id || '' })); }).catch((error) => toast(error.message, 'error')); }, []);
  const change = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  function captureLocation() {
    if (!navigator.geolocation) { setLocationMessage('Location services are not supported by this browser.'); toast('Location services are not supported by this browser.', 'error'); return; }
    setLocationBusy(true); setLocationMessage('Requesting current location…');
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = position.coords.latitude.toFixed(6); const lng = position.coords.longitude.toFixed(6);
      setValues((current) => ({ ...current, lat, lng })); setLocationMessage('GPS coordinates captured from this device.'); setLocationBusy(false); toast('Current GPS coordinates captured.');
    }, (error) => {
      const message = error.code === error.PERMISSION_DENIED ? 'Location access was denied. Enter the mine coordinates manually.' : 'Current location is unavailable. Enter the mine coordinates manually.';
      setLocationMessage(message); setLocationBusy(false); toast(message, 'error');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.mineId) { toast('Select a mine before submitting this inspection.', 'error'); return; }
    setBusy(true);
    try {
      const mine = mines.find((entry) => entry.id === values.mineId);
      const coordinates = { lat: values.lat ? Number(values.lat) : mine?.coordinates.lat || 0, lng: values.lng ? Number(values.lng) : mine?.coordinates.lng || 0 };
      const uploaded = files?.length ? (await api.upload(files)).files : [];
      const record = await api.post<RecordBase>('/inspections', {
        mineId: values.mineId, inspectionType: values.inspectionType, date: values.date, time: values.time,
        coordinates, observation: values.observation, severity: values.severity, remarks: values.remarks,
        photos: uploaded.filter((file) => file.name.match(/\.(jpe?g|png|webp)$/i)), documents: uploaded.filter((file) => !file.name.match(/\.(jpe?g|png|webp)$/i)),
      });
      toast('Inspection submitted and recorded in the audit trail.'); navigate(`/inspections/${record.id}`);
    } catch (error) { toast(error instanceof Error ? error.message : 'Inspection could not be submitted.', 'error'); } finally { setBusy(false); }
  }
  const mine = mines.find((entry) => entry.id === values.mineId);
  return <div className="page-enter inspection-create-page">
    <Link className="back-link" to="/inspections"><ArrowLeft size={15} /> Back to inspections</Link>
    <div className="field-form-heading"><div className="field-form-icon"><Camera size={19} /></div><div><span className="eyebrow">FIELD REPORTING · MOBILE READY</span><h1>New inspection</h1><p>Capture the observation where the work happens. Location and evidence are attached to the record.</p></div><span className="field-secure"><ShieldCheck size={14} /> Secure submission</span></div>
    <form onSubmit={submit} className="inspection-form">
      <div className="inspection-form-main">
        <Card className="field-form-card" title="Inspection context" subtitle="Set the mine, category and the inspection time.">
          <div className="form-grid"><label className="form-field field-full"><span>Mine <b className="required-dot">*</b></span><select required value={values.mineId} onChange={(event) => change('mineId', event.target.value)}><option value="">Select mine</option>{mines.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.code}</option>)}</select></label>
            <label className="form-field"><span>Inspection type <b className="required-dot">*</b></span><select required value={values.inspectionType} onChange={(event) => change('inspectionType', event.target.value)}>{['Safety', 'Environment', 'Labour', 'Production', 'Equipment', 'General'].map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <label className="form-field"><span>Severity <b className="required-dot">*</b></span><select required value={values.severity} onChange={(event) => change('severity', event.target.value)}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <label className="form-field"><span>Date <b className="required-dot">*</b></span><input required type="date" value={values.date} onChange={(event) => change('date', event.target.value)} /></label>
            <label className="form-field"><span>Time</span><input type="time" value={values.time} onChange={(event) => change('time', event.target.value)} /></label>
          </div>
        </Card>
        <Card className="field-form-card observation-form-card" title="Field observation" subtitle="Be specific: describe the condition, location and immediate control.">
          <label className="form-field"><span>Observation <b className="required-dot">*</b></span><textarea required minLength={8} rows={5} placeholder="Describe what was observed. Include equipment or area identifiers where possible…" value={values.observation} onChange={(event) => change('observation', event.target.value)} /><small>Minimum 8 characters. This observation can be converted into a tracked violation.</small></label>
          <label className="form-field remarks-field"><span>Additional remarks</span><textarea rows={3} placeholder="Immediate action taken, shift supervisor notified, follow-up recommended…" value={values.remarks} onChange={(event) => change('remarks', event.target.value)} /></label>
          <div className="inspection-attachments"><div className="upload-section-label"><span><Camera size={15} /> Photos & documents</span><small>Optional · JPG, PNG, PDF · 10 MB max per file</small></div><UploadField onChange={setFiles} accept="image/*,.pdf,.doc,.docx" files={files ? Array.from(files) : []} /></div>
        </Card>
      </div>
      <div className="inspection-form-aside">
        <Card className="location-card" title="Field location" subtitle="Capture GPS or use the registered mine coordinates.">
          <button type="button" className="capture-location-button" onClick={captureLocation} disabled={locationBusy}><span className="capture-icon"><Crosshair size={18} /></span><span><b>{locationBusy ? 'Capturing location…' : 'Use current location'}</b><small>Browser GPS · high accuracy</small></span></button>
          <div className="gps-input-grid"><label className="form-field"><span>Latitude</span><input type="number" step="any" placeholder={mine?.coordinates.lat.toFixed(4) || '20.0000'} value={values.lat} onChange={(event) => change('lat', event.target.value)} /></label><label className="form-field"><span>Longitude</span><input type="number" step="any" placeholder={mine?.coordinates.lng.toFixed(4) || '78.0000'} value={values.lng} onChange={(event) => change('lng', event.target.value)} /></label></div>
          <div className={`location-capture-note ${values.lat ? 'location-captured' : ''}`}><MapPin size={14} />{values.lat ? `${values.lat}, ${values.lng}` : locationMessage}</div>
        </Card>
        <div className="field-submit-card"><div className="field-submit-top"><span><ClipboardCheckIcon /></span><div><b>Ready to submit?</b><small>Inspection is saved with your user profile.</small></div></div><Button type="submit" className="field-submit-button" disabled={busy}>{busy ? <span className="mini-spinner" /> : <CheckCircle2 size={16} />}{busy ? 'Submitting inspection…' : 'Submit inspection'}</Button><p><ShieldCheck size={13} /> Data is securely recorded and audit logged.</p></div>
        <div className="field-side-tip"><TriangleAlert size={15} /><span>High and critical observations should also be recorded as a violation so corrective action can be tracked to verification.</span></div>
      </div>
    </form>
  </div>;
}
function ClipboardCheckIcon() { return <FileText size={17} />; }
