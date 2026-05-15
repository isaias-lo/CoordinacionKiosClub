'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardPlus, BarChart3, PackageOpen, Search, Clock, Settings2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { ProfilePill } from '../../components/ProfilePill';
import { supabase } from '../../lib/supabase';
import { entryToRow, rowToEntry } from './utils/converters';
import { TODAS_LAS_TIENDAS } from './data/todasLasTiendas';
import { PICKER_NAMES, PICKERS_LIST, getPickerDisplay } from './data/pickerNames';
import { buscarOperaciones, buscarProducto, getOdooConfig, getPickerOdooStats } from './utils/odooApi';
import type { PickerOdooStats } from './utils/odooApi';
import { sheetsAuditoriaWrite } from './utils/sheetsAuditoria';
import {
  fetchParametros, fetchProduccionMes, fetchProduccionHoy,
  computeMetricas, semaforo, calcMinimo,
  BONO_LABEL, BONO_COLOR, BONO_BG, calcIndiceEquidad,
  todayISO as metricasTodayISO,
  fechaCLtoISO, mesActualISO,
  saveParametros,
} from './utils/metricas';
import type { Parametros, MetricasPicker } from './utils/metricas';
import type {
  TipoAuditoria, CorreccionAuditoria, ResultadoAuditoria,
  TiendaRef, OperacionOdoo, OdooConfig, AuditEntry,
  SubTipo, TipoError, OperacionEntry, ProductoError, ProductoOdoo,
} from './types';

