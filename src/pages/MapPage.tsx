import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';
import { useScope } from '../context/ScopeContext';
import { useToast } from '../context/ToastContext';
import type { Mine } from '../types';
import { Card, EmptyState, LoadingState, PageHeader, RiskBadge } from '../components/ui';

const colorFor = (level: string) => ({ LOW: '#28a879', MEDIUM: '#e9b949', HIGH: '#ed8e42', CRITICAL: '#d94d58' } as Record<string, string>)[level] || '#71809a';
export function MineMapPage() {
  const { selectedMine } = useScope(); const [mines, setMines] = useState<Mine[]>([]); const [loading, setLoading] = useState(true); const toast = useToast();
  useEffect(() => { setLoading(true); api.get<Mine[]>(`/mines${selectedMine !== 'all' ? `?mineId=${selectedMine}` : ''}`).then(setMines).catch((error) => toast(error instanceof Error ? error.message : 'Mine locations could not be loaded.', 'error')).finally(() => setLoading(false)); }, [selectedMine, toast]);
  const center: [number, number] = mines.length ? [mines.reduce((sum, mine) => sum + mine.coordinates.lat, 0) / mines.length, mines.reduce((sum, mine) => sum + mine.coordinates.lng, 0) / mines.length] : [21.1, 80.2];
  return <div className="page-enter"><PageHeader eyebrow="GEOSPATIAL OVERSIGHT" title="Mine map" description="Explore operational locations and risk posture across the coal portfolio." actions={<span className="map-data-note"><span className="live-dot" /> {mines.length} registered mine locations</span>} />
    <div className="map-page-layout"><Card className="mine-map-card" noPadding><div className="map-legend"><span>RISK LEVEL</span>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => <i key={level}><b style={{ background: colorFor(level) }} />{level}</i>)}</div>{loading ? <div className="map-loading"><LoadingState label="Loading mine locations…" /></div> : <MapContainer center={center} zoom={mines.length > 1 ? 5 : 8} scrollWheelZoom className="mine-map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{mines.map((mine) => <CircleMarker key={mine.id} center={[mine.coordinates.lat, mine.coordinates.lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: colorFor(mine.riskLevel), fillOpacity: .96 }}><Popup><div className="map-popup"><strong>{mine.name}</strong><span>{mine.code} · {mine.district}</span><div><RiskBadge level={mine.riskLevel} score={mine.riskScore} /></div><span>Compliance {mine.compliancePercentage}%</span><Link to={`/mines/${mine.id}`}>Open mine profile →</Link></div></Popup></CircleMarker>)}</MapContainer>}</Card>
      <aside className="map-side-list"><Card title="Site overview" subtitle="Risk-weighted mine locations">{mines.length ? <div className="map-mine-list">{[...mines].sort((a, b) => b.riskScore - a.riskScore).map((mine) => <Link to={`/mines/${mine.id}`} className="map-mine-row" key={mine.id}><span className="map-marker-dot" style={{ background: colorFor(mine.riskLevel) }} /><span><b>{mine.name}</b><small>{mine.district}, {mine.state}</small></span><RiskBadge level={mine.riskLevel} score={mine.riskScore} /></Link>)}</div> : <EmptyState title="No mine locations" description="Add registered mine coordinates to display the map." />}</Card><div className="map-source-note"><MapPin size={15} /><span>Mine markers use registered coordinates. Map tiles are provided by OpenStreetMap.</span></div></aside></div>
  </div>;
}