/* ── Constants ── */
const SUBTIPO_LABEL: Record<SubTipo, string> = { comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo' };
const TIPO_TO_SUBTIPOS: Record<TipoAuditoria, SubTipo[]> = {
  comida: ['comida'], hogar: ['hogar'], aseo: ['aseo'],
  'comida-aseo': ['comida', 'aseo'], 'aseo-hogar': ['aseo', 'hogar'],
  completo: ['comida', 'aseo', 'hogar'],
};
const TIPOS: { value: TipoAuditoria; label: string }[] = [
  { value: 'comida', label: 'Comida' }, { value: 'hogar', label: 'Hogar' }, { value: 'aseo', label: 'Aseo' },
  { value: 'completo', label: 'Completo' }, { value: 'comida-aseo', label: 'Com-Aseo' }, { value: 'aseo-hogar', label: 'Aseo-Hogar' },
];
const TIPO_COLOR: Record<TipoAuditoria, string> = {
  comida: 'bg-[rgba(217,119,6,0.10)] border-warn text-warn',
  hogar: 'bg-[rgba(124,58,237,0.10)] border-hogar text-hogar',
  aseo: 'bg-[rgba(8,145,178,0.10)] border-mixto text-mixto',
  completo: 'bg-[rgba(22,163,74,0.10)] border-success text-success',
  'comida-aseo': 'bg-[rgba(211,47,47,0.10)] border-red text-red',
  'aseo-hogar': 'bg-[rgba(37,99,235,0.10)] border-info text-info',
};
const CORR_COLOR: Record<CorreccionAuditoria, string> = {
  correcto: 'bg-[rgba(22,163,74,0.12)] border-success text-success',
  cruce: 'bg-[rgba(37,99,235,0.12)] border-info text-info',
  faltante: 'bg-[rgba(211,47,47,0.12)] border-red text-red',
  sobrante: 'bg-[rgba(217,119,6,0.12)] border-warn text-warn',
};
const CORR_LABEL: Record<CorreccionAuditoria, string> = { correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante' };
const CORR_COLORS: Record<CorreccionAuditoria, string> = { correcto: '#16A34A', faltante: '#D32F2F', sobrante: '#D97706', cruce: '#2563EB' };
const LINE_COLORS = ['#1a2550', '#16A34A', '#D97706', '#2563EB', '#9333EA', '#D32F2F'];
const DRAFT_KEY        = 'audit_form_draft';
const OFFLINE_QUEUE_KEY = 'audit_offline_queue';

interface OfflineQueueItem { row: Record<string, unknown>; userId: string; entryId: string; }

function loadOfflineQueue(): OfflineQueueItem[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveOfflineQueue(q: OfflineQueueItem[]) {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); } catch { /* full */ }
}
async function flushOfflineQueue(onFlushed: (count: number) => void) {
  const q = loadOfflineQueue();
  if (q.length === 0) return;
  const remaining: OfflineQueueItem[] = [];
  let flushed = 0;
  for (const item of q) {
    const { error } = await supabase.from('audit_entries').upsert(item.row as Record<string, unknown>);
    if (error) { remaining.push(item); } else { flushed++; }
  }
  saveOfflineQueue(remaining);
  if (flushed > 0) onFlushed(flushed);
}

/* ── Extended PickerStats ── */
interface PickerStats {
  picker: string;
  total: number;
  bueno: number;
  malo: number;
  pct: number;
  eficiencia: number;
  tieneUnidadData: boolean;
  totalPallets: number;
  totalUnidadesError: number;
  totalUnidadesEsperadas: number;
  faltanteItems: number;
  sobranteItems: number;
  faltanteUnidades: number;
  sobranteUnidades: number;
}
interface WeekTrend { key: string; label: string; pct: number | null }

/* ── Helpers ── */

// Mapea categorías del código de barra picking → TipoAuditoria
function catsToTipo(cats: string): TipoAuditoria {
  const s = new Set(cats.split(',').map(c => c.trim().toLowerCase()));
  const c = s.has('comida'), a = s.has('aseo'), h = s.has('hogar');
  if (c && a && h) return 'completo';
  if (c && a) return 'comida-aseo';
  if (a && h) return 'aseo-hogar';
  if (c) return 'comida';
  if (a) return 'aseo';
  if (h) return 'hogar';
  return 'comida';
}

function calcAuditado(u: number, tipo: TipoError, esp: number) {
  return tipo === 'faltante' ? esp - u : esp + u;
}
function parseEsCL(s: string): Date | null {
  const p = s.split('/'); if (p.length !== 3) return null;
  const [d, m, y] = p.map(Number);
  return new Date(y, m - 1, d);
}
function getWeekKey(dateStr: string): { key: string; label: string } {
  const date = parseEsCL(dateStr); if (!date) return { key: '', label: '' };
  const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(date); mon.setDate(date.getDate() + diff);
  const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
  return { key, label: `${mon.getDate()}/${mon.getMonth() + 1}` };
}

function computeRanking(entries: AuditEntry[]): PickerStats[] {
  const map = new Map<string, PickerStats>();
  for (const e of entries) {
    const p = e.picker?.trim(); if (!p) continue;
    if (!map.has(p)) map.set(p, {
      picker: p, total: 0, bueno: 0, malo: 0, pct: 0, eficiencia: 100,
      tieneUnidadData: false, totalPallets: 0,
      totalUnidadesError: 0, totalUnidadesEsperadas: 0,
      faltanteItems: 0, sobranteItems: 0, faltanteUnidades: 0, sobranteUnidades: 0,
    });
    const s = map.get(p)!;
    s.total++; s.totalPallets += e.pallets;
    if (e.resultado === 'bueno') s.bueno++; else s.malo++;
    for (const prod of e.productos ?? []) {
      s.totalUnidadesError += prod.unidades;
      if (prod.tipo === 'faltante') { s.faltanteItems++; s.faltanteUnidades += prod.unidades; }
      else { s.sobranteItems++; s.sobranteUnidades += prod.unidades; }
      if (prod.cantidadEsperada !== undefined) {
        s.tieneUnidadData = true; s.totalUnidadesEsperadas += prod.cantidadEsperada;
      }
    }
  }
  for (const s of map.values()) {
    s.pct = s.total > 0 ? Math.round((s.bueno / s.total) * 100) : 0;
    s.eficiencia = s.tieneUnidadData && s.totalUnidadesEsperadas > 0
      ? Math.max(0, Math.round(((s.totalUnidadesEsperadas - s.totalUnidadesError) / s.totalUnidadesEsperadas) * 100))
      : s.pct;
  }
  return Array.from(map.values()).sort((a, b) => b.eficiencia - a.eficiencia || b.total - a.total);
}

function computeWeeklyTrend(entries: AuditEntry[], picker: string): WeekTrend[] {
  const wmap = new Map<string, { label: string; b: number; t: number }>();
  for (const e of entries) {
    if (e.picker?.trim() !== picker) continue;
    const { key, label } = getWeekKey(e.fecha); if (!key) continue;
    if (!wmap.has(key)) wmap.set(key, { label, b: 0, t: 0 });
    const w = wmap.get(key)!; w.t++; if (e.resultado === 'bueno') w.b++;
  }
  return Array.from(wmap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
    .map(([key, { label, b, t }]) => ({ key, label, pct: t > 0 ? Math.round((b / t) * 100) : null }));
}

function effColor(v: number) { return v >= 90 ? '#16A34A' : v >= 70 ? '#D97706' : '#D32F2F'; }

function displayPicker(key: string, names: Record<string, string>): string {
  return names[key]?.trim() || key;
}
function matchPickerNames(odooName: string, names: Record<string, string>): string | null {
  if (!odooName) return null;
  const lower = odooName.toLowerCase().trim();
  for (const [key, realName] of Object.entries(names)) {
    if (key.toLowerCase() === lower) return key;
    if (realName && realName.toLowerCase() === lower) return key;
  }
  return null;
}
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase() || '?';
}
function initialsColor(name: string): string {
  const palette = ['#1a2550', '#16A34A', '#D97706', '#2563EB', '#9333EA', '#D32F2F', '#0891B2', '#BE185D'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % palette.length;
  return palette[h];
}

/* ── PDF Export ── */
function exportarPDF(entries: AuditEntry[], fechaLabel: string) {
  const totalBueno = entries.filter(e => e.resultado === 'bueno').length;
  const totalMalo = entries.filter(e => e.resultado === 'malo').length;
  const passPct = entries.length ? Math.round((totalBueno / entries.length) * 100) : 0;
  const filas = entries.map(e => {
    const ops = e.operaciones?.map(op => op.codigo).join(', ') || '—';
    const cc = CORR_COLORS[e.correccion];
    const extras = [
      e.productos?.length ? `<tr><td colspan="9" style="font-size:10px;color:#555;padding:2px 8px 5px;border-bottom:1px solid #eee"><b>Productos:</b> ${e.productos.map(p => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return `[${p.codigo}] ${p.nombre} <span style="color:${p.tipo === 'faltante' ? '#D32F2F' : '#D97706'}">${p.tipo} ${r}</span>`; }).join(' | ')}</td></tr>` : '',
      e.observaciones ? `<tr><td colspan="9" style="font-size:10px;color:#555;font-style:italic;padding:2px 8px 5px;border-bottom:1px solid #eee"><b>Obs:</b> ${e.observaciones}</td></tr>` : '',
    ].join('');
    const reaud = e.reauditoriaDeId ? ' <span style="background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-size:9px">↩ Re</span>' : '';
    return `<tr><td>${e.hora}${reaud}</td><td><b>${e.tiendaNombre}</b></td><td>${e.picker ? getPickerDisplay(e.picker) : '—'}</td><td>${e.auditor}</td><td style="text-transform:capitalize">${e.tipo}</td><td style="text-align:center">${e.pallets}</td><td style="font-family:monospace;font-size:10px">${ops}</td><td style="color:${cc};font-weight:bold">${CORR_LABEL[e.correccion]}</td><td style="text-align:center"><span style="padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;background:${e.resultado === 'bueno' ? 'rgba(22,163,74,0.12)' : 'rgba(211,47,47,0.12)'};color:${e.resultado === 'bueno' ? '#16A34A' : '#D32F2F'}">${e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}</span></td></tr>${extras}`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe ${fechaLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#1a2550;padding:24px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #1a2550;padding-bottom:12px}h1{font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:2px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{padding:10px 20px;border-radius:8px;text-align:center}.stat .n{font-size:24px;font-weight:900}.stat .l{font-size:10px;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1a2550;color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even) td{background:#f9fafb}.footer{margin-top:36px;border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-around;font-size:11px;color:#666}@media print{button{display:none!important}}</style></head>
<body><div class="header"><div><h1>Informe de Auditoría</h1><div style="font-size:11px;color:#888;margin-top:2px">Fecha: <b>${fechaLabel}</b> · Generado: ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div></div>
<button onclick="window.print()" style="padding:8px 18px;background:#1a2550;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold">🖨 Imprimir / PDF</button></div>
<div class="stats"><div class="stat" style="background:#f0f2f7;color:#1a2550"><div class="n">${entries.length}</div><div class="l">Total</div></div><div class="stat" style="background:rgba(22,163,74,0.10);color:#16A34A"><div class="n">${totalBueno}</div><div class="l">Bueno</div></div><div class="stat" style="background:rgba(211,47,47,0.10);color:#D32F2F"><div class="n">${totalMalo}</div><div class="l">Malo</div></div><div class="stat" style="background:rgba(26,37,80,0.08);color:#1a2550"><div class="n">${passPct}%</div><div class="l">Aprobación</div></div></div>
<table><thead><tr><th>Hora</th><th>Tienda</th><th>Picker</th><th>Auditor</th><th>Tipo</th><th>Pallets</th><th>Operaciones</th><th>Corrección</th><th>Resultado</th></tr></thead><tbody>${filas}</tbody></table>
<div class="footer"><div>Firma Auditor: ___________________________</div><div>Firma Supervisor: ___________________________</div></div></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ── Section label ── */
function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-barlow-condensed text-[12px] font-bold uppercase tracking-[0.14em] text-text-3 mb-2 mt-5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">
      {children}
    </div>
  );
}

/* ── Accordion Section (mobile collapsible, always open on desktop) ── */
function AccordionSection({ title, badge, open, onToggle, children }: {
  title: string; badge?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="mb-1 md:mb-0">
      <button
        onClick={onToggle}
        className="md:hidden w-full flex items-center gap-2 mt-4 mb-1 cursor-pointer border-none bg-transparent p-0"
        type="button">
        <div className="font-barlow-condensed text-[12px] font-bold uppercase tracking-[0.14em] text-text-3 flex items-center gap-2">
          {title}
          {badge && <span className="font-normal normal-case text-[10px] text-text-3">{badge}</span>}
        </div>
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-3 text-[14px] font-bold ml-1">{open ? '▲' : '▼'}</span>
      </button>
      <div className="hidden md:block" />
      <div className={`md:block ${open ? 'block' : 'hidden'}`}>
        {children}
      </div>
    </div>
  );
}

/* ── Mini stat cell ── */
function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <div className="font-barlow-condensed font-extrabold text-[22px] leading-tight" style={{ color: color ?? '#1a2550' }}>{value}</div>
      <div className="text-[10px] text-text-3 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

/* ── Metric bar ── */
function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] font-semibold text-text-3 uppercase tracking-wider">{label}</span>
        <span className="text-[13px] font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-3 bg-bg-2 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
      </div>
    </div>
  );
}

/* ── Sparkline ── */
function Sparkline({ points, color }: { points: (number | null)[]; color: string }) {
  const W = 64, H = 24, pad = 3;
  const valid = points.filter((p): p is number => p !== null);
  if (valid.length < 2) return null;
  const step = (W - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => p !== null ? { x: pad + i * step, y: pad + (1 - p / 100) * (H - pad * 2) } : null);
  const d = coords.reduce<string>((acc, pt, i) => {
    if (!pt) return acc;
    const prev = coords.slice(0, i).reverse().find(Boolean);
    return acc + (prev ? `L${pt.x},${pt.y}` : `M${pt.x},${pt.y}`);
  }, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
      {coords.map((pt, i) => pt && <circle key={i} cx={pt.x} cy={pt.y} r="2" fill={color} />)}
    </svg>
  );
}

/* ── Line Chart ── */
function LineChart({ trends, selectedPickers }: { trends: Map<string, WeekTrend[]>; selectedPickers: string[] }) {
  const W = 320, H = 160, pL = 36, pB = 22, pR = 12, pT = 10;
  const allWeeks = useMemo(() => { const keys = new Set<string>(); trends.forEach(pts => pts.forEach(p => keys.add(p.key))); return Array.from(keys).sort(); }, [trends]);
  if (allWeeks.length === 0) return <div className="text-center py-8 text-text-3 text-[12px]">Sin datos suficientes para mostrar tendencia.</div>;
  const plotW = W - pL - pR; const plotH = H - pT - pB;
  const xStep = allWeeks.length > 1 ? plotW / (allWeeks.length - 1) : 0;
  const xOf = (i: number) => pL + i * xStep;
  const yOf = (pct: number) => pT + plotH - (pct / 100) * plotH;
  const weekLabels = allWeeks.map(k => { for (const pts of trends.values()) { const f = pts.find(p => p.key === k); if (f) return f.label; } return k.slice(5); });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
      {[0, 25, 50, 75, 100].map(y => (
        <g key={y}><line x1={pL} y1={yOf(y)} x2={W - pR} y2={yOf(y)} stroke="#e5e7eb" strokeWidth={y === 0 || y === 100 ? 1.5 : 0.8} /><text x={pL - 4} y={yOf(y) + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{y}%</text></g>
      ))}
      {weekLabels.map((lbl, i) => <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{lbl}</text>)}
      {selectedPickers.map((picker, ci) => {
        const pts = trends.get(picker); if (!pts) return null;
        const color = LINE_COLORS[ci % LINE_COLORS.length];
        let path = '';
        allWeeks.forEach((wk, i) => { const pt = pts.find(p => p.key === wk); if (pt?.pct !== null && pt?.pct !== undefined) path += path ? ` L${xOf(i)},${yOf(pt.pct)}` : `M${xOf(i)},${yOf(pt.pct)}`; });
        return (
          <g key={picker}>
            {path && <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
            {allWeeks.map((wk, i) => { const pt = pts.find(p => p.key === wk); if (pt?.pct === null || pt?.pct === undefined) return null; return <g key={wk}><circle cx={xOf(i)} cy={yOf(pt.pct)} r="4.5" fill={color} opacity="0.15" /><circle cx={xOf(i)} cy={yOf(pt.pct)} r="3" fill={color} /><circle cx={xOf(i)} cy={yOf(pt.pct)} r="1.5" fill="white" /><text x={xOf(i)} y={yOf(pt.pct) - 7} textAnchor="middle" fontSize="9" fill={color} fontWeight="bold">{pt.pct}%</text></g>; })}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Operacion Input ── */
interface OpSearch { loading: boolean; results: OperacionOdoo[]; open: boolean; error: string }
function OperacionInput({ subTipo, codigo, onChange, onSelect, odooConfig, onNeedConfig }: {
  subTipo: SubTipo; codigo: string; onChange: (v: string) => void;
  onSelect?: (codigo: string, responsable: string | undefined) => void;
  odooConfig: OdooConfig; onNeedConfig: () => void;
}) {
  const [s, setS] = useState<OpSearch>({ loading: false, results: [], open: false, error: '' });
  const buscar = async () => {
    if (!odooConfig.url) { onNeedConfig(); return; }
    setS({ loading: true, results: [], open: false, error: '' });
    try { const ops = await buscarOperaciones(odooConfig, codigo); setS({ loading: false, results: ops, open: ops.length > 0, error: ops.length ? '' : 'Sin resultados' }); }
    catch (e) { setS({ loading: false, results: [], open: false, error: e instanceof Error ? e.message : 'Error' }); }
  };
  const select = (op: OperacionOdoo) => { onChange(op.name); onSelect?.(op.name, op.responsable); setS({ loading: false, results: [], open: false, error: '' }); };
  return (
    <div className="mb-2.5">
      <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-1.5">Op. {SUBTIPO_LABEL[subTipo]}</div>
      <div className="flex gap-2">
        <input type="text" value={codigo} onChange={e => { onChange(e.target.value.toUpperCase()); setS(p => ({ ...p, open: false })); }} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="WH/OUT/00000"
          className="flex-1 bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 font-mono text-[14px] outline-none focus:border-navy uppercase placeholder:normal-case placeholder:font-barlow placeholder:text-text-3 [-webkit-appearance:none]" />
        <button onClick={buscar} disabled={s.loading} className="px-3 py-2.5 bg-navy text-white border-none rounded-btn font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center w-12" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.25)' }}>
          {s.loading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🔍'}
        </button>
      </div>
      {s.error && <div className="mt-1 text-[11px] text-red">{s.error}</div>}
      {s.open && s.results.length > 0 && (
        <div className="mt-1 bg-white border border-border rounded-card shadow-xl overflow-hidden z-10 relative">
          {s.results.map(op => (
            <div key={op.id} onClick={() => select(op)} className="px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 hover:bg-bg flex items-center gap-3 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[12px] font-bold text-navy">{op.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-text-3 truncate">{op.partner}</span>
                  {op.responsable && <span className="text-[10px] font-bold text-info bg-[rgba(37,99,235,0.08)] px-1.5 py-0.5 rounded flex-shrink-0">{getPickerDisplay(op.responsable)}</span>}
                </div>
              </div>
              <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${op.state === 'Listo' ? 'bg-[rgba(22,163,74,0.10)] text-success' : op.state === 'Hecho' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{op.state}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Barcode Scanner para autocompletar operación (pistola lectora) ── */
function BarcodeInputScanner({ onScan }: { onScan: (raw: string) => boolean }) {
  const [value, setValue]       = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // La pistola emite los caracteres del código muy rápido y luego un Enter automático
  const tryParse = (raw: string) => {
    const ok = onScan(raw.trim());
    setFeedback(ok
      ? { ok: true,  msg: '✓ Tienda, picker y contenido asignados' }
      : { ok: false, msg: '✗ Código no reconocido' }
    );
    setValue('');
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="mb-3 rounded-card overflow-hidden border-[1.5px]"
      style={{ borderColor: 'rgba(37,99,235,0.30)', background: 'rgba(37,99,235,0.03)' }}>
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
        <span style={{ fontSize: 15 }}>📷</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Pistola lectora — apunta al código del pallet
        </span>
      </div>
      <div className="px-3 pb-2.5">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) tryParse(value); }}
          placeholder="Listo para escanear…"
          className="w-full bg-white border-[1.5px] rounded-btn px-3 py-2.5 font-mono text-[14px] outline-none"
          style={{ borderColor: feedback?.ok ? '#16A34A' : feedback ? '#D32F2F' : 'rgba(37,99,235,0.40)', boxShadow: '0 1px 4px rgba(26,37,80,0.08)' }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {feedback ? (
          <div className="mt-1 text-[12px] font-semibold" style={{ color: feedback.ok ? '#16A34A' : '#D32F2F' }}>
            {feedback.msg}
          </div>
        ) : (
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(37,99,235,0.55)' }}>
            Asigna tienda, picker y contenido automáticamente
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Product Search ── */
function ProductSearch({ odooConfig, tiposError, operacionCodes, onAdd, onNeedConfig }: {
  odooConfig: OdooConfig; tiposError: TipoError[]; operacionCodes: string[];
  onAdd: (p: ProductoError) => void; onNeedConfig: () => void;
}) {
  const hasOdoo = !!odooConfig.url;
  const [manualMode, setManualMode] = useState(!hasOdoo);
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<ProductoOdoo | null>(null);
  const [error, setError] = useState('');
  const [unidades, setUnidades] = useState('');
  const [tipoProd, setTipoProd] = useState<TipoError>(tiposError[0] ?? 'faltante');
  const [manualNombre, setManualNombre] = useState('');
  const [selectedOp, setSelectedOp] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tiposError.includes(tipoProd)) setTipoProd(tiposError[0] ?? 'faltante'); }, [tiposError]);
  const cleanCodigo = (raw: string) => {
    const stripped = raw.replace(/[\[\]]/g, '').trim().toUpperCase();
    return stripped;
  };
  const buscar = async () => {
    if (!odooConfig.url) { onNeedConfig(); return; }
    const cod = cleanCodigo(codigo); if (!cod) return;
    setLoading(true); setError(''); setFound(null);
    try {
      const ops = selectedOp ? [selectedOp] : operacionCodes.filter(Boolean);
      const prod = await buscarProducto(odooConfig, cod, ops);
      if (prod) setFound(prod);
      else setError(`"${cod}" no encontrado`);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); } finally { setLoading(false); }
  };
  const confirmar = () => {
    if (!found || !unidades || parseInt(unidades) <= 0) return;
    onAdd({ codigo: found.codigo, nombre: found.nombre, unidades: parseInt(unidades), tipo: tipoProd, cantidadEsperada: found.cantidadEsperada, operacionCod: selectedOp || undefined });
    setCodigo(''); setFound(null); setUnidades(''); setError('');
  };
  const confirmarManual = () => {
    const cod = cleanCodigo(codigo);
    if (!cod || !unidades || parseInt(unidades) <= 0) return;
    onAdd({ codigo: cod, nombre: manualNombre.trim() || cod, unidades: parseInt(unidades), tipo: tipoProd, operacionCod: selectedOp || undefined });
    setCodigo(''); setManualNombre(''); setUnidades('');
  };
  const ratioPreview = useMemo(() => {
    if (!found?.cantidadEsperada || !unidades || isNaN(parseInt(unidades))) return null;
    const u = parseInt(unidades); if (u <= 0) return null;
    return { auditado: calcAuditado(u, tipoProd, found.cantidadEsperada), esperado: found.cantidadEsperada, delta: tipoProd === 'faltante' ? -u : +u };
  }, [found, unidades, tipoProd]);
  return (
    <div className="border border-dashed border-navy/20 rounded-card p-3 bg-bg">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide flex-1">Agregar producto</div>
        {hasOdoo && (
          <div className="flex gap-1">
            <button onClick={() => { setManualMode(false); setError(''); setFound(null); }} className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${!manualMode ? 'bg-navy text-white border-navy' : 'bg-white text-text-3 border-border'}`}>Odoo</button>
            <button onClick={() => { setManualMode(true); setFound(null); setError(''); }} className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${manualMode ? 'bg-navy text-white border-navy' : 'bg-white text-text-3 border-border'}`}>Manual</button>
          </div>
        )}
      </div>
      {operacionCodes.filter(Boolean).length > 1 && (
        <div className="mb-2">
          <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1">Operación de origen</div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setSelectedOp('')} className={`px-2 py-1 rounded-btn text-[10px] font-bold border cursor-pointer ${!selectedOp ? 'bg-navy text-white border-navy' : 'bg-white text-text-3 border-border'}`}>Todas</button>
            {operacionCodes.filter(Boolean).map(op => (
              <button key={op} onClick={() => setSelectedOp(op === selectedOp ? '' : op)} className={`px-2 py-1 rounded-btn text-[10px] font-bold font-mono border cursor-pointer ${selectedOp === op ? 'bg-info text-white border-info' : 'bg-white text-text-2 border-border'}`}>{op}</button>
            ))}
          </div>
        </div>
      )}
      {manualMode ? (
        <div className="flex flex-col gap-2">
          <input type="text" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código (con o sin corchetes, o últimos 6 dígitos)"
            className="bg-white border-[1.5px] border-border rounded-btn px-3 py-2 font-mono text-[13px] outline-none focus:border-navy [-webkit-appearance:none]" />
          <input type="text" value={manualNombre} onChange={e => setManualNombre(e.target.value)} placeholder="Nombre (opcional)"
            className="bg-white border-[1.5px] border-border rounded-btn px-3 py-2 font-barlow text-[13px] outline-none focus:border-navy [-webkit-appearance:none]" />
          <div className="flex gap-2 items-center">
            {tiposError.length > 1 && <div className="flex gap-1 flex-shrink-0">{tiposError.map(t => <button key={t} onClick={() => setTipoProd(t)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-btn border cursor-pointer ${tipoProd === t ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}>{t === 'faltante' ? '↓' : '↑'}</button>)}</div>}
            <input type="number" inputMode="numeric" min="1" value={unidades} onChange={e => setUnidades(e.target.value)} placeholder="Unidades"
              className="flex-1 bg-white border-[1.5px] border-border rounded-btn px-2 py-1.5 text-center font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
            <button onClick={confirmarManual} disabled={!codigo.trim() || !unidades || parseInt(unidades) <= 0} className="py-1.5 px-3 bg-success text-white border-none rounded-btn text-[12px] font-bold cursor-pointer disabled:opacity-40 flex-shrink-0">+ Add</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input type="text" value={codigo} onChange={e => { setCodigo(e.target.value); setFound(null); setError(''); }} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="[NLAVINF031] o VINF031"
              className="flex-1 bg-white border-[1.5px] border-border rounded-btn px-3 py-2 font-mono text-[13px] outline-none focus:border-navy [-webkit-appearance:none]" />
            <button onClick={buscar} disabled={loading || !codigo.trim()} className="px-3 py-2 bg-navy text-white border-none rounded-btn font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center w-12">
              {loading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '🔍'}
            </button>
          </div>
          {error && <div className="mt-1.5 text-[11px] text-red">{error}</div>}
          {found && (
            <div className="mt-2">
              <div className="bg-white border border-success/30 rounded-btn px-3 py-2 mb-2.5 flex items-center justify-between">
                <div><div className="font-mono text-[10px] text-text-3">[{found.codigo}]</div><div className="text-[13px] font-semibold text-text">{found.nombre}</div></div>
                {found.cantidadEsperada !== undefined && <div className="text-right ml-3 flex-shrink-0"><div className="text-[10px] text-text-3 uppercase">Esperado</div><div className="font-barlow-condensed text-[22px] font-bold text-navy leading-tight">{found.cantidadEsperada}</div></div>}
              </div>
              <div className="flex gap-2 items-center">
                {tiposError.length > 1 && <div className="flex gap-1 flex-shrink-0">{tiposError.map(t => <button key={t} onClick={() => setTipoProd(t)} className={`px-2.5 py-1.5 text-[11px] font-bold rounded-btn border cursor-pointer ${tipoProd === t ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}>{t === 'faltante' ? '↓ Falt.' : '↑ Sobr.'}</button>)}</div>}
                <div className="flex-1">
                  <input type="number" inputMode="numeric" min="1" value={unidades} onChange={e => setUnidades(e.target.value)} placeholder="Error qty"
                    className="w-full bg-white border-[1.5px] border-border rounded-btn px-2 py-1.5 text-center font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
                  {ratioPreview && <div className={`text-center mt-1 font-barlow-condensed font-bold text-[15px] ${tipoProd === 'faltante' ? 'text-red' : 'text-warn'}`}>{ratioPreview.auditado}/{ratioPreview.esperado} <span className="text-[12px] opacity-70">({ratioPreview.delta > 0 ? '+' : ''}{ratioPreview.delta})</span></div>}
                </div>
                <button onClick={confirmar} disabled={!unidades || parseInt(unidades) <= 0} className="py-1.5 px-3 bg-success text-white border-none rounded-btn text-[12px] font-bold cursor-pointer disabled:opacity-40 flex-shrink-0">+ Add</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Auditor Selector (searchable dropdown from configured list) ── */
function AuditorSelector({ auditor, auditorList, onChange }: {
  auditor: string; auditorList: string[]; onChange: (a: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = auditorList.filter(n => !query || n.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
        className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 flex items-center justify-between cursor-pointer transition-all ${open ? 'border-navy shadow-[0_0_0_3px_rgba(26,37,80,0.08)]' : 'border-border'}`}
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
        {auditor
          ? <span className="font-semibold text-text text-[15px]">{auditor}</span>
          : <span className="text-text-3 font-barlow text-[15px]">{auditorList.length === 0 ? 'Sin auditores configurados…' : 'Seleccionar auditor…'}</span>}
        <span className="text-text-3 ml-2 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-border rounded-card mt-1 shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar auditor…" className="w-full bg-bg border border-border rounded-btn px-3 py-2 text-text font-barlow text-[14px] outline-none focus:border-navy" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && <div className="py-5 text-center text-text-3 text-[13px]">{auditorList.length === 0 ? 'Configura auditores en ⚙ Configuración' : 'Sin resultados'}</div>}
            {filtered.map(name => (
              <div key={name} onClick={() => { onChange(name); setOpen(false); setQuery(''); }}
                className={`px-4 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 font-barlow text-[14px] ${auditor === name ? 'bg-[rgba(26,37,80,0.06)] text-navy font-semibold' : 'text-text hover:bg-bg'}`}>
                {name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Picker Odoo Display (read-only — Odoo assigns the pistola automatically) ── */
function PickerOdooDisplay({ picker, odooDetected, onClear }: {
  picker: string; odooDetected?: boolean; onClear: () => void;
}) {
  if (!picker) {
    return (
      <div className="w-full bg-bg border border-dashed border-border rounded-btn px-3 py-3 flex items-center gap-2"
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
        <span className="text-text-3 text-[18px] leading-none">🔄</span>
        <span className="text-text-3 font-barlow text-[14px]">Asignado automáticamente al cargar la operación Odoo</span>
      </div>
    );
  }
  return (
    <div className="w-full bg-white border border-border rounded-btn px-3 py-3 flex items-center gap-3"
      style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
      <span className="font-mono text-[13px] font-bold text-navy bg-[rgba(26,37,80,0.07)] px-2.5 py-1 rounded">
        {picker.replace('Pickers ', 'P.')}
      </span>
      {odooDetected && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info border border-info/20">
          Odoo ✓
        </span>
      )}
      <span className="flex-1 text-[13px] text-text-2">{picker}</span>
      <button onClick={onClear}
        className="border-none bg-transparent text-text-3 hover:text-red cursor-pointer text-[16px] leading-none px-1 transition-colors"
        title="Limpiar">×</button>
    </div>
  );
}

/* ── Picker Nombre Selector (dropdown of real names for the actual armador de pallet) ── */
function PickerNombreSelector({ pickerNombre, pickerNombresList, onChange }: {
  pickerNombre: string; pickerNombresList: string[]; onChange: (n: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const uniqueNames = Array.from(new Set(pickerNombresList.map(n => n.trim()).filter(Boolean))).sort();
  const filtered = uniqueNames.filter(n => !query || n.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(o => !o)}
        className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 flex items-center justify-between cursor-pointer transition-all ${open ? 'border-navy shadow-[0_0_0_3px_rgba(26,37,80,0.08)]' : 'border-border'}`}
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
        {pickerNombre
          ? <span className="font-semibold text-text text-[15px]">{pickerNombre}</span>
          : <span className="text-text-3 font-barlow text-[15px]">{uniqueNames.length === 0 ? 'Sin pickers configurados…' : 'Seleccionar picker…'}</span>}
        <span className="text-text-3 ml-2 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-border rounded-card mt-1 shadow-2xl overflow-hidden">
          {uniqueNames.length > 4 && (
            <div className="p-2 border-b border-border">
              <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar picker…" className="w-full bg-bg border border-border rounded-btn px-3 py-2 text-text font-barlow text-[14px] outline-none focus:border-navy" />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {pickerNombre && (
              <div onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
                className="px-4 py-2 cursor-pointer border-b border-border/40 text-text-3 text-[12px] italic hover:bg-bg">
                — Sin picker
              </div>
            )}
            {filtered.length === 0 && <div className="py-5 text-center text-text-3 text-[13px]">{uniqueNames.length === 0 ? 'Configura pickers en ⚙ Configuración' : 'Sin resultados'}</div>}
            {filtered.map(name => (
              <div key={name} onClick={() => { onChange(name); setOpen(false); setQuery(''); }}
                className={`px-4 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 font-barlow text-[14px] ${pickerNombre === name ? 'bg-[rgba(26,37,80,0.06)] text-navy font-semibold' : 'text-text hover:bg-bg'}`}>
                {name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Picker Card (improved ranking card) ── */
function PickerCard({ stats, rank, trend, odooConfig, compact = false, pickerNames, metrica }: {
  stats: PickerStats; rank: number; trend: WeekTrend[];
  odooConfig: OdooConfig; compact?: boolean; pickerNames: Record<string, string>;
  metrica?: MetricasPicker;
}) {
  const [odooStats, setOdooStats] = useState<PickerOdooStats | null>(null);
  const [loadingOdoo, setLoadingOdoo] = useState(false);
  const [odooError, setOdooError] = useState('');

  const ec = effColor(stats.eficiencia);
  const pc = effColor(stats.pct);
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const realName = pickerNames[stats.picker]?.trim() || '';
  const showDualBar = stats.eficiencia !== stats.pct;

  const fetchOdoo = async () => {
    if (!odooConfig.url) return;
    setLoadingOdoo(true); setOdooError('');
    try { const s = await getPickerOdooStats(odooConfig, stats.picker); setOdooStats(s); if (!s) setOdooError('No encontrado en Odoo'); }
    catch (e) { setOdooError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoadingOdoo(false); }
  };

  return (
    <div className="bg-white border border-border rounded-card mb-3 overflow-hidden"
      style={{ boxShadow: rank <= 3 ? '0 4px 20px rgba(26,37,80,0.12)' : '0 2px 8px rgba(26,37,80,0.06)', borderColor: rank === 1 ? `${ec}40` : undefined }}>
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${ec}50, ${ec})` }} />
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{ background: initialsColor(realName || stats.picker) }}>
            <span className="font-barlow-condensed font-bold text-[16px] text-white leading-none">
              {getInitials(realName || stats.picker)}
            </span>
            {medal && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[14px] leading-none">{medal}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-barlow-condensed text-[18px] font-bold text-navy leading-tight">{realName || stats.picker}</div>
              {metrica && (
                <span style={{ padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: BONO_BG[metrica.estado_bono], color: BONO_COLOR[metrica.estado_bono] }}>
                  {BONO_LABEL[metrica.estado_bono]}
                </span>
              )}
            </div>
            {realName && <div className="text-[11px] text-text-3">{stats.picker}</div>}
            <div className="text-[12px] text-text-3 mt-0.5">{stats.bueno} buenos · {stats.malo} malos · {stats.total} total · {stats.totalPallets} pal.</div>
            {metrica && metrica.auditados_mes > 0 && (
              <div className="text-[11px] text-text-3 mt-0.5">Mes: {metrica.auditados_mes} aud. · déficit: {metrica.deficit > 0 ? <span style={{ color: '#D32F2F', fontWeight: 700 }}>{metrica.deficit}</span> : <span style={{ color: '#16A34A' }}>✓</span>}</div>
            )}
          </div>
          {/* Big % */}
          <div className="text-right flex-shrink-0">
            <div className="font-barlow-condensed font-black leading-none" style={{ fontSize: compact ? 40 : 48, color: ec }}>{stats.eficiencia}%</div>
            <div className="text-[10px] text-text-3 uppercase tracking-wide">eficiencia</div>
            {trend.length >= 2 && <div className="mt-1 flex justify-end"><Sparkline points={trend.map(t => t.pct)} color={ec} /></div>}
          </div>
        </div>

        {/* Metric bars */}
        <div className="space-y-2.5 mb-4">
          <MetricBar label={stats.tieneUnidadData ? 'Eficiencia de unidades' : 'Aprobación auditorías'} value={stats.eficiencia} color={ec} />
          {showDualBar && <MetricBar label="Aprobación auditorías" value={stats.pct} color={pc} />}
        </div>

        {/* Stats grid */}
        {!compact && (
          <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-border/50 mb-3">
            <MiniStat label="Auditorías" value={stats.total} />
            <MiniStat label="Pallets" value={stats.totalPallets} />
            <MiniStat label="Unid. error" value={stats.totalUnidadesError} color={stats.totalUnidadesError > 0 ? '#D32F2F' : '#16A34A'} />
          </div>
        )}

        {/* Error breakdown */}
        {!compact && (stats.faltanteUnidades > 0 || stats.sobranteUnidades > 0) && (
          <div className="flex gap-3 mb-3 flex-wrap">
            {stats.faltanteUnidades > 0 && (
              <div className="flex items-center gap-1.5 bg-[rgba(211,47,47,0.06)] border border-red/20 rounded-btn px-2.5 py-1.5">
                <span className="text-[14px]">↓</span>
                <div><div className="text-[13px] font-bold text-red">{stats.faltanteUnidades} u. faltante</div><div className="text-[10px] text-text-3">{stats.faltanteItems} producto{stats.faltanteItems !== 1 ? 's' : ''}</div></div>
              </div>
            )}
            {stats.sobranteUnidades > 0 && (
              <div className="flex items-center gap-1.5 bg-[rgba(217,119,6,0.06)] border border-warn/20 rounded-btn px-2.5 py-1.5">
                <span className="text-[14px]">↑</span>
                <div><div className="text-[13px] font-bold text-warn">{stats.sobranteUnidades} u. sobrante</div><div className="text-[10px] text-text-3">{stats.sobranteItems} producto{stats.sobranteItems !== 1 ? 's' : ''}</div></div>
              </div>
            )}
          </div>
        )}

        {stats.tieneUnidadData && !compact && (
          <div className="text-[11px] text-text-3 italic mb-3">
            {stats.totalUnidadesError} unidades con error de {stats.totalUnidadesEsperadas} esperadas ({(100 - stats.eficiencia).toFixed(1)}% tasa de error)
          </div>
        )}

        {/* Odoo stats section */}
        {!compact && (
          <div className="border-t border-border/40 pt-3">
            {!odooStats && !loadingOdoo && (
              <button onClick={fetchOdoo} disabled={!odooConfig.url} className="text-[11px] font-bold text-info border border-info/30 bg-[rgba(37,99,235,0.04)] rounded-btn px-3 py-1.5 cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
                🔗 Ver stats Odoo (90 días)
              </button>
            )}
            {loadingOdoo && <div className="flex items-center gap-2 text-[11px] text-text-3"><div className="w-3 h-3 border border-navy/30 border-t-navy rounded-full animate-spin" />Consultando Odoo…</div>}
            {odooError && <div className="text-[11px] text-text-3 italic">{odooError}</div>}
            {odooStats && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Completados (90d)', value: odooStats.totalDone, color: '#16A34A' },
                  { label: 'Esta semana', value: odooStats.doneThisWeek, color: '#2563EB' },
                  { label: 'En proceso', value: odooStats.totalAssigned, color: '#D97706' },
                  { label: 'Discrepancias', value: odooStats.discrepancias, color: odooStats.discrepancias > 0 ? '#D32F2F' : '#16A34A' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center bg-bg rounded-btn p-2">
                    <div className="font-barlow-condensed text-[20px] font-bold" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-text-3 uppercase tracking-wide">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════ SHARED VIEW CONTENT ════ */

type DashPeriod = 'hoy' | 'semana' | 'mes' | 'total';
const PERIOD_LABELS: Record<DashPeriod, string> = { hoy: 'Hoy', semana: '7 días', mes: '30 días', total: 'Total' };

/* ── Dashboard Content ── */
function DashboardContent({ history, today, pickerNames }: { history: AuditEntry[]; today: string; pickerNames: Record<string, string> }) {
  const [period, setPeriod] = useState<DashPeriod>('hoy');
  const [params, setParams] = useState<Parametros | null>(null);
  const [resumen, setResumen] = useState<ReturnType<typeof computeMetricas> | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Cargar parámetros y producción al montar o cambiar period
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingMetrics(true);
      const [p, prodMes, prodHoy] = await Promise.all([
        fetchParametros(),
        fetchProduccionMes(new Date()),
        fetchProduccionHoy(),
      ]);
      if (cancelled) return;
      setParams(p);
      const todayIso = metricasTodayISO();
      setResumen(computeMetricas(history, prodMes, prodHoy, p, todayIso));
      setLoadingMetrics(false);
    }
    load();
    return () => { cancelled = true; };
  }, [history]);

  const entries = useMemo(() => {
    if (period === 'hoy') return history.filter(e => e.fecha === today);
    if (period === 'total') return history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (period === 'semana' ? 7 : 30));
    return history.filter(e => { const d = parseEsCL(e.fecha); return d !== null && d >= cutoff; });
  }, [history, period, today]);

  // Entradas del mes actual
  const entriesMes = useMemo(() => {
    const { from, to } = mesActualISO();
    return history.filter(e => { const iso = fechaCLtoISO(e.fecha); return iso >= from && iso <= to; });
  }, [history]);

  const buenosH = entries.filter(e => e.resultado === 'bueno').length;
  const pct = entries.length ? Math.round((buenosH / entries.length) * 100) : 0;
  const palletsH = entries.reduce((s, e) => s + e.pallets, 0);
  const erroresH = entries.filter(e => e.tieneErrores).length;

  const tiendaErrMap = new Map<string, number>();
  entries.forEach(e => { if (e.resultado === 'malo') tiendaErrMap.set(e.tiendaNombre, (tiendaErrMap.get(e.tiendaNombre) ?? 0) + 1); });
  const topErrTiendas = Array.from(tiendaErrMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const corrBreak = { correcto: 0, faltante: 0, sobrante: 0, cruce: 0 } as Record<CorreccionAuditoria, number>;
  entries.forEach(e => corrBreak[e.correccion]++);

  const periodSelector = (
    <div className="flex gap-1 mb-3">
      {(Object.keys(PERIOD_LABELS) as DashPeriod[]).map(p => (
        <button key={p} onClick={() => setPeriod(p)}
          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all border-none"
          style={period === p ? { background: '#1a2550', color: '#fff' } : { background: 'rgba(26,37,80,0.07)', color: '#6B7280' }}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );

  /* ── Vista HOY ── */
  if (period === 'hoy') {
    const minimo = params?.minimo_auditorias ?? 73;
    return (
      <div className="p-4 space-y-3">
        {periodSelector}

        {/* Cobertura global del día */}
        {resumen && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Producidos', value: resumen.total_producidos, color: '#1a2550' },
              { label: 'Auditados', value: resumen.total_auditados, color: '#2563EB' },
              { label: 'Cobertura', value: resumen.total_producidos > 0 ? `${resumen.cobertura_global}%` : '—', color: resumen.cobertura_global >= (params?.cobertura_diaria_meta ?? 30) ? '#16A34A' : '#D97706' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-card p-3 text-center border border-border" style={{ background: 'rgba(26,37,80,0.04)', boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                <div className="font-barlow-condensed text-[28px] font-extrabold leading-tight" style={{ color }}>{value}</div>
                <div className="text-[10px] text-text-3 uppercase tracking-wide mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de prioridad */}
        {loadingMetrics ? (
          <div className="text-center py-6 text-text-3 text-[12px]">Cargando métricas…</div>
        ) : resumen && resumen.pickers.length > 0 ? (
          <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <span className="text-[15px]">🎯</span>
              <span className="font-barlow-condensed text-[15px] font-bold text-navy">Prioridad de auditoría hoy</span>
            </div>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(26,37,80,0.04)' }}>
                    {['Picker', 'Prod.hoy', 'Audit.hoy', 'Cuota', 'Mes', 'Faltan', 'Hoy'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumen.pickers.map((m, i) => {
                    const s = semaforo(m);
                    const dot = s === 'rojo' ? '#D32F2F' : s === 'amarillo' ? '#D97706' : '#16A34A';
                    return (
                      <tr key={m.picker_nombre} style={{ borderBottom: i < resumen.pickers.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1a2550' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 12 }}>{m.picker_nombre}</span>
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.producidos_hoy || '—'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.auditados_hoy || '—'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.producidos_hoy > 0 ? m.cuota_hoy : '—'}</td>
                        <td style={{ padding: '6px 8px', color: '#374151' }}>{m.auditados_mes}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: m.deficit > 0 ? '#D32F2F' : '#16A34A' }}>{m.deficit > 0 ? m.deficit : '✓'}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                          {m.necesarios_hoy > 0
                            ? <span style={{ background: s === 'rojo' ? 'rgba(211,47,47,0.10)' : 'rgba(217,119,6,0.10)', color: dot, padding: '2px 7px', borderRadius: 6, fontSize: 11 }}>{m.necesarios_hoy}</span>
                            : <span style={{ color: '#16A34A' }}>✓</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 flex gap-4 border-t border-border text-[10px] text-text-3">
              <span><span style={{ color: '#16A34A' }}>●</span> Cumplió mínimo</span>
              <span><span style={{ color: '#D97706' }}>●</span> Pendiente</span>
              <span><span style={{ color: '#D32F2F' }}>●</span> Urgente (después 15:00)</span>
              <span>Mínimo mensual: <strong>{minimo}</strong> pallets</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-text-3 text-[12px]">Sin datos de producción para hoy. Registra producción en la sección correspondiente.</div>
        )}

        {/* KPI rápidos de auditorías de hoy */}
        {entries.length > 0 && (
          <>
            <div className="text-[11px] text-text-3 text-center">{entries.length} auditorías registradas hoy</div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: '% Aprobación', value: `${pct}%`, color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F', bg: pct >= 80 ? 'rgba(22,163,74,0.08)' : pct >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(211,47,47,0.08)' },
                { label: 'Con errores', value: erroresH, color: erroresH > 0 ? '#D32F2F' : '#16A34A', bg: erroresH > 0 ? 'rgba(211,47,47,0.07)' : 'rgba(22,163,74,0.07)' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className="rounded-card p-3.5 text-center border border-border" style={{ background: bg, boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                  <div className="font-barlow-condensed text-[34px] font-extrabold leading-tight" style={{ color }}>{value}</div>
                  <div className="text-[11px] text-text-3 uppercase tracking-wide mt-1">{label}</div>
                </div>
              ))}
            </div>
            {/* Recent audits */}
            <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Últimas auditorías</div>
              {entries.slice(0, 6).map(e => (
                <div key={e.id} className="flex items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.resultado === 'bueno' ? 'bg-success' : 'bg-red'}`} />
                  <span className="text-[12px] text-text-2 flex-shrink-0 w-10">{e.hora}</span>
                  <span className="text-[13px] font-medium text-text flex-1 truncate">{e.tiendaNombre}</span>
                  {e.picker && <span className="text-[11px] text-text-3 flex-shrink-0">{displayPicker(e.picker, pickerNames)}</span>}
                  <span className={`font-barlow-condensed text-[13px] font-bold flex-shrink-0 ${e.resultado === 'bueno' ? 'text-success' : 'text-red'}`}>{e.resultado === 'bueno' ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── Vista TOTAL (mes actual) ── */
  if (period === 'total') {
    const minimo = params?.minimo_auditorias ?? 73;
    const indiceEquidad = resumen ? calcIndiceEquidad(resumen.pickers) : null;

    return (
      <div className="p-4 space-y-3">
        {periodSelector}

        {/* Resumen mensual por picker */}
        {loadingMetrics ? (
          <div className="text-center py-6 text-text-3 text-[12px]">Cargando métricas del mes…</div>
        ) : resumen && resumen.pickers.length > 0 ? (
          <>
            <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[15px]">📅</span>
                  <span className="font-barlow-condensed text-[15px] font-bold text-navy">Resumen mensual · mes actual</span>
                </div>
                <span className="text-[11px] text-text-3">Mínimo: {minimo} pallets</span>
              </div>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(26,37,80,0.04)' }}>
                      {['Picker', 'Auditados', 'Cobertura', 'Efectividad', 'Estado bono'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6B7280', letterSpacing: '0.05em', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.pickers.map((m, i) => (
                      <tr key={m.picker_nombre} style={{ borderBottom: i < resumen.pickers.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                        <td style={{ padding: '7px 8px', fontWeight: 600, color: '#1a2550', fontSize: 12 }}>{m.picker_nombre}</td>
                        <td style={{ padding: '7px 8px', color: '#374151' }}>
                          <span style={{ fontWeight: 700 }}>{m.auditados_mes}</span>
                          <span style={{ color: '#9CA3AF', fontSize: 10, marginLeft: 2 }}>/{minimo}</span>
                        </td>
                        <td style={{ padding: '7px 8px', color: m.cobertura_picker_mes !== null ? '#374151' : '#9CA3AF' }}>
                          {m.cobertura_picker_mes !== null ? `${m.cobertura_picker_mes}%` : '—'}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          {m.efectividad_pct !== null && m.auditados_mes >= 20
                            ? <span style={{ fontWeight: 700, color: m.efectividad_pct >= (params?.umbral_bono_pct ?? 95) ? '#16A34A' : '#D32F2F' }}>{m.efectividad_pct}%</span>
                            : <span style={{ color: '#9CA3AF', fontSize: 11 }}>Insuf.</span>}
                        </td>
                        <td style={{ padding: '7px 8px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: BONO_BG[m.estado_bono], color: BONO_COLOR[m.estado_bono] }}>
                            {BONO_LABEL[m.estado_bono]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Índice de equidad */}
            {indiceEquidad !== null && (
              <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-1">Índice de equidad del área</div>
                <div className="flex items-baseline gap-2">
                  <span className="font-barlow-condensed text-[34px] font-extrabold" style={{ color: indiceEquidad <= 15 ? '#16A34A' : indiceEquidad <= 30 ? '#D97706' : '#D32F2F' }}>{indiceEquidad}pp</span>
                  <span className="text-[12px] text-text-3">diferencia cobertura máx − mín · menor es más justo</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="text-[15px] font-barlow-condensed">Sin datos suficientes para el mes actual.</div></div>
        )}

        {/* KPIs del mes desde audit_entries */}
        {entriesMes.length > 0 && (() => {
          const bm = entriesMes.filter(e => e.resultado === 'bueno').length;
          const pm = entriesMes.reduce((s, e) => s + e.pallets, 0);
          const pctm = entriesMes.length ? Math.round((bm / entriesMes.length) * 100) : 0;
          return (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Auditorías', value: entriesMes.length, color: '#1a2550' },
                { label: 'Pallets', value: pm, color: '#2563EB' },
                { label: 'Aprobación', value: `${pctm}%`, color: pctm >= 80 ? '#16A34A' : '#D97706' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-card p-3 text-center border border-border" style={{ background: 'rgba(26,37,80,0.04)' }}>
                  <div className="font-barlow-condensed text-[26px] font-extrabold leading-tight" style={{ color }}>{value}</div>
                  <div className="text-[10px] text-text-3 uppercase tracking-wide mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Vista 7D / 30D ── */
  if (entries.length === 0) return (
    <div className="p-4">
      {periodSelector}
      <div className="text-center py-12 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="text-[16px] font-barlow-condensed">Sin auditorías en este período.</div></div>
    </div>
  );

  // Efectividad por picker en el período
  const pickerPeriodMap = new Map<string, { total: number; ok: number; pallets: number; nombre: string }>();
  entries.forEach(e => {
    const nombre = e.pickerNombre?.trim() || displayPicker(e.picker ?? '', pickerNames);
    if (!nombre) return;
    if (!pickerPeriodMap.has(nombre)) pickerPeriodMap.set(nombre, { total: 0, ok: 0, pallets: 0, nombre });
    const s = pickerPeriodMap.get(nombre)!;
    s.total++;
    s.pallets += e.pallets;
    if (!e.tieneErrores) s.ok++;
  });
  const pickerPeriodList = Array.from(pickerPeriodMap.values())
    .map(s => ({ ...s, efectividad: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0 }))
    .sort((a, b) => b.efectividad - a.efectividad);

  return (
    <div className="p-4 space-y-3">
      {periodSelector}
      <div className="text-[11px] text-text-3 text-center -mt-1">{entries.length} auditorías · {PERIOD_LABELS[period]}</div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Auditorías', value: entries.length, color: '#1a2550', bg: 'rgba(26,37,80,0.06)' },
          { label: '% Aprobación', value: `${pct}%`, color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F', bg: pct >= 80 ? 'rgba(22,163,74,0.08)' : pct >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(211,47,47,0.08)' },
          { label: 'Pallets totales', value: palletsH, color: '#2563EB', bg: 'rgba(37,99,235,0.06)' },
          { label: 'Con errores', value: erroresH, color: erroresH > 0 ? '#D32F2F' : '#16A34A', bg: erroresH > 0 ? 'rgba(211,47,47,0.07)' : 'rgba(22,163,74,0.07)' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-card p-3.5 text-center border border-border" style={{ background: bg, boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="font-barlow-condensed text-[34px] font-extrabold leading-tight" style={{ color }}>{value}</div>
            <div className="text-[11px] text-text-3 uppercase tracking-wide mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Efectividad por picker */}
      {pickerPeriodList.length > 0 && (
        <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
          <div className="px-4 py-2.5 border-b border-border">
            <span className="font-barlow-condensed text-[15px] font-bold text-navy">Efectividad por picker</span>
          </div>
          {pickerPeriodList.map(s => (
            <div key={s.nombre} className="px-4 py-3 border-b border-border/40 last:border-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-[13px] text-text">{s.nombre}</span>
                {s.total >= 20
                  ? <span className="font-barlow-condensed text-[18px] font-bold" style={{ color: effColor(s.efectividad) }}>{s.efectividad}%</span>
                  : <span className="text-[11px] text-text-3 italic">Muestra insuficiente</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.efectividad}%`, background: effColor(s.efectividad) }} />
                </div>
                <span className="text-[10px] text-text-3 flex-shrink-0">{s.ok}/{s.total} · {s.pallets}p</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tiendas con más errores */}
      {topErrTiendas.length > 0 && (
        <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
          <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Tiendas con más errores</div>
          {topErrTiendas.map(([nombre, n]) => (
            <div key={nombre} className="flex items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
              <div className="w-2.5 h-2.5 bg-red rounded-full flex-shrink-0" />
              <span className="flex-1 text-[13px] text-text font-medium">{nombre}</span>
              <span className="font-barlow-condensed text-[20px] font-bold text-red">{n}×</span>
            </div>
          ))}
        </div>
      )}

      {/* Distribución de correcciones */}
      <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-3">Distribución de correcciones</div>
        <div className="flex rounded-full overflow-hidden h-4 mb-3">
          {(Object.entries(corrBreak) as [CorreccionAuditoria, number][]).filter(([, v]) => v > 0).map(([k, v]) => (
            <div key={k} style={{ flex: v, background: CORR_COLORS[k] }} title={`${CORR_LABEL[k]}: ${v}`} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(corrBreak) as [CorreccionAuditoria, number][]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CORR_COLORS[k] }} />
              <span className="text-[12px] text-text-2">{CORR_LABEL[k]}: <strong>{v}</strong></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Ranking Content ── */
function RankingContent({ history, odooConfig, pickerNames }: { history: AuditEntry[]; odooConfig: OdooConfig; pickerNames: Record<string, string> }) {
  const [scope, setScope] = useState<'hoy' | 'total'>('total');
  const [rView, setRView] = useState<'barras' | 'semanal'>('barras');
  const [selectedPickers, setSelectedPickers] = useState<string[]>([]);
  const [metricasPickers, setMetricasPickers] = useState<MetricasPicker[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [p, prodMes, prodHoy] = await Promise.all([fetchParametros(), fetchProduccionMes(new Date()), fetchProduccionHoy()]);
      if (cancelled) return;
      const r = computeMetricas(history, prodMes, prodHoy, p, metricasTodayISO());
      setMetricasPickers(r.pickers);
    }
    load();
    return () => { cancelled = true; };
  }, [history]);

  const today = new Date().toLocaleDateString('es-CL');
  const entries = scope === 'hoy' ? history.filter(e => e.fecha === today) : history;
  const rankingData = useMemo(() => computeRanking(entries), [entries]);
  const weeklyTrends = useMemo(() => {
    const m = new Map<string, WeekTrend[]>();
    (selectedPickers.length ? selectedPickers : rankingData.slice(0, 6).map(r => r.picker)).forEach(p => m.set(p, computeWeeklyTrend(history, p)));
    return m;
  }, [history, rankingData, selectedPickers]);

  const totalAct = rankingData.length;
  const avgEff = totalAct ? Math.round(rankingData.reduce((s, r) => s + r.eficiencia, 0) / totalAct) : 0;
  const avgPct = totalAct ? Math.round(rankingData.reduce((s, r) => s + r.pct, 0) / totalAct) : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 flex flex-wrap gap-2 flex-shrink-0">
        {(['hoy', 'total'] as const).map(s => (
          <button key={s} onClick={() => setScope(s)} className={`px-4 py-1.5 rounded-full font-barlow-condensed text-[13px] font-bold border cursor-pointer ${scope === s ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>{s === 'hoy' ? 'Hoy' : 'Histórico'}</button>
        ))}
        <div className="flex-1" />
        {(['barras', 'semanal'] as const).map(v => (
          <button key={v} onClick={() => setRView(v)} className={`px-4 py-1.5 rounded-full font-barlow-condensed text-[13px] font-bold border cursor-pointer ${rView === v ? 'bg-[rgba(26,37,80,0.10)] text-navy border-navy/30' : 'bg-white text-text-2 border-border'}`}>{v === 'barras' ? '▮▮ Barras' : '📈 Semanal'}</button>
        ))}
      </div>

      {rankingData.length > 0 && (
        <div className="px-4 py-2.5 grid grid-cols-4 gap-2 flex-shrink-0">
          {[
            { v: totalAct, l: 'Activos', c: '#1a2550' },
            { v: `${avgEff}%`, l: 'Efic. prom.', c: avgEff >= 80 ? '#16A34A' : '#D97706' },
            { v: `${avgPct}%`, l: 'Aprob. prom.', c: avgPct >= 80 ? '#16A34A' : '#D97706' },
            { v: rankingData.reduce((s, r) => s + r.total, 0), l: 'Auditorías', c: '#1a2550' },
          ].map(({ v, l, c }) => (
            <div key={l} className="bg-white border border-border rounded-card p-2 text-center" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
              <div className="font-barlow-condensed text-[20px] font-bold" style={{ color: c }}>{v}</div>
              <div className="text-[10px] text-text-3 uppercase tracking-wide leading-tight mt-0.5">{l}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {rView === 'barras' ? (
          rankingData.length === 0
            ? <div className="text-center py-16 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="font-barlow-condensed text-[16px]">Sin datos para {scope === 'hoy' ? 'hoy' : 'el histórico'}.</div></div>
            : <>
                {rankingData.map((s, i) => {
                  const realName = pickerNames[s.picker]?.trim() || s.picker;
                  const metrica = metricasPickers.find(m => m.picker_nombre === realName || m.picker_nombre === s.picker);
                  return (
                    <PickerCard key={s.picker} stats={s} rank={i + 1} trend={computeWeeklyTrend(history, s.picker)} odooConfig={odooConfig} pickerNames={pickerNames} metrica={metrica} />
                  );
                })}
                {(() => {
                  const activos = new Set(rankingData.map(r => r.picker));
                  const sin = PICKERS_LIST.filter(p => !activos.has(p));
                  if (!sin.length) return null;
                  return (
                    <div className="mt-2">
                      <div className="text-[11px] text-text-3 uppercase tracking-wide mb-2">Sin auditorías en este período</div>
                      <div className="flex flex-wrap gap-1.5">{sin.map(p => <span key={p} className="text-[11px] text-text-3 bg-bg-2 border border-border px-2.5 py-1 rounded-full">{displayPicker(p, pickerNames)}</span>)}</div>
                    </div>
                  );
                })()}
              </>
        ) : (
          <div className="mt-3">
            <div className="mb-3">
              <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Comparar pickers (máx 6)</div>
              <div className="flex flex-wrap gap-1.5">
                {rankingData.map((r, ci) => {
                  const isSel = selectedPickers.includes(r.picker);
                  const color = LINE_COLORS[isSel ? selectedPickers.indexOf(r.picker) : ci % LINE_COLORS.length];
                  return (
                    <button key={r.picker} onClick={() => { if (isSel) setSelectedPickers(p => p.filter(x => x !== r.picker)); else if (selectedPickers.length < 6) setSelectedPickers(p => [...p, r.picker]); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold border cursor-pointer transition-all ${isSel && selectedPickers.length > 0 ? 'text-white border-transparent' : 'bg-bg-2 border-border text-text-2'}`}
                      style={isSel && selectedPickers.length > 0 ? { background: color, borderColor: color } : {}}>
                      <div className="w-2 h-2 rounded-full" style={{ background: isSel && selectedPickers.length > 0 ? 'white' : color }} />
                      {displayPicker(r.picker, pickerNames).replace('Pickers ', 'P.')}
                    </button>
                  );
                })}
                {selectedPickers.length > 0 && <button onClick={() => setSelectedPickers([])} className="px-2.5 py-1 rounded-full text-[11px] text-text-3 border border-border bg-white cursor-pointer">Todos</button>}
              </div>
            </div>
            <div className="bg-white border border-border rounded-card p-3 mb-3" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">% bueno por semana</div>
              <LineChart trends={weeklyTrends} selectedPickers={selectedPickers.length > 0 ? selectedPickers : rankingData.slice(0, 6).map(r => r.picker)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(selectedPickers.length > 0 ? selectedPickers : rankingData.slice(0, 6).map(r => r.picker)).map((p, ci) => (
                <div key={p} className="flex items-center gap-1.5 text-[11px]">
                  <div className="w-3 h-1.5 rounded-full" style={{ background: LINE_COLORS[ci % LINE_COLORS.length] }} />
                  <span className="text-text-2">{displayPicker(p, pickerNames)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── History Content ── */
function HistoryContent({ history, today, onReaudit, onExportPDF, onRefresh, pickerNames }: {
  history: AuditEntry[]; today: string;
  onReaudit: (e: AuditEntry) => void;
  onExportPDF?: (entries: AuditEntry[], fecha: string) => void;
  onRefresh?: () => void;
  pickerNames: Record<string, string>;
}) {
  const [histFecha, setHistFecha] = useState(today);
  const [refreshing, setRefreshing] = useState(false);
  const fechasDisponibles = useMemo(() => Array.from(new Set(history.map(e => e.fecha))).sort((a, b) => b.localeCompare(a)), [history]);
  const filtrado = history.filter(e => e.fecha === (histFecha || today));

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 300));
    onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 bg-white border-b border-border flex items-center gap-2 flex-shrink-0 overflow-x-auto">
        {fechasDisponibles.length === 0 ? <span className="text-[12px] text-text-3">Sin registros</span>
          : fechasDisponibles.map(f => <button key={f} onClick={() => setHistFecha(f)} className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-bold border cursor-pointer ${histFecha === f ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>{f === today ? 'Hoy' : f}</button>)}
        {onRefresh && (
          <button onClick={handleRefresh} className={`flex-shrink-0 ml-auto border-none bg-transparent text-text-3 cursor-pointer text-[18px] transition-transform ${refreshing ? 'animate-spin' : 'hover:text-navy'}`} title="Actualizar">↻</button>
        )}
      </div>
      {filtrado.length > 0 && (
        <div className="px-4 py-1.5 bg-white border-b border-border flex gap-3 flex-shrink-0 text-[12px] items-center">
          <strong className="text-navy">{filtrado.length}</strong> aud. &nbsp;·&nbsp;
          <strong className="text-success">{filtrado.filter(e => e.resultado === 'bueno').length}</strong> buenas &nbsp;·&nbsp;
          <strong className="text-red">{filtrado.filter(e => e.resultado === 'malo').length}</strong> malas
          {onExportPDF && <button onClick={() => onExportPDF(filtrado, histFecha || today)} disabled={!filtrado.length} className="ml-auto border-none bg-transparent text-navy text-[12px] font-bold cursor-pointer disabled:opacity-40">🖨 PDF</button>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3.5">
        {!filtrado.length
          ? <div className="text-center py-16 text-text-3 text-[15px]">Sin auditorías para esta fecha.</div>
          : filtrado.map(e => (
            <div key={e.id} className={`bg-white border border-border rounded-card p-3.5 mb-2.5 ${e.reauditoriaDeId ? 'border-l-[3px] border-l-info' : ''}`} style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.05)' }}>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-barlow-condensed text-base font-bold text-navy">{e.tiendaNombre}</div>
                    {e.reauditoriaDeId && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info border border-info/20">↩ Re-auditoría</span>}
                  </div>
                  <div className="text-[11px] text-text-3 mt-0.5">{e.hora} · {e.auditor}{e.picker ? ` · ${displayPicker(e.picker, pickerNames)}` : ''}</div>
                </div>
                <span className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${e.resultado === 'bueno' ? 'bg-[rgba(22,163,74,0.10)] border-success text-success' : 'bg-[rgba(211,47,47,0.10)] border-red text-red'}`}>
                  {e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] mb-2">
                <div><span className="text-text-3">Tipo:</span> <strong className="capitalize">{e.tipo}</strong></div>
                <div><span className="text-text-3">Pallets:</span> <strong>{e.pallets}</strong></div>
                <div><span className="text-text-3">Corrección:</span> <strong className={`ml-1 ${e.correccion === 'correcto' ? 'text-success' : e.correccion === 'faltante' ? 'text-red' : e.correccion === 'sobrante' ? 'text-warn' : 'text-info'}`}>{e.correccion}</strong></div>
                <div><span className="text-text-3">Errores:</span> <strong className={`ml-1 ${e.tieneErrores ? 'text-red' : 'text-success'}`}>{e.tieneErrores ? 'Sí' : 'No'}</strong></div>
              </div>
              {e.operaciones?.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{e.operaciones.map((op, i) => <span key={i} className="font-mono text-[10px] bg-bg-2 border border-border px-2 py-0.5 rounded">{op.subTipo}: {op.codigo}</span>)}</div>}
              {e.productos?.length > 0 && (
                <div className="mb-2">{e.productos.map((p, i) => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return <div key={i} className="flex items-center gap-2 text-[11px] mb-0.5"><span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0 ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{p.tipo}</span><span className="font-mono text-text-3 flex-shrink-0">[{p.codigo}]</span><span className="text-text flex-1 truncate">{p.nombre}</span><span className={`font-bold flex-shrink-0 ${p.tipo === 'faltante' ? 'text-red' : 'text-warn'}`}>{r}</span></div>; })}
                </div>
              )}
              {e.observaciones && <div className="mt-1.5 px-2.5 py-1.5 bg-bg rounded-btn text-[11px] text-text-2 italic border-l-2 border-navy/20 mb-2">{e.observaciones}</div>}
              {e.fotoUrl && (
                <a href={e.fotoUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 mb-2 rounded-card overflow-hidden border border-border">
                  <img src={e.fotoUrl} alt="foto del error" className="w-full object-cover" style={{ maxHeight: 160 }} />
                  <div className="px-2 py-1 bg-bg text-[10px] text-text-3 flex items-center gap-1">📷 Foto adjunta · toca para abrir</div>
                </a>
              )}
              {e.resultado === 'malo' && <button onClick={() => onReaudit(e)} className="w-full py-2 border border-dashed border-info/40 rounded-btn text-info text-[12px] font-bold cursor-pointer bg-transparent transition-all">↩ Re-auditar</button>}
            </div>
          ))}
      </div>
    </div>
  );
}

/* ── Desktop Stats Panel ── */
function StatsPanel({ history, today, onReaudit, odooConfig, onlyHistory = false, pickerNames, onRefresh }: {
  history: AuditEntry[]; today: string;
  onReaudit: (e: AuditEntry) => void; odooConfig: OdooConfig;
  onlyHistory?: boolean; pickerNames: Record<string, string>; onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking' | 'history'>(onlyHistory ? 'history' : 'dashboard');
  return (
    <div className="flex flex-col h-full bg-bg">
      {!onlyHistory && (
        <div className="flex border-b border-border bg-white flex-shrink-0">
          {([['dashboard', '📊 Dashboard'], ['ranking', '🏆 Ranking'], ['history', '📋 Historial']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 text-[13px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer ${tab === key ? 'border-navy text-navy bg-[rgba(26,37,80,0.02)]' : 'border-transparent text-text-3 bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {onlyHistory && (
        <div className="px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
          <span className="font-barlow-condensed text-[15px] font-bold text-navy">📋 Tu historial</span>
        </div>
      )}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!onlyHistory && tab === 'dashboard' && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={pickerNames} /></div>}
        {!onlyHistory && tab === 'ranking'   && <RankingContent history={history} odooConfig={odooConfig} pickerNames={pickerNames} />}
        {(onlyHistory || tab === 'history')  && <HistoryContent history={history} today={today} onReaudit={onReaudit} onExportPDF={exportarPDF} onRefresh={onRefresh} pickerNames={pickerNames} />}
      </div>
    </div>
  );
}

/* ── Mobile Menu ── */
function MobileMenu({ onClose, onNavigate, onlyHistory = false }: {
  onClose: () => void;
  onNavigate: (v: 'dashboard' | 'history' | 'ranking') => void;
  onlyHistory?: boolean;
}) {
  const items = onlyHistory
    ? [{ icon: '📋', label: 'Historial', sub: 'Tus auditorías por fecha', v: 'history' as const }]
    : [
        { icon: '📊', label: 'Dashboard del día', sub: 'KPIs y métricas de hoy', v: 'dashboard' as const },
        { icon: '🏆', label: 'Ranking de Pickers', sub: 'Eficiencia y estadísticas de unidades', v: 'ranking' as const },
        { icon: '📋', label: 'Historial', sub: 'Auditorías por fecha + exportar PDF', v: 'history' as const },
      ];
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] overflow-hidden" style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.22)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mt-4 mb-1" />
        <div className="p-4 pb-8 space-y-2">
          {items.map(({ icon, label, sub, v }) => (
            <button key={v} onClick={() => onNavigate(v)}
              className="w-full flex items-center gap-4 px-4 py-3.5 bg-bg hover:bg-bg-2 rounded-card cursor-pointer border border-border text-left transition-colors">
              <span className="text-[28px]">{icon}</span>
              <div className="flex-1">
                <div className="font-barlow-condensed text-[17px] font-bold text-navy">{label}</div>
                <div className="text-[12px] text-text-3 mt-0.5">{sub}</div>
              </div>
              <span className="text-text-3 text-[18px]">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN SCREEN
════════════════════════════════════════ */
export function AuditoriaScreen() {
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast, state } = useApp();
  const userRole        = profile?.role ?? 'auditor';
  const isAdminAud      = userRole === 'admin-auditoria' || userRole === 'admin';
  const isAuditorOnly   = userRole === 'auditor';
  const router = useRouter();

  const [auditor,           setAuditor]           = useState('');
  const auditorFromProfile = useRef(false); // true when auditor was set by auto-fill (not manually typed)
  const [picker,            setPicker]            = useState('');
  const [tienda,            setTienda]            = useState<TiendaRef | null>(null);
  const [tipo,              setTipo]              = useState<TipoAuditoria>('comida');
  const [operaciones,       setOperaciones]       = useState<OperacionEntry[]>([{ subTipo: 'comida', codigo: '' }]);
  const [pallets,           setPallets]           = useState('');
  const [tieneErrores,      setTieneErrores]      = useState<boolean | null>(null);
  const [tiposError,        setTiposError]        = useState<TipoError[]>([]);
  const [productos,         setProductos]         = useState<ProductoError[]>([]);
  const [observaciones,     setObservaciones]     = useState('');
  const [reauditoriaOrigen, setReauditoriaOrigen] = useState<AuditEntry | null>(null);

  const [tiendaQuery, setTiendaQuery] = useState('');
  const [tiendaOpen,  setTiendaOpen]  = useState(false);
  const tiendaRef = useRef<HTMLDivElement>(null);

  const odooConfig = useMemo(() => getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' }, []);
  const [view, setView] = useState<'hub' | 'form' | 'history' | 'ranking' | 'dashboard' | 'stats' | 'revision' | 'config' | 'produccion'>('form');
  const [viewInit,       setViewInit]       = useState(false);
  const [history,        setHistory]        = useState<AuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError,   setHistoryError]   = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [palletFiles,      setPalletFiles]      = useState<Record<string, File>>({});
  const [palletPreviews,   setPalletPreviews]   = useState<Record<string, string>>({});
  const [fotoFiles,        setFotoFiles]        = useState<File[]>([]);
  const [fotoPreviews,     setFotoPreviews]     = useState<string[]>([]);
  const [errorFotoFiles,   setErrorFotoFiles]   = useState<File[]>([]);
  const [errorFotoPreviews,setErrorFotoPreviews]= useState<string[]>([]);
  const [submitting,       setSubmitting]       = useState(false);
  const [pickerNombre,   setPickerNombre]   = useState('');
  const [pickerNombresList, setPickerNombresList] = useState<string[]>([]);
  const [auditorList,       setAuditorList]       = useState<string[]>([]);
  const [odooAutoDetected, setOdooAutoDetected] = useState(false);
  const [confirmSubmit,    setConfirmSubmit]    = useState(false);
  const [tipoPending,      setTipoPending]      = useState<TipoAuditoria | null>(null);
  const [isOnline,         setIsOnline]         = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const palletsInputRef = useRef<HTMLInputElement>(null);
  const pendingScanRef  = useRef<string[] | null>(null);
  const [sections, setSections] = useState({ id: true, contenido: true, resultado: true, evidencia: true });
  const toggleSection = (k: keyof typeof sections) => setSections(s => ({ ...s, [k]: !s[k] }));

  // Set initial view once profile loads + kick off history load with correct user context
  useEffect(() => {
    if (!authLoading && !viewInit) {
      if (isAdminAud) setView('hub');
      setViewInit(true);
      loadHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdminAud, viewInit]);

  // Online/offline detection + flush queue on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue(count => showToast(`✓ ${count} auditoría${count > 1 ? 's' : ''} sincronizada${count > 1 ? 's' : ''}`, '#16A34A'));
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Flush on mount if online and queue has items
    if (navigator.onLine) flushOfflineQueue(count => showToast(`✓ ${count} auditoría${count > 1 ? 's' : ''} sincronizada${count > 1 ? 's' : ''}`, '#16A34A'));
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true); setHistoryError('');
    try {
      let query = supabase
        .from('audit_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      // Non-admin users only see their own entries
      if (!isAdminAud && user?.id) query = query.eq('user_id', user.id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        setHistory(data.map(r => rowToEntry(r as Record<string, unknown>)));
      } else {
        const h = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
        setHistory(h.slice(-200).reverse());
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Error al cargar historial');
      try {
        const h = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
        setHistory(h.slice(-200).reverse());
      } catch { /* empty */ }
    } finally {
      setHistoryLoading(false);
    }
  };
  // loadHistory is called in the viewInit effect (after auth resolves) to ensure user context is ready
  useEffect(() => {
    supabase.from('picker_config').select('auditores, picker_nombres').eq('id', 1).single()
      .then(({ data }) => {
        if (Array.isArray(data?.picker_nombres) && (data.picker_nombres as string[]).length > 0) {
          setPickerNombresList(data.picker_nombres as string[]);
        }
        if (Array.isArray(data?.auditores)) {
          setAuditorList(data.auditores as string[]);
        }
      });
  }, []);
  // Auto-fill auditor from logged-in profile name; also re-sync when profile name changes
  useEffect(() => {
    if (authLoading || !profile?.full_name) return;
    if (!auditor || auditorFromProfile.current) {
      setAuditor(profile.full_name);
      auditorFromProfile.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.full_name]);

  useEffect(() => {
    const codes = pendingScanRef.current;
    pendingScanRef.current = null;
    setOperaciones(TIPO_TO_SUBTIPOS[tipo].map((st, i) => ({ subTipo: st, codigo: codes?.[i] ?? '' })));
    Object.values(palletPreviews).forEach(url => URL.revokeObjectURL(url));
    setPalletFiles({});
    setPalletPreviews({});
    fotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setFotoFiles([]);
    setFotoPreviews([]);
    errorFotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setErrorFotoFiles([]);
    setErrorFotoPreviews([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const handleTipoChange = (val: TipoAuditoria) => {
    if (val === tipo) return;
    const hasPhotos = Object.keys(palletFiles).length > 0 || fotoFiles.length > 0;
    if (hasPhotos) { setTipoPending(val); } else { setTipo(val); }
  };
  useEffect(() => { if (!tieneErrores) { setTiposError([]); setProductos([]); } }, [tieneErrores]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (tiendaRef.current && !tiendaRef.current.contains(e.target as Node)) setTiendaOpen(false); };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Autosave draft to sessionStorage (picker excluded — Odoo assigns it fresh per operation)
  useEffect(() => {
    if (!auditor && !tienda) return;
    const handle = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ auditor, pickerNombre, tiendaCod: tienda?.cod, tipo, pallets, tieneErrores, tiposError }));
      } catch { /* empty */ }
    }, 1500);
    return () => clearTimeout(handle);
  }, [auditor, pickerNombre, tienda, tipo, pallets, tieneErrores, tiposError]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { auditor?: string; pickerNombre?: string; tiendaCod?: string; tipo?: TipoAuditoria; pallets?: string; tieneErrores?: boolean | null; tiposError?: TipoError[] };
      if (draft.auditor) setAuditor(draft.auditor);
      if (draft.pickerNombre) setPickerNombre(draft.pickerNombre);
      if (draft.tiendaCod) setTienda(TODAS_LAS_TIENDAS.find(t => t.cod === draft.tiendaCod) ?? null);
      if (draft.tipo) setTipo(draft.tipo);
      if (draft.pallets) setPallets(draft.pallets);
      if (draft.tieneErrores !== undefined) setTieneErrores(draft.tieneErrores ?? null);
      if (draft.tiposError?.length) setTiposError(draft.tiposError);
    } catch { /* empty */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const correccion = useMemo<CorreccionAuditoria>(() => {
    if (!tieneErrores) return 'correcto';
    const f = tiposError.includes('faltante'), s = tiposError.includes('sobrante');
    if (f && s) return 'cruce'; if (f) return 'faltante'; if (s) return 'sobrante'; return 'correcto';
  }, [tieneErrores, tiposError]);
  const resultado = useMemo<ResultadoAuditoria>(() => tieneErrores === true ? 'malo' : 'bueno', [tieneErrores]);

  const tiendaFiltered = TODAS_LAS_TIENDAS.filter(t => {
    const q = tiendaQuery.toLowerCase();
    return !q || t.nombre.toLowerCase().includes(q) || t.cod.toLowerCase().includes(q) || t.region.toLowerCase().includes(q);
  });

  const updateOperacion = (i: number, codigo: string) => setOperaciones(ops => ops.map((op, j) => j === i ? { ...op, codigo } : op));

  const handleOpSelect = (_codigo: string, responsable: string | undefined) => {
    if (responsable) {
      const match = matchPickerNames(responsable, PICKER_NAMES);
      if (match) {
        setPicker(match);
        setOdooAutoDetected(true);
        showToast(`Picker detectado: ${displayPicker(match, PICKER_NAMES)}`, '#2563EB');
      }
    }
  };

  // Parsea código de barra del pallet: COD|PickerName|Refs|P#|Cats
  const handleBarcodeScan = (raw: string): boolean => {
    const parts = raw.split('|');
    if (parts.length < 3) return false;
    const [storeCod, pickerName, refs, , cats] = parts;
    const opCodes = (refs ?? '').split('+').filter(Boolean);
    if (opCodes.length === 0) return false;

    const newTipo = cats ? catsToTipo(cats) : tipo;

    if (pickerName?.trim()) setPickerNombre(pickerName.trim());

    const matchedTienda = TODAS_LAS_TIENDAS.find(t => t.cod === storeCod);
    if (matchedTienda) setTienda(matchedTienda);

    if (newTipo !== tipo) {
      // El useEffect de tipo se encargará de setOperaciones usando pendingScanRef
      pendingScanRef.current = opCodes;
      setTipo(newTipo);
    } else {
      // Tipo igual: set operaciones directamente
      setOperaciones(TIPO_TO_SUBTIPOS[newTipo].map((st, i) => ({ subTipo: st, codigo: opCodes[i] ?? '' })));
    }

    showToast(`✓ ${storeCod} · ${pickerName?.trim() || 'sin nombre'}`, '#16A34A');
    return true;
  };

  const toggleTipoError = (t: TipoError) => { setTiposError(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]); setProductos([]); };

  const canSubmit = !!auditor.trim() && !!tienda && operaciones.every(op => op.codigo.trim()) && !!pallets && parseInt(pallets) > 0 && tieneErrores !== null && (!tieneErrores || tiposError.length > 0);

  const handleSubmitClick = () => {
    if (!auditor.trim()) { showToast('Ingresa el nombre del auditor', '#D97706'); return; }
    if (!tienda) { showToast('Selecciona una tienda', '#D97706'); return; }
    if (operaciones.some(op => !op.codigo.trim())) { showToast('Completa todas las operaciones', '#D97706'); return; }
    if (!pallets || parseInt(pallets) <= 0) { showToast('Ingresa la cantidad de pallets', '#D97706'); return; }
    if (tieneErrores === null) { showToast('Indica si hubo errores', '#D97706'); return; }
    if (tieneErrores && tiposError.length === 0) { showToast('Selecciona el tipo de error', '#D97706'); return; }
    setConfirmSubmit(true);
  };

  const handleSubmit = async () => {
    setConfirmSubmit(false);
    if (!tienda) return;
    setSubmitting(true);
    const now = new Date();
    const entryId = `AUD-${Date.now()}`;
    const uploadedFotos: { label: string; url: string }[] = [];
    const palletCount = parseInt(pallets) || 0;
    const canUploadPhotos = user && navigator.onLine;
    if (canUploadPhotos) {
      for (let n = 1; n <= palletCount; n++) {
        const file = palletFiles[String(n)];
        if (!file) continue;
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${entryId}_pallet${n}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('audit-photos')
          .upload(path, file, { contentType: file.type, upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('audit-photos').getPublicUrl(path);
          uploadedFotos.push({ label: `Pallet ${n}`, url: publicUrl });
        } else {
          showToast(`⚠ Error al subir foto pallet ${n}`, '#D97706');
        }
      }
    }
    const uploadedFotoUrls: string[] = [];
    if (canUploadPhotos && fotoFiles.length > 0) {
      for (let fi = 0; fi < fotoFiles.length; fi++) {
        const fotoFile = fotoFiles[fi];
        const ext = fotoFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${entryId}_foto${fi + 1}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('audit-photos')
          .upload(path, fotoFile, { contentType: fotoFile.type, upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('audit-photos').getPublicUrl(path);
          uploadedFotoUrls.push(publicUrl);
        } else {
          showToast(`⚠ Error al subir foto de productos ${fi + 1}`, '#D97706');
        }
      }
    }
    const uploadedErrorFotoUrls: string[] = [];
    if (canUploadPhotos && errorFotoFiles.length > 0) {
      for (let fi = 0; fi < errorFotoFiles.length; fi++) {
        const fotoFile = errorFotoFiles[fi];
        const ext = fotoFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${entryId}_error${fi + 1}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('audit-photos')
          .upload(path, fotoFile, { contentType: fotoFile.type, upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('audit-photos').getPublicUrl(path);
          uploadedErrorFotoUrls.push(publicUrl);
        } else {
          showToast(`⚠ Error al subir foto de error ${fi + 1}`, '#D97706');
        }
      }
    }
    const entry: AuditEntry = {
      id: entryId, fecha: now.toLocaleDateString('es-CL'), hora: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      auditor: auditor.trim(), picker: picker.trim(), pickerNombre: pickerNombre.trim() || undefined,
      tiendaCod: tienda.cod, tiendaNombre: tienda.nombre, tiendaArea: tienda.area,
      tipo, operaciones, pallets: palletCount, tieneErrores: tieneErrores === true, tiposError, productos,
      correccion, resultado, observaciones: observaciones.trim(), reauditoriaDeId: reauditoriaOrigen?.id,
      fotoUrls:       uploadedFotoUrls.length      > 0 ? uploadedFotoUrls      : undefined,
      errorFotoUrls:  uploadedErrorFotoUrls.length > 0 ? uploadedErrorFotoUrls : undefined,
      palletFotos:    uploadedFotos.length         > 0 ? uploadedFotos         : undefined,
    };
    setHistory([entry, ...history.slice(0, 199)]);
    if (user) {
      const row = entryToRow(entry, user.id);
      if (!navigator.onLine) {
        const q = loadOfflineQueue();
        q.push({ row, userId: user.id, entryId: entry.id });
        saveOfflineQueue(q);
        showToast('Sin conexión — auditoría guardada localmente', '#D97706');
      } else {
        supabase.from('audit_entries').insert(row)
          .then(({ error }) => {
            if (error) {
              console.error('Audit save:', error.message);
              const q = loadOfflineQueue();
              q.push({ row, userId: user.id, entryId: entry.id });
              saveOfflineQueue(q);
              showToast('⚠ Error al guardar — se sincronizará cuando haya conexión', '#D97706');
            }
          });
      }
    }
    try { const prev = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[]; prev.push(entry); localStorage.setItem('auditHistory', JSON.stringify(prev.slice(-200))); } catch { /* empty */ }
    sheetsAuditoriaWrite(entry, state.sheetsUrl);
    showToast(`✓ Auditoría — ${resultado === 'bueno' ? 'BUENO' : 'MALO'}`, resultado === 'bueno' ? '#16A34A' : '#D32F2F');
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* empty */ }
    setTienda(null); setTiendaQuery(''); setPicker(''); setPickerNombre(''); setOdooAutoDetected(false); setTipo('comida'); setPallets('');
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones(''); setReauditoriaOrigen(null);
    Object.values(palletPreviews).forEach(url => URL.revokeObjectURL(url));
    setPalletFiles({}); setPalletPreviews({});
    fotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setFotoFiles([]); setFotoPreviews([]);
    errorFotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setErrorFotoFiles([]); setErrorFotoPreviews([]);
    setSubmitting(false);
  };

  const iniciarReauditoria = (entry: AuditEntry) => {
    if (reauditoriaOrigen) { showToast('Termina o cancela la re-auditoría en curso primero', '#D97706'); return; }
    setReauditoriaOrigen(entry);
    setTienda(TODAS_LAS_TIENDAS.find(t => t.cod === entry.tiendaCod) ?? null);
    setTiendaQuery(''); setTipo(entry.tipo); setPicker(entry.picker || ''); setPickerNombre(''); setOdooAutoDetected(false);
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones('');
    setView('form');
  };

  const today = new Date().toLocaleDateString('es-CL');
  const todayEntries = useMemo(() => history.filter(e => e.fecha === today), [history, today]);

  /* ── Hub view (admin-auditoria only) ── */
  if (isAdminAud && view === 'hub') {
    const hubCards = [
      { Icon: ClipboardPlus,   title: 'Agregar Audición',   sub: 'Registrar nueva auditoría de pallet',    fn: () => setView('form'),               border: 'rgba(34,197,94,0.55)',  bg: 'rgba(34,197,94,0.18)',  shadow: 'rgba(34,197,94,0.22)' },
      { Icon: BarChart3,       title: 'Estadísticas',        sub: 'Dashboard del día · Ranking de Pickers', fn: () => setView('stats'),              border: 'rgba(37,99,235,0.55)',  bg: 'rgba(37,99,235,0.18)',  shadow: 'rgba(37,99,235,0.22)' },
      { Icon: PackageOpen,     title: 'Producción diaria',   sub: 'Registrar pallets producidos por picker',fn: () => setView('produccion'),          border: 'rgba(245,158,11,0.55)', bg: 'rgba(245,158,11,0.16)', shadow: 'rgba(245,158,11,0.20)' },
      { Icon: Search,           title: 'Revisión Auditoría',  sub: 'Lista · Fotos · Estadísticas',           fn: () => router.push('/auditoria-admin'),border: 'rgba(124,58,237,0.55)', bg: 'rgba(124,58,237,0.18)', shadow: 'rgba(124,58,237,0.22)' },
      { Icon: Clock,           title: 'Historial',           sub: 'Tus auditorías por fecha',               fn: () => setView('revision'),            border: 'rgba(217,119,6,0.55)',  bg: 'rgba(217,119,6,0.16)',  shadow: 'rgba(217,119,6,0.20)' },
      { Icon: Settings2,       title: 'Configuración',       sub: 'Pickers · Auditores · Parámetros',       fn: () => setView('config'),              border: 'rgba(20,184,166,0.55)', bg: 'rgba(20,184,166,0.18)', shadow: 'rgba(20,184,166,0.20)' },
    ];
    return (
      <>
        <style>{`
          @media (max-width: 480px) {
            .aud-hub-root {
              padding: 0 !important;
              overflow: hidden !important;
              height: 100dvh !important;
            }
            .aud-hub-header {
              margin-bottom: 0 !important;
              padding: 12px 20px !important;
            }
            .aud-hub-desktop { display: none !important; }
            .aud-hub-mobile {
              display: flex !important;
              flex: 1 !important;
              flex-direction: column !important;
              padding: 12px 16px 24px !important;
              gap: 9px !important;
              min-height: 0 !important;
              overflow: hidden !important;
            }
            .aud-hub-mobile-card {
              flex: 1 !important;
              height: auto !important;
            }
          }
        `}</style>
        <div className="aud-hub-root fixed inset-0 flex flex-col py-10 overflow-y-auto"
          style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

          {/* Header */}
          <div className="aud-hub-header flex items-center justify-between gap-3 mb-10 px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(userRole === 'admin' ? '/control-interno' : '/')}
                className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
                style={{
                  width: 36, height: 36,
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}>
                <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              </button>
              <div>
                <div className="font-barlow-condensed text-[11px] font-bold tracking-[0.2em] uppercase text-white/35">Módulo</div>
                <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Auditoría</div>
              </div>
            </div>
            <ProfilePill compact />
          </div>

          {/* Desktop grid */}
          <div className="aud-hub-desktop px-6">
            <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:max-w-lg md:mx-auto">
              {hubCards.map(({ Icon, title, sub, fn, border, bg, shadow }) => (
                <button key={title} onClick={fn}
                  className="relative overflow-hidden rounded-2xl px-5 py-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
                  style={{ background: bg, borderColor: border, boxShadow: `0 8px 24px ${shadow}`, minHeight: 118 }}>
                  <Icon size={28} color="rgba(255,255,255,0.85)" strokeWidth={1.5} style={{ marginBottom: 10 }} />
                  <div className="font-barlow-condensed text-[18px] font-bold text-white tracking-widest uppercase leading-tight">{title}</div>
                  <div className="text-[11px] text-white/55 mt-0.5">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="aud-hub-mobile flex md:hidden flex-col gap-3 px-6">
            {hubCards.map(({ Icon, title, sub, fn, border, bg, shadow }) => (
              <button key={title} onClick={fn}
                className="aud-hub-mobile-card w-full relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 cursor-pointer transition-all active:scale-[0.98] border-2 text-left"
                style={{ background: bg, borderColor: border, boxShadow: `0 6px 20px ${shadow}`, minHeight: 66 }}>
                <Icon size={24} color="rgba(255,255,255,0.85)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="font-barlow-condensed text-[18px] font-bold text-white tracking-wide uppercase leading-tight">{title}</div>
                  <div className="text-[11px] text-white/55">{sub}</div>
                </div>
                <ChevronLeft size={16} color="rgba(255,255,255,0.3)" strokeWidth={2.5} style={{ flexShrink: 0, transform: 'rotate(180deg)' }} />
              </button>
            ))}
          </div>

        </div>
      </>
    );
  }

  /* ── Stats view (admin-auditoria: Dashboard + Ranking) ── */
  if (isAdminAud && view === 'stats') {
    return (
      <AdminAudStats history={history} today={today} odooConfig={odooConfig} onBack={() => setView('hub')} pickerNames={PICKER_NAMES} />
    );
  }

  /* ── Producción diaria view ── */
  if (isAdminAud && view === 'produccion') {
    return <ProduccionPanel onBack={() => setView('hub')} pickerNombresList={pickerNombresList} />;
  }

  /* ── Revision view (admin-auditoria: History of all) ── */
  if (isAdminAud && view === 'revision') {
    return (
      <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #1a2550 0%, #5b21b6 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
          <button onClick={() => setView('hub')}
            className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
            style={{
              width: 36, height: 36,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}>
            <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          </button>
          <div className="flex-1">
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Revisión Auditoría</div>
            <div className="text-[11px] text-white/40 uppercase tracking-widest">{userRole === 'admin' ? 'Admin' : 'Admin Auditoría'}</div>
          </div>
          <ProfilePill compact />
        </div>
        <HistoryContent history={history} today={today} onReaudit={e => { iniciarReauditoria(e); setView('form'); }} onExportPDF={exportarPDF} onRefresh={loadHistory} pickerNames={PICKER_NAMES} />
      </div>
    );
  }

  /* ── Config view (admin-auditoria: picker names + future settings) ── */
  if (isAdminAud && view === 'config') {
    return (
      <ConfigPanel
        onBack={() => setView('hub')}
        onSaved={(list, auds) => { setPickerNombresList(list); setAuditorList(auds); }}
        userRole={userRole}
      />
    );
  }

  /* ════ FORM RENDER (all roles) ════ */
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── HEADER ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        {isAdminAud
          ? <button onClick={() => setView('hub')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
          : <button onClick={() => router.push('/')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
        }
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase">Auditoría</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            {userRole === 'admin' ? 'Admin' : userRole === 'admin-auditoria' ? 'Admin Auditoría' : 'Auditor'} · Control de calidad
          </div>
        </div>
        {/* Mobile: hamburger + profile */}
        <div className="flex md:hidden items-center gap-1">
          {!isAdminAud && <button onClick={() => setMobileMenuOpen(true)} className="border-none bg-white/15 text-white text-[17px] font-bold cursor-pointer px-2.5 py-1.5 rounded-full">☰</button>}
          <ProfilePill compact />
        </div>
        {/* Desktop: profile */}
        <div className="hidden md:flex items-center gap-1">
          <ProfilePill />
        </div>
      </div>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5"
          style={{ background: 'rgba(217,119,6,0.12)', borderBottom: '1px solid rgba(217,119,6,0.25)' }}>
          <span className="text-[13px]">📵</span>
          <span className="text-[12px] font-semibold text-warn">Sin conexión — las auditorías se guardarán localmente y se sincronizarán al reconectar</span>
        </div>
      )}

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: FORM */}
        <div className={isAdminAud
          ? 'flex-1 md:flex-none md:w-[420px] lg:w-[460px] overflow-y-auto'
          : isAuditorOnly
            ? 'flex-1 flex flex-col overflow-hidden'
            : 'flex-1 md:flex-none md:w-[420px] lg:w-[460px] overflow-y-auto md:border-r md:border-border'}>
          {/* Auditor tab bar */}
          {isAuditorOnly && (
            <div className="hidden md:flex border-b border-border bg-white flex-shrink-0">
              {([{ v: 'form' as const, label: '📝 Formulario' }, { v: 'history' as const, label: '📋 Historial' }]).map(({ v: tv, label }) => (
                <button key={tv} onClick={() => setView(tv)}
                  className={`flex-1 py-3 font-barlow-condensed text-[14px] font-bold border-b-2 cursor-pointer transition-colors ${tv === 'history' ? (view === 'history' ? 'border-navy text-navy' : 'border-transparent text-text-3') : (view !== 'history' ? 'border-navy text-navy' : 'border-transparent text-text-3')}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Auditor: inline history view */}
          {isAuditorOnly && view === 'history' && (
            <div className="hidden md:flex flex-1 overflow-hidden flex-col">
              <div className="max-w-[480px] mx-auto w-full flex-1 overflow-hidden flex flex-col">
                <HistoryContent history={history} today={today} onReaudit={iniciarReauditoria} onExportPDF={exportarPDF} onRefresh={loadHistory} pickerNames={PICKER_NAMES} />
              </div>
            </div>
          )}
          {(!isAuditorOnly || view !== 'history') && <div className={`px-4 pb-8${isAdminAud ? ' max-w-2xl mx-auto' : isAuditorOnly ? ' md:max-w-[480px] md:mx-auto overflow-y-auto flex-1' : ''}`}>

            {/* History error banner (#18) */}
            {historyError && !historyLoading && (
              <div className="mt-4 flex items-center gap-2 bg-[rgba(211,47,47,0.07)] border border-red/20 rounded-card px-3 py-2">
                <span className="text-red text-[14px]">⚠</span>
                <span className="text-[11px] text-red flex-1 truncate">Error al cargar historial</span>
                <button onClick={() => loadHistory()} className="text-[11px] font-bold text-red border border-red/30 rounded-btn px-2 py-0.5 cursor-pointer bg-transparent">Reintentar</button>
                <button onClick={() => setHistoryError('')} className="text-red/50 text-[16px] leading-none border-none bg-transparent cursor-pointer px-1">×</button>
              </div>
            )}

            {/* Re-audit banner */}
            {reauditoriaOrigen && (
              <div className="mt-4 rounded-card overflow-hidden border-2 border-info" style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.20)' }}>
                <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(37,99,235,0.08) 100%)' }}>
                  <span className="text-info text-[22px] font-bold">↩</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-barlow-condensed text-[15px] font-bold text-info uppercase tracking-wide">Re-auditoría en curso</div>
                    <div className="text-[11px] text-text-2 truncate mt-0.5">
                      Original: <strong>{reauditoriaOrigen.tiendaNombre}</strong> · {reauditoriaOrigen.hora} · {CORR_LABEL[reauditoriaOrigen.correccion]}
                    </div>
                  </div>
                  <button onClick={() => setReauditoriaOrigen(null)} className="border-none bg-info/10 text-info cursor-pointer text-[16px] leading-none px-2 py-1 rounded-btn font-bold">× Cancelar</button>
                </div>
              </div>
            )}

            {/* ── SECCIÓN 1: IDENTIFICACIÓN ── */}
            <AccordionSection title="Identificación" open={sections.id} onToggle={() => toggleSection('id')}>
              <SLabel>Auditor</SLabel>
              <AuditorSelector auditor={auditor} auditorList={auditorList} onChange={v => { setAuditor(v); auditorFromProfile.current = false; }} />

              <SLabel>Auditor (id. pistola) <span className="text-[10px] font-normal normal-case ml-1">Odoo lo asigna automáticamente</span></SLabel>
              <PickerOdooDisplay picker={picker} odooDetected={odooAutoDetected} onClear={() => { setPicker(''); setOdooAutoDetected(false); }} />

              <SLabel>Picker (armador de pallet)</SLabel>
              <PickerNombreSelector pickerNombre={pickerNombre} pickerNombresList={pickerNombresList} onChange={setPickerNombre} />

              <SLabel>Tienda</SLabel>
              <div ref={tiendaRef} className="relative">
                <div onClick={() => setTiendaOpen(o => !o)}
                  className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 flex items-center justify-between cursor-pointer transition-all ${tiendaOpen ? 'border-navy shadow-[0_0_0_3px_rgba(26,37,80,0.08)]' : 'border-border'}`} style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                  {tienda ? (
                    <div className="flex-1 min-w-0"><span className="font-semibold text-text text-[15px]">{tienda.nombre}</span><span className="font-mono text-[11px] text-text-3 ml-2">{tienda.cod}</span><span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tienda.area === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>{tienda.area === 'santiago' ? 'STG' : 'REG'}</span></div>
                  ) : <span className="text-text-3 font-barlow text-[15px]">Seleccionar tienda…</span>}
                  <span className="text-text-3 ml-2 flex-shrink-0">{tiendaOpen ? '▲' : '▼'}</span>
                </div>
                {tiendaOpen && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-white border border-border rounded-card mt-1 shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-border"><input autoFocus type="text" value={tiendaQuery} onChange={e => setTiendaQuery(e.target.value)} placeholder="Buscar…" className="w-full bg-bg border border-border rounded-btn px-3 py-2 text-text font-barlow text-[14px] outline-none focus:border-navy" /></div>
                    <div className="max-h-56 overflow-y-auto">
                      {tiendaFiltered.length === 0 && <div className="py-6 text-center text-text-3 text-[13px]">Sin resultados</div>}
                      {tiendaFiltered.map(t => (
                        <div key={t.cod} onClick={() => { setTienda(t); setTiendaOpen(false); setTiendaQuery(''); }} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 ${tienda?.cod === t.cod ? 'bg-[rgba(26,37,80,0.06)]' : 'hover:bg-bg'}`}>
                          <span className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border px-1.5 py-0.5 rounded">{t.cod}</span>
                          <div className="flex-1 min-w-0"><div className="font-semibold text-[14px] text-text truncate">{t.nombre}</div><div className="text-[11px] text-text-3">{t.comuna || t.region}</div></div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${t.area === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>{t.area === 'santiago' ? 'STG' : 'REG'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* ── SECCIÓN 2: CONTENIDO ── */}
            <AccordionSection title="Contenido" open={sections.contenido} onToggle={() => toggleSection('contenido')}>
              <SLabel>Tipo de contenido</SLabel>
              <div className="grid grid-cols-3 gap-1.5">
                {TIPOS.map(({ value, label }) => (
                  <button key={value} onClick={() => handleTipoChange(value)} className={`py-2.5 rounded-btn border-[1.5px] font-barlow-condensed text-[14px] font-bold cursor-pointer transition-all ${tipo === value ? TIPO_COLOR[value] : 'border-border bg-white text-text-2'}`}>{label}</button>
                ))}
              </div>

              <SLabel>Operaciones Odoo <span className="text-[10px] font-normal normal-case ml-1">({operaciones.length} op{operaciones.length !== 1 ? 's' : '.'})</span></SLabel>
              <BarcodeInputScanner onScan={handleBarcodeScan} />
              {operaciones.map((op, i) => (
                <OperacionInput key={op.subTipo} subTipo={op.subTipo} codigo={op.codigo}
                  onChange={v => updateOperacion(i, v)} onSelect={handleOpSelect}
                  odooConfig={odooConfig} onNeedConfig={() => showToast('Configura NEXT_PUBLIC_ODOO_* en .env.local', '#D97706')} />
              ))}

              <SLabel>Pallets auditados</SLabel>
              <input ref={palletsInputRef} type="number" inputMode="numeric" min="1" max="99" value={pallets} onChange={e => setPallets(e.target.value)} placeholder="0"
                onFocus={() => setTimeout(() => palletsInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)}
                className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-barlow text-[28px] text-center outline-none focus:border-navy [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />
              {parseInt(pallets) > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mt-1">Fotos exteriores de pallets · <span className="font-normal normal-case">opcional</span></div>
                  {Array.from({ length: parseInt(pallets) }, (_, i) => i + 1).map(n => {
                    const key = String(n);
                    const preview = palletPreviews[key];
                    return (
                      <div key={key}>
                        {preview ? (
                          <div className="relative rounded-card overflow-hidden border border-border" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.08)' }}>
                            <img src={preview} alt={`Pallet ${n}`} className="w-full object-cover" style={{ maxHeight: 140 }} />
                            <div className="absolute top-1 left-2 text-[10px] font-bold text-white bg-black/50 rounded px-1.5 py-0.5">Pallet {n}</div>
                            <button
                              onClick={() => { URL.revokeObjectURL(preview); setPalletPreviews(p => { const np = { ...p }; delete np[key]; return np; }); setPalletFiles(p => { const np = { ...p }; delete np[key]; return np; }); }}
                              className="absolute top-2 right-2 bg-red text-white border-none rounded-full w-7 h-7 text-[16px] leading-none cursor-pointer flex items-center justify-center font-bold"
                              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>×</button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-3 px-4 py-2.5 bg-white border-2 border-dashed border-border rounded-card cursor-pointer hover:border-navy/40 transition-colors" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
                            <span className="text-[22px]">📷</span>
                            <span className="text-[12px] text-text-3 font-barlow">Foto exterior — Pallet {n}</span>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) { setPalletFiles(p => ({ ...p, [key]: f })); setPalletPreviews(p => ({ ...p, [key]: URL.createObjectURL(f) })); e.target.value = ''; } }} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </AccordionSection>

            {/* ── SECCIÓN 3: RESULTADO ── */}
            <AccordionSection title="Resultado" open={sections.resultado} onToggle={() => toggleSection('resultado')}>
              <SLabel>¿Tuvo errores?</SLabel>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTieneErrores(false)} className={`py-4 rounded-card border-2 font-barlow-condensed text-[20px] font-bold cursor-pointer transition-all ${tieneErrores === false ? 'bg-[rgba(22,163,74,0.12)] border-success text-success' : 'bg-white border-border text-text-2'}`} style={tieneErrores === false ? { boxShadow: '0 4px 16px rgba(22,163,74,0.20)' } : {}}>✓ No</button>
                <button onClick={() => setTieneErrores(true)} className={`py-4 rounded-card border-2 font-barlow-condensed text-[20px] font-bold cursor-pointer transition-all ${tieneErrores === true ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-white border-border text-text-2'}`} style={tieneErrores === true ? { boxShadow: '0 4px 16px rgba(211,47,47,0.20)' } : {}}>✗ Sí</button>
              </div>

              {tieneErrores === true && (
                <>
                  <SLabel>Tipo de error</SLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(['faltante', 'sobrante'] as TipoError[]).map(t => (
                      <button key={t} onClick={() => toggleTipoError(t)} className={`rounded-btn border-[1.5px] font-barlow-condensed text-[17px] font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${tiposError.includes(t) ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}
                        style={{ minHeight: 52 }}>{t === 'faltante' ? '↓ Faltante' : '↑ Sobrante'}</button>
                    ))}
                  </div>
                  {tiposError.length === 2 && <div className="text-[11px] text-info text-center mt-1 font-semibold">Ambos → Cruce</div>}
                  {tiposError.length > 0 && (
                    <div className="mt-3">
                      {productos.length > 0 && (
                        <div className="mb-2">{productos.map((p, i) => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return <div key={i} className="flex items-center gap-2 bg-white border border-border rounded-btn px-3 py-2 mb-1.5" style={{ boxShadow: '0 1px 3px rgba(26,37,80,0.05)' }}><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{p.tipo}</span><span className="font-mono text-[11px] text-text-3 flex-shrink-0">[{p.codigo}]</span><span className="text-[12px] text-text flex-1 truncate">{p.nombre}</span><span className={`font-bold text-[13px] flex-shrink-0 ${p.tipo === 'faltante' ? 'text-red' : 'text-warn'}`}>{r}</span><button onClick={() => setProductos(prev => prev.filter((_, j) => j !== i))} className="text-red/50 hover:text-red border-none bg-transparent cursor-pointer text-[18px] leading-none flex-shrink-0 px-1">×</button></div>; })}
                        </div>
                      )}
                      <ProductSearch odooConfig={odooConfig} tiposError={tiposError} operacionCodes={operaciones.map(op => op.codigo)} onAdd={p => setProductos(prev => [...prev, p])} onNeedConfig={() => showToast('Configura NEXT_PUBLIC_ODOO_* en .env.local', '#D97706')} />
                    </div>
                  )}
                </>
              )}

              {tieneErrores !== null && !(tieneErrores && tiposError.length === 0) && (
                <>
                  <SLabel>Corrección <span className="text-[9px] font-normal ml-1 normal-case">automática</span></SLabel>
                  <div className={`py-3.5 px-4 rounded-card border-2 font-barlow-condensed text-[20px] font-bold text-center ${CORR_COLOR[correccion]}`}>{CORR_LABEL[correccion]}</div>
                  <SLabel>Resultado <span className="text-[9px] font-normal ml-1 normal-case">automático</span></SLabel>
                  <div className={`py-5 rounded-card border-2 font-barlow-condensed text-[26px] font-extrabold text-center ${resultado === 'bueno' ? 'bg-[rgba(22,163,74,0.12)] border-success text-success' : 'bg-[rgba(211,47,47,0.12)] border-red text-red'}`}
                    style={resultado === 'bueno' ? { boxShadow: '0 4px 16px rgba(22,163,74,0.18)' } : { boxShadow: '0 4px 16px rgba(211,47,47,0.18)' }}>
                    {resultado === 'bueno' ? '✓ BUENO' : '✗ MALO'}
                  </div>
                </>
              )}
            </AccordionSection>

            {/* ── SECCIÓN 4: EVIDENCIA ── */}
            <AccordionSection title="Evidencia" badge="opcional" open={sections.evidencia} onToggle={() => toggleSection('evidencia')}>
              <SLabel>Observaciones <span className="text-[9px] font-normal ml-1 normal-case">opcional</span></SLabel>
              <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej: pallet mal rotulado, caja dañada, producto húmedo…" rows={3}
                className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[14px] outline-none focus:border-navy resize-none [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />

              {/* Fotos de errores — solo si hubo errores */}
              {tieneErrores === true && (
                <>
                  <SLabel>Fotos de errores <span className="text-[9px] font-normal ml-1 normal-case">evidencia del error detectado · múltiples</span></SLabel>
                  {errorFotoPreviews.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {errorFotoPreviews.map((preview, idx) => (
                        <div key={idx} className="relative rounded-card overflow-hidden border-2 border-red/30" style={{ boxShadow: '0 2px 8px rgba(211,47,47,0.10)' }}>
                          <img src={preview} alt={`Error ${idx + 1}`} className="w-full object-cover" style={{ aspectRatio: '1', objectFit: 'cover' }} />
                          <div className="absolute top-1 left-2 text-[10px] font-bold text-white bg-red/80 rounded px-1.5 py-0.5">Error #{idx + 1}</div>
                          <button
                            onClick={() => {
                              URL.revokeObjectURL(preview);
                              setErrorFotoPreviews(p => p.filter((_, i) => i !== idx));
                              setErrorFotoFiles(f => f.filter((_, i) => i !== idx));
                            }}
                            className="absolute top-1 right-1 bg-red text-white border-none rounded-full w-6 h-6 text-[14px] leading-none cursor-pointer flex items-center justify-center font-bold"
                            style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.30)' }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-dashed border-red/30 rounded-card cursor-pointer hover:border-red/50 transition-colors active:bg-bg" style={{ boxShadow: '0 1px 4px rgba(211,47,47,0.06)' }}>
                    <span className="text-[28px]">🚨</span>
                    <div>
                      <div className="text-[13px] text-red font-barlow font-semibold">
                        {errorFotoPreviews.length > 0 ? `+ Agregar más (${errorFotoPreviews.length} foto${errorFotoPreviews.length !== 1 ? 's' : ''} de error)` : 'Fotografiar el error'}
                      </div>
                      <div className="text-[11px] text-text-3">Selecciona una o varias fotos del error</div>
                    </div>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        if (!files.length) return;
                        setErrorFotoFiles(prev => [...prev, ...files]);
                        setErrorFotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
                        e.target.value = '';
                      }} />
                  </label>
                </>
              )}

              <SLabel>Fotos de productos <span className="text-[9px] font-normal ml-1 normal-case">opcional · múltiples permitidas</span></SLabel>
              {fotoPreviews.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {fotoPreviews.map((preview, idx) => (
                    <div key={idx} className="relative rounded-card overflow-hidden border border-border" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.08)' }}>
                      <img src={preview} alt={`Foto ${idx + 1}`} className="w-full object-cover" style={{ aspectRatio: '1', objectFit: 'cover' }} />
                      <div className="absolute top-1 left-2 text-[10px] font-bold text-white bg-black/50 rounded px-1.5 py-0.5">#{idx + 1}</div>
                      <button
                        onClick={() => {
                          URL.revokeObjectURL(preview);
                          setFotoPreviews(p => p.filter((_, i) => i !== idx));
                          setFotoFiles(f => f.filter((_, i) => i !== idx));
                        }}
                        className="absolute top-1 right-1 bg-red text-white border-none rounded-full w-6 h-6 text-[14px] leading-none cursor-pointer flex items-center justify-center font-bold"
                        style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.30)' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-dashed border-border rounded-card cursor-pointer hover:border-navy/40 transition-colors active:bg-bg" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
                <span className="text-[28px]">📷</span>
                <div>
                  <div className="text-[13px] text-text-2 font-barlow font-semibold">
                    {fotoPreviews.length > 0 ? `+ Agregar más (${fotoPreviews.length} foto${fotoPreviews.length !== 1 ? 's' : ''} de producto)` : 'Adjuntar fotos de productos'}
                  </div>
                  <div className="text-[11px] text-text-3">Selecciona una o varias fotos a la vez</div>
                </div>
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    setFotoFiles(prev => [...prev, ...files]);
                    setFotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
                    e.target.value = '';
                  }} />
              </label>
            </AccordionSection>

            <button onClick={handleSubmitClick} disabled={!canSubmit || submitting}
              className="w-full mt-4 py-4 bg-navy text-white border-none rounded-card font-barlow-condensed text-[22px] font-bold tracking-wide cursor-pointer disabled:opacity-30 transition-all active:scale-[0.99]"
              style={{ background: canSubmit && !submitting ? 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)' : undefined, boxShadow: canSubmit && !submitting ? '0 6px 24px rgba(26,37,80,0.40)' : 'none' }}>
              {submitting ? '⏳ Guardando…' : '✓ Registrar auditoría'}
            </button>
          </div>}
        </div>

        {/* RIGHT: STATS PANEL (desktop only, not for admin-auditoria or auditor) */}
        {!isAdminAud && !isAuditorOnly && (
          <div className="hidden md:flex md:flex-1 overflow-hidden">
            <StatsPanel history={history} today={today} onReaudit={iniciarReauditoria} odooConfig={odooConfig} pickerNames={PICKER_NAMES} onRefresh={loadHistory} />
          </div>
        )}
        {/* RIGHT: ADMIN DESKTOP PANEL (dashboard + ranking + historial) */}
        {isAdminAud && (
          <div className="hidden md:flex md:flex-1 overflow-hidden border-l border-border flex-col">
            <AdminDesktopPanel history={history} today={today} odooConfig={odooConfig} pickerNames={PICKER_NAMES} onReaudit={e => { iniciarReauditoria(e); }} onRefresh={loadHistory} />
          </div>
        )}
      </div>

      {/* ── MOBILE OVERLAYS (not for admin-auditoria) ── */}
      {!isAdminAud && view === 'dashboard' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
            <div className="flex-1"><div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Dashboard</div><div className="text-[11px] text-white/40">{today} · {todayEntries.length} auditorías</div></div>
          </div>
          <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={PICKER_NAMES} /></div>
        </div>
      )}
      {!isAdminAud && view === 'ranking' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Ranking Pickers</div>
          </div>
          <RankingContent history={history} odooConfig={odooConfig} pickerNames={PICKER_NAMES} />
        </div>
      )}
      {!isAdminAud && view === 'history' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Historial</div>
          </div>
          <HistoryContent history={history} today={today} onReaudit={iniciarReauditoria} onExportPDF={exportarPDF} onRefresh={loadHistory} pickerNames={PICKER_NAMES} />
        </div>
      )}

      {/* ── MOBILE MENU ── */}
      {!isAdminAud && mobileMenuOpen && (
        <MobileMenu
          onlyHistory={isAuditorOnly}
          onClose={() => setMobileMenuOpen(false)}
          onNavigate={v => { setView(v); setMobileMenuOpen(false); }}
        />
      )}

      {/* ── TIPO CHANGE WARNING (#7) ── */}
      {tipoPending !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTipoPending(null)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="font-barlow-condensed text-[18px] font-bold text-navy mb-2">¿Cambiar tipo?</div>
            <div className="text-[13px] text-text-2 mb-4">Las fotos adjuntas se eliminarán al cambiar el tipo de contenido.</div>
            <div className="flex gap-2">
              <button onClick={() => setTipoPending(null)} className="flex-1 py-3 border border-border rounded-card font-barlow-condensed text-[15px] font-bold text-text-2 cursor-pointer">Cancelar</button>
              <button onClick={() => { setTipo(tipoPending!); setTipoPending(null); }} className="flex-1 py-3 bg-navy text-white rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)' }}>Sí, cambiar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM SUBMIT MODAL (#6) ── */}
      {confirmSubmit && tienda && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmSubmit(false)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="font-barlow-condensed text-[20px] font-bold text-navy mb-3">Confirmar registro</div>
            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between items-start py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Auditor</span>
                <span className="font-semibold text-text text-[13px] text-right ml-4">{auditor}</span>
              </div>
              <div className="flex justify-between items-start py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Tienda</span>
                <span className="font-semibold text-text text-[13px] text-right ml-4">{tienda.nombre}</span>
              </div>
              {pickerNombre && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-text-3 text-[12px]">Picker</span>
                  <span className="font-semibold text-text text-[13px]">{pickerNombre}</span>
                </div>
              )}
              {picker && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-text-3 text-[12px]">Id. pistola</span>
                  <span className="font-mono font-semibold text-text text-[13px]">{picker.replace('Pickers ', 'P.')}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Tipo</span>
                <span className="font-semibold text-text text-[13px] capitalize">{tipo}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Pallets</span>
                <span className="font-semibold text-text text-[13px]">{pallets}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-text-3 text-[12px]">Resultado</span>
                <span className={`font-barlow-condensed font-bold text-[20px] ${resultado === 'bueno' ? 'text-success' : 'text-red'}`}>{resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}</span>
              </div>
              {tieneErrores && productos.length > 0 && (
                <div className="text-[11px] text-text-3 italic">{productos.length} producto{productos.length !== 1 ? 's' : ''} con error · {tiposError.join(', ')}</div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSubmit(false)} className="flex-1 py-3 border border-border rounded-card font-barlow-condensed text-[15px] font-bold text-text-2 cursor-pointer">Cancelar</button>
              <button onClick={handleSubmit} className="flex-1 py-3 text-white rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════ Admin Desktop Right Panel (dashboard + ranking + historial tabs) ════ */
function AdminDesktopPanel({ history, today, odooConfig, pickerNames, onReaudit, onRefresh }: {
  history: AuditEntry[]; today: string; odooConfig: OdooConfig;
  pickerNames: Record<string, string>; onReaudit: (e: AuditEntry) => void; onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking' | 'historial'>('dashboard');
  const tabs = [
    { key: 'dashboard' as const, label: '📊 Dashboard' },
    { key: 'ranking' as const, label: '🏆 Ranking' },
    { key: 'historial' as const, label: '📋 Historial' },
  ];
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-bg">
      <div className="flex border-b border-border bg-white flex-shrink-0">
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-[12px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer ${tab === key ? 'border-navy text-navy' : 'border-transparent text-text-3'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'dashboard' && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={pickerNames} /></div>}
        {tab === 'ranking'   && <RankingContent history={history} odooConfig={odooConfig} pickerNames={pickerNames} />}
        {tab === 'historial' && <HistoryContent history={history} today={today} onReaudit={onReaudit} onRefresh={onRefresh} pickerNames={pickerNames} />}
      </div>
    </div>
  );
}

/* ════ Admin-Auditoria Stats Screen ════ */
function AdminAudStats({ history, today, odooConfig, onBack, pickerNames }: {
  history: AuditEntry[]; today: string; odooConfig: OdooConfig; onBack: () => void; pickerNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking'>('dashboard');
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        <button onClick={onBack} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
        <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Estadísticas</div>
      </div>
      <div className="flex border-b border-border bg-white flex-shrink-0">
        {([['dashboard', '📊 Dashboard del día'], ['ranking', '🏆 Ranking de Pickers']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 text-[13px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer ${tab === key ? 'border-navy text-navy' : 'border-transparent text-text-3'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'dashboard' && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={pickerNames} /></div>}
        {tab === 'ranking'   && <RankingContent history={history} odooConfig={odooConfig} pickerNames={pickerNames} />}
      </div>
    </div>
  );
}

/* ════ Producción Diaria Panel ════ */
function ProduccionPanel({ onBack, pickerNombresList }: {
  onBack: () => void;
  pickerNombresList: string[];
}) {
  const todayStr = metricasTodayISO();
  const [fecha,        setFecha]        = useState(todayStr);
  const [produccion,   setProduccion]   = useState<Record<string, string>>({});
  const [saved,        setSaved]        = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [configPickers, setConfigPickers] = useState<string[]>([]);

  // Cargar pickers desde picker_config si no vienen por prop
  useEffect(() => {
    const list = pickerNombresList.length > 0 ? pickerNombresList : [];
    if (list.length > 0) { setConfigPickers(list); return; }
    supabase.from('picker_config').select('picker_nombres').eq('id', 1).single()
      .then(({ data }) => { if (Array.isArray(data?.picker_nombres)) setConfigPickers(data.picker_nombres as string[]); });
  }, [pickerNombresList]);

  // Cargar producción guardada para la fecha seleccionada
  useEffect(() => {
    supabase.from('produccion_diaria').select('picker_nombre, pallets_producidos').eq('fecha', fecha)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((r: { picker_nombre: string; pallets_producidos: number }) => {
          map[r.picker_nombre] = String(r.pallets_producidos);
        });
        setProduccion(map);
      });
  }, [fecha]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    const rows = Object.entries(produccion)
      .filter(([, v]) => v !== '' && !isNaN(parseInt(v)))
      .map(([picker_nombre, v]) => ({ picker_nombre, fecha, pallets_producidos: parseInt(v) }));
    if (rows.length === 0) { setSaving(false); setError('Ingresa al menos un valor.'); return; }
    const { error: err } = await supabase
      .from('produccion_diaria')
      .upsert(rows, { onConflict: 'picker_nombre,fecha' });
    if (err) { setError(err.message); } else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  };

  const pickers = configPickers.length > 0 ? configPickers : [];

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #92400E 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(146,64,14,0.35)' }}>
        <button onClick={onBack} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Producción diaria</div>
          <div className="text-[11px] text-white/50 uppercase tracking-widest">Pallets producidos por picker</div>
        </div>
        <button onClick={handleSave} disabled={saving || pickers.length === 0}
          className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
          style={{ background: saved ? 'rgba(22,163,74,0.9)' : 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
          {saving ? '⏳' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto flex flex-col gap-4">

          {/* Selector de fecha */}
          <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="text-[12px] font-bold text-text-2 uppercase tracking-wide mb-2">Fecha</div>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={todayStr}
              className="w-full border border-border rounded-btn px-3 py-2.5 text-[15px] text-text font-barlow outline-none focus:border-navy [-webkit-appearance:none]"
              style={{ background: 'white' }} />
          </div>

          {/* Tabla de pickers */}
          {pickers.length === 0 ? (
            <div className="text-center py-10 text-text-3">
              <div className="text-[36px] mb-2">👷</div>
              <div className="text-[14px] font-barlow-condensed">Sin pickers configurados.</div>
              <div className="text-[12px] mt-1">Agrega pickers en Configuración primero.</div>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="px-4 py-3 border-b border-border">
                <div className="font-barlow-condensed text-[16px] font-bold text-navy">Pallets producidos · {fecha}</div>
                <div className="text-[11px] text-text-3 mt-0.5">Ingresa 0 o deja vacío si el picker no trabajó hoy</div>
              </div>
              <div className="divide-y divide-border/60">
                {pickers.map(nombre => (
                  <div key={nombre} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[13px]"
                      style={{ background: '#1a2550' }}>
                      {nombre.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <span className="flex-1 text-[14px] font-semibold text-text">{nombre}</span>
                    <input
                      type="number" inputMode="numeric" min="0" max="999"
                      value={produccion[nombre] ?? ''}
                      onChange={e => setProduccion(p => ({ ...p, [nombre]: e.target.value }))}
                      placeholder="0"
                      className="w-20 border border-border rounded-btn px-3 py-2 text-[16px] text-center font-barlow text-text font-bold outline-none focus:border-navy [-webkit-appearance:none]"
                      style={{ background: 'white' }}
                    />
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 bg-bg border-t border-border text-[11px] text-text-3">
                Total: <strong className="text-navy">{Object.values(produccion).reduce((s, v) => s + (parseInt(v) || 0), 0)} pallets</strong>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red text-center px-3 py-2.5 rounded-card border border-red/20"
              style={{ background: 'rgba(211,47,47,0.06)' }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════ Config Panel ════ */
function ConfigPanel({ onBack, onSaved, userRole }: {
  onBack: () => void;
  onSaved: (pickerNombresList: string[], auditores: string[]) => void;
  userRole?: string;
}) {
  const [pickerList,   setPickerList]   = useState<string[]>([]);
  const [newPicker,    setNewPicker]    = useState('');
  const [auditores,    setAuditores]    = useState<string[]>([]);
  const [newAuditor,   setNewAuditor]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');

  // Parámetros de métricas
  const [params,       setParams]       = useState<Parametros | null>(null);
  const [savingParams, setSavingParams] = useState(false);
  const [savedParams,  setSavedParams]  = useState(false);
  const [minimoCalc,   setMinimoCalc]   = useState(73);

  useEffect(() => {
    supabase.from('picker_config').select('nombres, auditores, picker_nombres').eq('id', 1).single()
      .then(({ data }) => {
        if (Array.isArray(data?.picker_nombres) && (data.picker_nombres as string[]).length > 0) {
          setPickerList(data.picker_nombres as string[]);
        } else if (data?.nombres && typeof data.nombres === 'object' && !Array.isArray(data.nombres)) {
          const vals = Object.values(data.nombres as Record<string, string>).filter(Boolean);
          if (vals.length > 0) setPickerList(Array.from(new Set(vals)).sort());
        }
        if (Array.isArray(data?.auditores)) setAuditores(data.auditores as string[]);
      });
    fetchParametros().then(p => { setParams(p); setMinimoCalc(calcMinimo(p.nivel_confianza_z, p.margen_error)); });
  }, []);

  const addPicker = () => {
    const name = newPicker.trim();
    if (!name || pickerList.includes(name)) return;
    setPickerList(prev => [...prev, name].sort());
    setNewPicker('');
  };
  const removePicker = (name: string) => setPickerList(prev => prev.filter(p => p !== name));

  const addAuditor = () => {
    const name = newAuditor.trim();
    if (!name || auditores.includes(name)) return;
    setAuditores(prev => [...prev, name].sort());
    setNewAuditor('');
  };

  const removeAuditor = (name: string) => setAuditores(prev => prev.filter(a => a !== name));

  const handleSave = async () => {
    setSaving(true); setError('');
    const { error: err } = await supabase
      .from('picker_config')
      .upsert({ id: 1, picker_nombres: pickerList, auditores, updated_at: new Date().toISOString() });
    if (err) {
      setError(err.message);
    } else {
      onSaved(pickerList, auditores);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', boxShadow: '0 2px 16px rgba(15,118,110,0.35)' }}>
        <button onClick={onBack} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Configuración</div>
          <div className="text-[11px] text-white/50 uppercase tracking-widest">{userRole === 'admin' ? 'Admin' : 'Admin Auditoría'}</div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
          style={{ background: saved ? 'rgba(22,163,74,0.9)' : 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
          {saving ? '⏳ Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
        <ProfilePill compact />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-5">

          {/* Picker names section */}
          <div className="bg-white border border-border rounded-card overflow-hidden"
            style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.06)' }}>
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <span className="text-[20px]">👷</span>
              <div>
                <div className="font-barlow-condensed text-[17px] font-bold text-navy">Pickers (armadores de pallet)</div>
                <div className="text-[11px] text-text-3">Nombres disponibles para seleccionar en el formulario · Odoo asigna el número</div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {/* Add new */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPicker}
                  onChange={e => setNewPicker(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPicker(); } }}
                  placeholder="Nombre del picker…"
                  className="flex-1 bg-white border border-border rounded-btn px-3 py-2 text-[14px] text-text outline-none focus:border-navy transition-colors [-webkit-appearance:none]"
                />
                <button
                  onClick={addPicker}
                  disabled={!newPicker.trim()}
                  className="px-4 py-2 rounded-btn font-barlow-condensed text-[14px] font-bold text-white cursor-pointer disabled:opacity-40 active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                  + Agregar
                </button>
              </div>
              {/* List */}
              {pickerList.length === 0 && (
                <div className="text-center text-text-3 text-[12px] py-3 italic">Sin pickers configurados aún</div>
              )}
              {pickerList.map(name => (
                <div key={name} className="flex items-center justify-between px-3 py-2.5 bg-bg rounded-btn border border-border">
                  <span className="text-[14px] font-semibold text-text">{name}</span>
                  <button onClick={() => removePicker(name)}
                    className="border-none bg-transparent text-text-3 hover:text-red cursor-pointer text-[18px] leading-none px-1 transition-colors">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Auditor list section */}
          <div className="bg-white border border-border rounded-card overflow-hidden"
            style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.06)' }}>
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <span className="text-[20px]">👤</span>
              <div>
                <div className="font-barlow-condensed text-[17px] font-bold text-navy">Auditores</div>
                <div className="text-[11px] text-text-3">Lista de auditores disponibles para seleccionar en el formulario</div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {/* Add new */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAuditor}
                  onChange={e => setNewAuditor(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAuditor(); } }}
                  placeholder="Nombre del auditor…"
                  className="flex-1 bg-white border border-border rounded-btn px-3 py-2 text-[14px] text-text outline-none focus:border-navy transition-colors [-webkit-appearance:none]"
                />
                <button
                  onClick={addAuditor}
                  disabled={!newAuditor.trim()}
                  className="px-4 py-2 rounded-btn font-barlow-condensed text-[14px] font-bold text-white cursor-pointer disabled:opacity-40 active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)' }}>
                  + Agregar
                </button>
              </div>
              {/* List */}
              {auditores.length === 0 && (
                <div className="text-center text-text-3 text-[12px] py-3 italic">Sin auditores configurados aún</div>
              )}
              {auditores.map(name => (
                <div key={name} className="flex items-center justify-between px-3 py-2.5 bg-bg rounded-btn border border-border">
                  <span className="text-[14px] font-semibold text-text">{name}</span>
                  <button onClick={() => removeAuditor(name)}
                    className="border-none bg-transparent text-text-3 hover:text-red cursor-pointer text-[18px] leading-none px-1 transition-colors">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Parámetros de métricas */}
          {params && (
            <div className="bg-white border border-border rounded-card overflow-hidden"
              style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.06)' }}>
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[20px]">📐</span>
                  <div>
                    <div className="font-barlow-condensed text-[17px] font-bold text-navy">Parámetros de métricas</div>
                    <div className="text-[11px] text-text-3">Sistema de bono y auditoría estadística</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setSavingParams(true);
                    await saveParametros(params);
                    setSavingParams(false); setSavedParams(true);
                    setTimeout(() => setSavedParams(false), 2500);
                  }}
                  disabled={savingParams}
                  className="px-3 py-1.5 rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: savedParams ? 'rgba(22,163,74,0.15)' : 'rgba(26,37,80,0.08)', color: savedParams ? '#16A34A' : '#1a2550', border: '1px solid', borderColor: savedParams ? '#16A34A' : 'rgba(26,37,80,0.15)' }}>
                  {savingParams ? '⏳' : savedParams ? '✓ Guardado' : 'Guardar'}
                </button>
              </div>
              <div className="p-4 flex flex-col gap-4">
                {/* Nivel de confianza */}
                <div>
                  <div className="text-[12px] font-bold text-text-2 mb-1.5">Nivel de confianza</div>
                  <div className="flex gap-2">
                    {([['1.645', '90%'], ['1.96', '95%'], ['2.576', '99%']] as const).map(([z, lbl]) => (
                      <button key={z} onClick={() => { const p = { ...params, nivel_confianza_z: parseFloat(z) }; setParams(p); setMinimoCalc(calcMinimo(parseFloat(z), p.margen_error)); }}
                        className="flex-1 py-2 rounded-btn border text-[13px] font-bold cursor-pointer transition-all"
                        style={params.nivel_confianza_z === parseFloat(z) ? { background: '#1a2550', color: '#fff', borderColor: '#1a2550' } : { background: 'white', color: '#374151', borderColor: '#E5E7EB' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margen de error */}
                <div>
                  <div className="text-[12px] font-bold text-text-2 mb-1.5">Margen de error</div>
                  <div className="flex gap-2">
                    {([['0.03', '±3%'], ['0.05', '±5%'], ['0.10', '±10%']] as const).map(([e, lbl]) => (
                      <button key={e} onClick={() => { const p = { ...params, margen_error: parseFloat(e) }; setParams(p); setMinimoCalc(calcMinimo(p.nivel_confianza_z, parseFloat(e))); }}
                        className="flex-1 py-2 rounded-btn border text-[13px] font-bold cursor-pointer transition-all"
                        style={params.margen_error === parseFloat(e) ? { background: '#1a2550', color: '#fff', borderColor: '#1a2550' } : { background: 'white', color: '#374151', borderColor: '#E5E7EB' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mínimo calculado automáticamente */}
                <div className="px-3 py-2.5 rounded-btn border border-info/30" style={{ background: 'rgba(37,99,235,0.05)' }}>
                  <div className="text-[11px] text-info font-bold uppercase tracking-wide mb-0.5">Mínimo calculado automáticamente</div>
                  <div className="font-barlow-condensed text-[24px] font-extrabold text-navy">{minimoCalc} <span className="text-[14px] font-normal text-text-3">pallets por picker</span></div>
                  <div className="text-[10px] text-text-3 mt-0.5">CEIL((Z² × 0.95 × 0.05) / e²) con Z={params.nivel_confianza_z}, e={params.margen_error}</div>
                </div>

                {/* Umbral bono */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <div className="text-[12px] font-bold text-text-2">Efectividad mínima para bono (%)</div>
                    <div className="font-barlow-condensed text-[16px] font-bold text-navy">{params.umbral_bono_pct}%</div>
                  </div>
                  <input type="range" min={70} max={100} step={1} value={params.umbral_bono_pct}
                    onChange={e => setParams(p => p ? { ...p, umbral_bono_pct: parseInt(e.target.value) } : p)}
                    className="w-full" style={{ accentColor: '#1a2550' }} />
                  <div className="flex justify-between text-[10px] text-text-3 mt-0.5"><span>70%</span><span>100%</span></div>
                </div>

                {/* Meta cobertura diaria */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <div className="text-[12px] font-bold text-text-2">Meta de cobertura diaria (%)</div>
                    <div className="font-barlow-condensed text-[16px] font-bold text-navy">{params.cobertura_diaria_meta}%</div>
                  </div>
                  <input type="range" min={10} max={100} step={5} value={params.cobertura_diaria_meta}
                    onChange={e => setParams(p => p ? { ...p, cobertura_diaria_meta: parseInt(e.target.value) } : p)}
                    className="w-full" style={{ accentColor: '#1a2550' }} />
                  <div className="flex justify-between text-[10px] text-text-3 mt-0.5"><span>10%</span><span>100%</span></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red text-center px-3 py-2.5 rounded-card border border-red/20"
              style={{ background: 'rgba(211,47,47,0.06)' }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
