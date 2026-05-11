'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { supabase } from '../../lib/supabase';

/* ── Supabase ↔ AuditEntry converters ── */
function entryToRow(entry: AuditEntry, userId: string) {
  return {
    id: entry.id, user_id: userId,
    fecha: entry.fecha, hora: entry.hora,
    auditor: entry.auditor, picker: entry.picker ?? '',
    tienda_cod: entry.tiendaCod, tienda_nombre: entry.tiendaNombre, tienda_area: entry.tiendaArea,
    tipo: entry.tipo, operaciones: entry.operaciones, pallets: entry.pallets,
    tiene_errores: entry.tieneErrores, tipos_error: entry.tiposError,
    correccion: entry.correccion, resultado: entry.resultado,
    observaciones: entry.observaciones, reauditoria_de_id: entry.reauditoriaDeId ?? null,
    productos: entry.productos,
  };
}
function rowToEntry(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as string, fecha: r.fecha as string, hora: r.hora as string,
    auditor: r.auditor as string, picker: r.picker as string,
    tiendaCod: r.tienda_cod as string, tiendaNombre: r.tienda_nombre as string,
    tiendaArea: r.tienda_area as AuditEntry['tiendaArea'],
    tipo: r.tipo as TipoAuditoria, operaciones: (r.operaciones as OperacionEntry[]) ?? [],
    pallets: r.pallets as number, tieneErrores: r.tiene_errores as boolean,
    tiposError: (r.tipos_error as TipoError[]) ?? [],
    correccion: r.correccion as CorreccionAuditoria, resultado: r.resultado as ResultadoAuditoria,
    observaciones: r.observaciones as string,
    reauditoriaDeId: r.reauditoria_de_id as string | undefined,
    productos: (r.productos as ProductoError[]) ?? [],
  };
}
import { TODAS_LAS_TIENDAS } from './data/todasLasTiendas';
import { PICKERS_LIST, PICKER_NAMES, getPickerDisplay, matchOdooResponsable } from './data/pickerNames';
import { buscarOperaciones, buscarProducto, getOdooConfig, saveOdooConfig, getPickerOdooStats } from './utils/odooApi';
import type { PickerOdooStats } from './utils/odooApi';
import { sheetsAuditoriaWrite } from './utils/sheetsAuditoria';
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

/* ── Odoo Config Modal ── */
function OdooConfigModal({ initial, onSave, onClose }: { initial: OdooConfig; onSave: (c: OdooConfig) => void; onClose: () => void }) {
  const [cfg, setCfg] = useState<OdooConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dbList, setDbList] = useState<string[]>([]);
  const [dbListLoading, setDbListLoading] = useState(false);
  const set = (k: keyof OdooConfig, v: string) => { setCfg(p => ({ ...p, [k]: v })); setTestResult(null); if (k === 'url') setDbList([]); };
  const detectarDbs = async () => {
    if (!cfg.url) { setTestResult({ ok: false, msg: 'Ingresa la URL primero.' }); return; }
    setDbListLoading(true); setDbList([]);
    try { const res = await fetch('/api/odoo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_databases', config: cfg }) }); const data = (await res.json()) as { databases?: string[]; error?: string }; if (res.ok && data.databases?.length) setDbList(data.databases); else setTestResult({ ok: false, msg: data.error || 'Error' }); } catch { setTestResult({ ok: false, msg: 'Error de red' }); } finally { setDbListLoading(false); }
  };
  const probarConexion = async () => {
    if (!cfg.url || !cfg.db || !cfg.username || !cfg.apiKey) { setTestResult({ ok: false, msg: 'Completa todos los campos.' }); return; }
    setTesting(true); setTestResult(null);
    try { const res = await fetch('/api/odoo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test_connection', config: cfg }) }); const data = (await res.json()) as { ok?: boolean; message?: string; error?: string }; setTestResult(res.ok && data.ok ? { ok: true, msg: `✓ Conexión exitosa. ${data.message ?? ''}` } : { ok: false, msg: data.error || 'Error' }); } catch { setTestResult({ ok: false, msg: 'Error de red' }); } finally { setTesting(false); }
  };
  return (
    <div className="fixed inset-0 z-[600] bg-navy/60 backdrop-blur-sm flex items-end">
      <div className="bg-white rounded-t-[20px] w-full px-4 pb-10 pt-5 max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.22)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />
        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1">Configurar Odoo</h3>
        <p className="text-[13px] text-text-3 mb-4">Credenciales para operaciones, productos y pickers</p>
        {([['url', 'URL del servidor', 'kiosclub.odoo.com', 'text'], ['username', 'Usuario / Email', 'admin@empresa.com', 'text'], ['apiKey', 'Contraseña / API Key', '', 'password']] as const).map(([k, label, placeholder, type]) => (
          <div key={k} className="mb-3"><label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide block mb-1">{label}</label><input type={type} value={cfg[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" /></div>
        ))}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1"><label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide">Base de datos</label><button onClick={detectarDbs} disabled={dbListLoading || !cfg.url} className="text-[11px] font-bold text-navy border-none bg-transparent cursor-pointer disabled:opacity-40 flex items-center gap-1 px-0">{dbListLoading ? <><div className="w-2.5 h-2.5 border border-navy/30 border-t-navy rounded-full animate-spin" />Detectando…</> : '🔍 Detectar'}</button></div>
          <input type="text" value={cfg.db} onChange={e => set('db', e.target.value)} placeholder="nombre_base_de_datos" className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
          {dbList.length > 0 && <div className="mt-1.5 border border-border rounded-btn overflow-hidden">{dbList.map(d => <button key={d} onClick={() => { set('db', d); setDbList([]); }} className={`w-full text-left px-3 py-2 font-mono text-[14px] border-b border-border/40 last:border-b-0 cursor-pointer ${cfg.db === d ? 'bg-[rgba(26,37,80,0.08)] text-navy font-bold' : 'bg-white text-text hover:bg-bg'}`}>{d}</button>)}</div>}
        </div>
        {testResult && <div className={`mt-1 mb-3 px-3 py-2.5 rounded-btn text-[13px] border ${testResult.ok ? 'bg-[rgba(22,163,74,0.08)] border-success text-success' : 'bg-[rgba(211,47,47,0.07)] border-red text-red'}`}>{testResult.msg}</div>}
        <button onClick={probarConexion} disabled={testing} className="w-full py-3 mb-3 border-2 border-dashed border-navy/30 rounded-btn text-navy/70 font-barlow-condensed text-[15px] font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 bg-transparent">{testing ? <><div className="w-3 h-3 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />Probando…</> : '⚡ Probar conexión'}</button>
        <div className="flex gap-2.5"><button onClick={onClose} className="flex-1 py-3.5 bg-bg-2 text-text-2 rounded-card font-barlow-condensed text-lg font-bold border-none cursor-pointer">Cancelar</button><button onClick={() => { onSave(cfg); onClose(); }} className="flex-1 py-3.5 bg-navy text-white rounded-card font-barlow-condensed text-lg font-bold border-none cursor-pointer" style={{ boxShadow: '0 4px 16px rgba(26,37,80,0.28)' }}>Guardar</button></div>
      </div>
    </div>
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

/* ── Product Search ── */
function ProductSearch({ odooConfig, tiposError, operacionCodes, onAdd, onNeedConfig }: {
  odooConfig: OdooConfig; tiposError: TipoError[]; operacionCodes: string[];
  onAdd: (p: ProductoError) => void; onNeedConfig: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState<ProductoOdoo | null>(null);
  const [error, setError] = useState('');
  const [unidades, setUnidades] = useState('');
  const [tipoProd, setTipoProd] = useState<TipoError>(tiposError[0] ?? 'faltante');
  useEffect(() => { if (!tiposError.includes(tipoProd)) setTipoProd(tiposError[0] ?? 'faltante'); /* eslint-disable-next-line */ }, [tiposError]);
  const buscar = async () => {
    if (!odooConfig.url) { onNeedConfig(); return; }
    const cod = codigo.replace(/[\[\]]/g, '').trim().toUpperCase(); if (!cod) return;
    setLoading(true); setError(''); setFound(null);
    try { const prod = await buscarProducto(odooConfig, cod, operacionCodes.filter(Boolean)); if (prod) setFound(prod); else setError(`"${cod}" no encontrado`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); } finally { setLoading(false); }
  };
  const confirmar = () => {
    if (!found || !unidades || parseInt(unidades) <= 0) return;
    onAdd({ codigo: found.codigo, nombre: found.nombre, unidades: parseInt(unidades), tipo: tipoProd, cantidadEsperada: found.cantidadEsperada });
    setCodigo(''); setFound(null); setUnidades(''); setError('');
  };
  const ratioPreview = useMemo(() => {
    if (!found?.cantidadEsperada || !unidades || isNaN(parseInt(unidades))) return null;
    const u = parseInt(unidades); if (u <= 0) return null;
    return { auditado: calcAuditado(u, tipoProd, found.cantidadEsperada), esperado: found.cantidadEsperada, delta: tipoProd === 'faltante' ? -u : +u };
  }, [found, unidades, tipoProd]);
  return (
    <div className="border border-dashed border-navy/20 rounded-card p-3 bg-bg">
      <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Agregar producto</div>
      <div className="flex gap-2">
        <input type="text" value={codigo} onChange={e => { setCodigo(e.target.value); setFound(null); setError(''); }} onKeyDown={e => e.key === 'Enter' && buscar()} placeholder="[NLAVINF031]"
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
    </div>
  );
}

/* ── Picker Card (improved ranking card) ── */
function PickerCard({ stats, rank, trend, odooConfig, compact = false }: {
  stats: PickerStats; rank: number; trend: WeekTrend[];
  odooConfig: OdooConfig; compact?: boolean;
}) {
  const [odooStats, setOdooStats] = useState<PickerOdooStats | null>(null);
  const [loadingOdoo, setLoadingOdoo] = useState(false);
  const [odooError, setOdooError] = useState('');

  const ec = effColor(stats.eficiencia);
  const pc = effColor(stats.pct);
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const realName = PICKER_NAMES[stats.picker];
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
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: `${ec}18` }}>
            {medal ?? <span className="font-bold text-[14px]" style={{ color: ec }}>{rank}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-barlow-condensed text-[18px] font-bold text-navy leading-tight">{realName || stats.picker}</div>
            {realName && <div className="text-[11px] text-text-3">{stats.picker}</div>}
            <div className="text-[12px] text-text-3 mt-0.5">{stats.bueno} buenos · {stats.malo} malos · {stats.total} total</div>
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
function DashboardContent({ history, today }: { history: AuditEntry[]; today: string }) {
  const [period, setPeriod] = useState<DashPeriod>('hoy');

  const entries = useMemo(() => {
    if (period === 'hoy') return history.filter(e => e.fecha === today);
    if (period === 'total') return history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (period === 'semana' ? 7 : 30));
    return history.filter(e => { const d = parseEsCL(e.fecha); return d !== null && d >= cutoff; });
  }, [history, period, today]);

  const buenosH = entries.filter(e => e.resultado === 'bueno').length;
  const pct = entries.length ? Math.round((buenosH / entries.length) * 100) : 0;
  const palletsH = entries.reduce((s, e) => s + e.pallets, 0);
  const erroresH = entries.filter(e => e.tieneErrores).length;

  const pickerMap = new Map<string, { b: number; t: number }>();
  entries.forEach(e => { if (!e.picker) return; if (!pickerMap.has(e.picker)) pickerMap.set(e.picker, { b: 0, t: 0 }); const s = pickerMap.get(e.picker)!; s.t++; if (e.resultado === 'bueno') s.b++; });
  const topPicker = Array.from(pickerMap.entries()).sort((a, b) => (b[1].b / (b[1].t || 1)) - (a[1].b / (a[1].t || 1)))[0];

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
          style={period === p
            ? { background: '#1a2550', color: '#fff' }
            : { background: 'rgba(26,37,80,0.07)', color: '#6B7280' }}>
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );

  if (entries.length === 0) return (
    <div className="p-4">
      {periodSelector}
      <div className="text-center py-12 text-text-3"><div className="text-[40px] mb-3">📊</div><div className="text-[16px] font-barlow-condensed">Sin auditorías en este período.</div></div>
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      {periodSelector}
      <div className="text-[11px] text-text-3 text-center -mt-1 mb-0.5">
        {entries.length} auditorías · todos los auditores
      </div>
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Auditorías', value: entries.length, color: '#1a2550', bg: 'rgba(26,37,80,0.06)' },
          { label: '% Aprobación', value: `${pct}%`, color: pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F', bg: pct >= 80 ? 'rgba(22,163,74,0.08)' : pct >= 60 ? 'rgba(217,119,6,0.08)' : 'rgba(211,47,47,0.08)' },
          { label: 'Pallets totales', value: palletsH, color: '#2563EB', bg: 'rgba(37,99,235,0.06)' },
          { label: 'Con errores', value: erroresH, color: erroresH > 0 ? '#D32F2F' : '#16A34A', bg: erroresH > 0 ? 'rgba(211,47,47,0.07)' : 'rgba(22,163,74,0.07)' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="rounded-card p-3.5 text-center border border-border" style={{ background: bg, boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="font-barlow-condensed text-[38px] font-extrabold leading-tight" style={{ color }}>{value}</div>
            <div className="text-[11px] text-text-3 uppercase tracking-wide mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Top picker */}
      {topPicker && (
        <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
          <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2.5">⭐ Mejor picker hoy</div>
          <div className="flex items-center gap-3">
            <div className="text-[32px]">🥇</div>
            <div className="flex-1">
              <div className="font-barlow-condensed text-[20px] font-bold text-navy">{getPickerDisplay(topPicker[0])}</div>
              {PICKER_NAMES[topPicker[0]] && <div className="text-[11px] text-text-3">{topPicker[0]}</div>}
              <div className="text-[12px] text-text-2 mt-0.5">{topPicker[1].b}/{topPicker[1].t} buenos hoy</div>
            </div>
            <div className="font-barlow-condensed text-[36px] font-extrabold text-success">{Math.round((topPicker[1].b / topPicker[1].t) * 100)}%</div>
          </div>
        </div>
      )}

      {/* Correction breakdown */}
      <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-3">Distribución de correcciones</div>
        <div className="flex rounded-full overflow-hidden h-5 mb-3">
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

      {/* Top error stores */}
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

      {/* Recent audits */}
      <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mb-2">Últimas auditorías</div>
        {entries.slice(0, 6).map(e => (
          <div key={e.id} className="flex items-center gap-2.5 py-2 border-b border-border/40 last:border-0">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${e.resultado === 'bueno' ? 'bg-success' : 'bg-red'}`} />
            <span className="text-[12px] text-text-2 flex-shrink-0 w-10">{e.hora}</span>
            <span className="text-[13px] font-medium text-text flex-1 truncate">{e.tiendaNombre}</span>
            {e.picker && <span className="text-[11px] text-text-3 flex-shrink-0">{getPickerDisplay(e.picker)}</span>}
            <span className={`font-barlow-condensed text-[13px] font-bold flex-shrink-0 ${e.resultado === 'bueno' ? 'text-success' : 'text-red'}`}>{e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Ranking Content ── */
function RankingContent({ history, odooConfig }: { history: AuditEntry[]; odooConfig: OdooConfig }) {
  const [scope, setScope] = useState<'hoy' | 'total'>('total');
  const [rView, setRView] = useState<'barras' | 'semanal'>('barras');
  const [selectedPickers, setSelectedPickers] = useState<string[]>([]);
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
                {rankingData.map((s, i) => (
                  <PickerCard key={s.picker} stats={s} rank={i + 1} trend={computeWeeklyTrend(history, s.picker)} odooConfig={odooConfig} />
                ))}
                {(() => {
                  const activos = new Set(rankingData.map(r => r.picker));
                  const sin = PICKERS_LIST.filter(p => !activos.has(p));
                  if (!sin.length) return null;
                  return (
                    <div className="mt-2">
                      <div className="text-[11px] text-text-3 uppercase tracking-wide mb-2">Sin auditorías en este período</div>
                      <div className="flex flex-wrap gap-1.5">{sin.map(p => <span key={p} className="text-[11px] text-text-3 bg-bg-2 border border-border px-2.5 py-1 rounded-full">{getPickerDisplay(p)}</span>)}</div>
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
                      {getPickerDisplay(r.picker).replace('Pickers ', 'P.')}
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
                  <span className="text-text-2">{getPickerDisplay(p)}</span>
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
function HistoryContent({ history, today, onReaudit, onExportPDF }: {
  history: AuditEntry[]; today: string;
  onReaudit: (e: AuditEntry) => void;
  onExportPDF?: (entries: AuditEntry[], fecha: string) => void;
}) {
  const [histFecha, setHistFecha] = useState(today);
  const fechasDisponibles = useMemo(() => Array.from(new Set(history.map(e => e.fecha))).sort((a, b) => b.localeCompare(a)), [history]);
  const filtrado = history.filter(e => e.fecha === (histFecha || today));

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 bg-white border-b border-border flex items-center gap-2 flex-shrink-0 overflow-x-auto">
        {fechasDisponibles.length === 0 ? <span className="text-[12px] text-text-3">Sin registros</span>
          : fechasDisponibles.map(f => <button key={f} onClick={() => setHistFecha(f)} className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-bold border cursor-pointer ${histFecha === f ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>{f === today ? 'Hoy' : f}</button>)}
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
            <div key={e.id} className="bg-white border border-border rounded-card p-3.5 mb-2.5" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.05)' }}>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-barlow-condensed text-base font-bold text-navy">{e.tiendaNombre}</div>
                    {e.reauditoriaDeId && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info border border-info/20">↩ Re</span>}
                  </div>
                  <div className="text-[11px] text-text-3 mt-0.5">{e.hora} · {e.auditor}{e.picker ? ` · ${getPickerDisplay(e.picker)}` : ''}</div>
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
              {e.resultado === 'malo' && <button onClick={() => onReaudit(e)} className="w-full py-2 border border-dashed border-info/40 rounded-btn text-info text-[12px] font-bold cursor-pointer bg-transparent transition-all">↩ Re-auditar</button>}
            </div>
          ))}
      </div>
    </div>
  );
}

/* ── Desktop Stats Panel ── */
function StatsPanel({ history, today, onReaudit, odooConfig }: {
  history: AuditEntry[]; today: string;
  onReaudit: (e: AuditEntry) => void; odooConfig: OdooConfig;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking' | 'history'>('dashboard');
  return (
    <div className="flex flex-col h-full bg-bg">
      <div className="flex border-b border-border bg-white flex-shrink-0">
        {([['dashboard', '📊 Dashboard'], ['ranking', '🏆 Ranking'], ['history', '📋 Historial']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 text-[13px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer ${tab === key ? 'border-navy text-navy bg-[rgba(26,37,80,0.02)]' : 'border-transparent text-text-3 bg-white'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'dashboard' && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} /></div>}
        {tab === 'ranking' && <RankingContent history={history} odooConfig={odooConfig} />}
        {tab === 'history' && <HistoryContent history={history} today={today} onReaudit={onReaudit} onExportPDF={exportarPDF} />}
      </div>
    </div>
  );
}

/* ── Mobile Menu ── */
function MobileMenu({ onClose, onNavigate }: { onClose: () => void; onNavigate: (v: 'dashboard' | 'history' | 'ranking') => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] overflow-hidden" style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.22)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mt-4 mb-1" />
        <div className="p-4 pb-8 space-y-2">
          {([
            { icon: '📊', label: 'Dashboard del día', sub: 'KPIs y métricas de hoy', v: 'dashboard' as const },
            { icon: '🏆', label: 'Ranking de Pickers', sub: 'Eficiencia y estadísticas de unidades', v: 'ranking' as const },
            { icon: '📋', label: 'Historial', sub: 'Auditorías por fecha + exportar PDF', v: 'history' as const },
          ]).map(({ icon, label, sub, v }) => (
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
  const { signOut, user } = useAuth();
  const { showToast, state } = useApp();
  const router = useRouter();

  const [auditor,           setAuditor]           = useState('');
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

  const [showOdooConf,   setShowOdooConf]   = useState(false);
  const [odooConfig,     setOdooConfig]     = useState<OdooConfig>({ url: '', db: '', username: '', apiKey: '' });
  const [view,           setView]           = useState<'form' | 'history' | 'ranking' | 'dashboard'>('form');
  const [history,        setHistory]        = useState<AuditEntry[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const cfg = getOdooConfig(); if (cfg) setOdooConfig(cfg);
    (async () => {
      const { data, error } = await supabase
        .from('audit_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (data && !error && data.length > 0) {
        setHistory(data.map(r => rowToEntry(r as Record<string, unknown>)));
      } else {
        // Fallback: localStorage (migration / offline)
        try {
          const h = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
          setHistory(h.slice(-200).reverse());
        } catch { /* empty */ }
      }
    })();
  }, []);
  useEffect(() => { setOperaciones(TIPO_TO_SUBTIPOS[tipo].map(st => ({ subTipo: st, codigo: '' }))); }, [tipo]);
  useEffect(() => { if (!tieneErrores) { setTiposError([]); setProductos([]); } }, [tieneErrores]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (tiendaRef.current && !tiendaRef.current.contains(e.target as Node)) setTiendaOpen(false); };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);

  const correccion = useMemo<CorreccionAuditoria>(() => {
    if (!tieneErrores) return 'correcto';
    const f = tiposError.includes('faltante'), s = tiposError.includes('sobrante');
    if (f && s) return 'cruce'; if (f) return 'faltante'; if (s) return 'sobrante'; return 'correcto';
  }, [tieneErrores, tiposError]);
  const resultado = useMemo<ResultadoAuditoria>(() => correccion === 'correcto' ? 'bueno' : 'malo', [correccion]);

  const tiendaFiltered = TODAS_LAS_TIENDAS.filter(t => {
    const q = tiendaQuery.toLowerCase();
    return !q || t.nombre.toLowerCase().includes(q) || t.cod.toLowerCase().includes(q) || t.region.toLowerCase().includes(q);
  });

  const updateOperacion = (i: number, codigo: string) => setOperaciones(ops => ops.map((op, j) => j === i ? { ...op, codigo } : op));

  const handleOpSelect = (codigo: string, responsable: string | undefined) => {
    if (responsable && !picker) {
      const match = matchOdooResponsable(responsable);
      if (match) { setPicker(match); showToast(`Picker detectado: ${getPickerDisplay(match)}`, '#2563EB'); }
    }
    void codigo;
  };

  const toggleTipoError = (t: TipoError) => { setTiposError(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]); setProductos([]); };

  const canSubmit = !!auditor.trim() && !!tienda && operaciones.every(op => op.codigo.trim()) && !!pallets && parseInt(pallets) > 0 && tieneErrores !== null && (!tieneErrores || tiposError.length > 0);

  const handleSubmit = () => {
    if (!auditor.trim()) { showToast('Ingresa el nombre del auditor', '#D97706'); return; }
    if (!tienda) { showToast('Selecciona una tienda', '#D97706'); return; }
    if (operaciones.some(op => !op.codigo.trim())) { showToast('Completa todas las operaciones', '#D97706'); return; }
    if (!pallets || parseInt(pallets) <= 0) { showToast('Ingresa la cantidad de pallets', '#D97706'); return; }
    if (tieneErrores === null) { showToast('Indica si hubo errores', '#D97706'); return; }
    if (tieneErrores && tiposError.length === 0) { showToast('Selecciona el tipo de error', '#D97706'); return; }
    const now = new Date();
    const entry: AuditEntry = {
      id: `AUD-${Date.now()}`, fecha: now.toLocaleDateString('es-CL'), hora: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      auditor: auditor.trim(), picker: picker.trim(), tiendaCod: tienda.cod, tiendaNombre: tienda.nombre, tiendaArea: tienda.area,
      tipo, operaciones, pallets: parseInt(pallets), tieneErrores: tieneErrores === true, tiposError, productos,
      correccion, resultado, observaciones: observaciones.trim(), reauditoriaDeId: reauditoriaOrigen?.id,
    };
    setHistory([entry, ...history.slice(0, 199)]);
    if (user) {
      supabase.from('audit_entries').insert(entryToRow(entry, user.id))
        .then(({ error }) => { if (error) console.error('Audit save:', error.message); });
    }
    try { const prev = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[]; prev.push(entry); localStorage.setItem('auditHistory', JSON.stringify(prev.slice(-200))); } catch { /* empty */ }
    sheetsAuditoriaWrite(entry, state.sheetsUrl);
    showToast(`✓ Auditoría — ${resultado === 'bueno' ? 'BUENO' : 'MALO'}`, resultado === 'bueno' ? '#16A34A' : '#D32F2F');
    setTienda(null); setTiendaQuery(''); setPicker(''); setTipo('comida'); setPallets('');
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones(''); setReauditoriaOrigen(null);
  };

  const iniciarReauditoria = (entry: AuditEntry) => {
    setReauditoriaOrigen(entry);
    setTienda(TODAS_LAS_TIENDAS.find(t => t.cod === entry.tiendaCod) ?? null);
    setTiendaQuery(''); setTipo(entry.tipo); setPicker(entry.picker || '');
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones('');
    setView('form');
  };

  const today = new Date().toLocaleDateString('es-CL');
  const todayEntries = useMemo(() => history.filter(e => e.fecha === today), [history, today]);

  /* ════ RENDER ════ */
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── HEADER ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        <button onClick={() => router.push('/')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Inicio</button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase">Auditoría</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">Control de calidad pallet</div>
        </div>
        {/* Mobile: hamburger + config + logout */}
        <div className="flex md:hidden items-center gap-1">
          <button onClick={() => setShowOdooConf(true)} className="border-none bg-white/10 text-white/60 text-[15px] cursor-pointer px-2.5 py-1.5 rounded-full">⚙</button>
          <button onClick={() => setMobileMenuOpen(true)} className="border-none bg-white/15 text-white text-[17px] font-bold cursor-pointer px-2.5 py-1.5 rounded-full">☰</button>
          <button onClick={async () => { await signOut(); }} className="border-none bg-white/8 text-white/45 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-full">Salir</button>
        </div>
        {/* Desktop: config + logout */}
        <div className="hidden md:flex items-center gap-1">
          <button onClick={() => setShowOdooConf(true)} className="border-none bg-white/10 text-white/60 text-[15px] cursor-pointer px-2.5 py-1.5 rounded-full">⚙</button>
          <button onClick={async () => { await signOut(); }} className="border-none bg-white/8 text-white/45 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-full hover:text-white/70 transition-colors">Salir</button>
        </div>
      </div>

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: FORM */}
        <div className="flex-1 md:flex-none md:w-[420px] lg:w-[460px] overflow-y-auto md:border-r md:border-border">
          <div className="px-4 pb-8">

            {/* Re-audit banner */}
            {reauditoriaOrigen && (
              <div className="mt-4 flex items-center gap-2 bg-[rgba(37,99,235,0.08)] border border-info/30 rounded-card px-3 py-2.5">
                <span className="text-info text-[18px]">↩</span>
                <div className="flex-1 min-w-0"><div className="text-[12px] font-bold text-info">Re-auditoría</div><div className="text-[11px] text-text-3 truncate">Original: {reauditoriaOrigen.tiendaNombre} · {reauditoriaOrigen.hora} · {CORR_LABEL[reauditoriaOrigen.correccion]}</div></div>
                <button onClick={() => setReauditoriaOrigen(null)} className="border-none bg-transparent text-text-3 cursor-pointer text-[18px] leading-none px-1">×</button>
              </div>
            )}

            <SLabel>Auditor</SLabel>
            <input type="text" value={auditor} onChange={e => setAuditor(e.target.value)} placeholder="Nombre del auditor"
              className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-barlow text-[16px] outline-none focus:border-navy [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />

            <SLabel>Picker (armador del pallet)</SLabel>
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {PICKERS_LIST.map((p, i) => {
                const real = PICKER_NAMES[p];
                const isSelected = picker === p;
                return (
                  <button key={p} onClick={() => setPicker(prev => prev === p ? '' : p)}
                    className={`py-2 px-1 rounded-btn border font-barlow-condensed text-[12px] font-bold cursor-pointer transition-all flex flex-col items-center leading-tight ${isSelected ? 'bg-[rgba(26,37,80,0.10)] border-navy text-navy' : 'border-border bg-white text-text-3'}`}>
                    <span className="text-[11px] font-bold">{`P.${i + 1}`}</span>
                    {real && <span className="text-[9px] font-normal truncate w-full text-center">{real.split(' ')[0]}</span>}
                  </button>
                );
              })}
            </div>
            {picker && (
              <div className="text-center text-[12px] text-navy font-semibold py-1 px-3 bg-[rgba(26,37,80,0.05)] rounded-btn border border-navy/10">
                {getPickerDisplay(picker)}{PICKER_NAMES[picker] ? ` — ${picker}` : ''}
              </div>
            )}

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

            <SLabel>Tipo de contenido</SLabel>
            <div className="grid grid-cols-3 gap-1.5">
              {TIPOS.map(({ value, label }) => (
                <button key={value} onClick={() => setTipo(value)} className={`py-2.5 rounded-btn border-[1.5px] font-barlow-condensed text-[14px] font-bold cursor-pointer transition-all ${tipo === value ? TIPO_COLOR[value] : 'border-border bg-white text-text-2'}`}>{label}</button>
              ))}
            </div>

            <SLabel>Operaciones Odoo <span className="text-[10px] font-normal normal-case ml-1">({operaciones.length} op{operaciones.length !== 1 ? 's' : '.'})</span></SLabel>
            {operaciones.map((op, i) => (
              <OperacionInput key={op.subTipo} subTipo={op.subTipo} codigo={op.codigo}
                onChange={v => updateOperacion(i, v)} onSelect={handleOpSelect}
                odooConfig={odooConfig} onNeedConfig={() => setShowOdooConf(true)} />
            ))}

            <SLabel>Pallets auditados</SLabel>
            <input type="number" inputMode="numeric" min="1" max="99" value={pallets} onChange={e => setPallets(e.target.value)} placeholder="0"
              className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-barlow text-[28px] text-center outline-none focus:border-navy [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />

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
                    <button key={t} onClick={() => toggleTipoError(t)} className={`py-3 rounded-btn border-[1.5px] font-barlow-condensed text-[15px] font-bold cursor-pointer transition-all ${tiposError.includes(t) ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}>{t === 'faltante' ? '↓ Faltante' : '↑ Sobrante'}</button>
                  ))}
                </div>
                {tiposError.length === 2 && <div className="text-[11px] text-info text-center mt-1 font-semibold">Ambos → Cruce</div>}
                {tiposError.length > 0 && (
                  <div className="mt-3">
                    {productos.length > 0 && (
                      <div className="mb-2">{productos.map((p, i) => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return <div key={i} className="flex items-center gap-2 bg-white border border-border rounded-btn px-3 py-2 mb-1.5" style={{ boxShadow: '0 1px 3px rgba(26,37,80,0.05)' }}><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{p.tipo}</span><span className="font-mono text-[11px] text-text-3 flex-shrink-0">[{p.codigo}]</span><span className="text-[12px] text-text flex-1 truncate">{p.nombre}</span><span className={`font-bold text-[13px] flex-shrink-0 ${p.tipo === 'faltante' ? 'text-red' : 'text-warn'}`}>{r}</span><button onClick={() => setProductos(prev => prev.filter((_, j) => j !== i))} className="text-red/50 hover:text-red border-none bg-transparent cursor-pointer text-[18px] leading-none flex-shrink-0 px-1">×</button></div>; })}
                      </div>
                    )}
                    <ProductSearch odooConfig={odooConfig} tiposError={tiposError} operacionCodes={operaciones.map(op => op.codigo)} onAdd={p => setProductos(prev => [...prev, p])} onNeedConfig={() => setShowOdooConf(true)} />
                  </div>
                )}
              </>
            )}

            {tieneErrores !== null && (
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

            <SLabel>Observaciones <span className="text-[9px] font-normal ml-1 normal-case">opcional</span></SLabel>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej: pallet mal rotulado, caja dañada, producto húmedo…" rows={3}
              className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[14px] outline-none focus:border-navy resize-none [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />

            <button onClick={handleSubmit} disabled={!canSubmit}
              className="w-full mt-4 py-4 bg-navy text-white border-none rounded-card font-barlow-condensed text-[22px] font-bold tracking-wide cursor-pointer disabled:opacity-30 transition-all active:scale-[0.99]"
              style={{ background: canSubmit ? 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)' : undefined, boxShadow: canSubmit ? '0 6px 24px rgba(26,37,80,0.40)' : 'none' }}>
              ✓ Registrar auditoría
            </button>
          </div>
        </div>

        {/* RIGHT: STATS PANEL (desktop only) */}
        <div className="hidden md:flex md:flex-1 overflow-hidden">
          <StatsPanel history={history} today={today} onReaudit={iniciarReauditoria} odooConfig={odooConfig} />
        </div>
      </div>

      {/* ── MOBILE OVERLAYS ── */}
      {view === 'dashboard' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
            <div className="flex-1"><div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Dashboard</div><div className="text-[11px] text-white/40">{today} · {todayEntries.length} auditorías</div></div>
          </div>
          <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} /></div>
        </div>
      )}
      {view === 'ranking' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Ranking Pickers</div>
          </div>
          <RankingContent history={history} odooConfig={odooConfig} />
        </div>
      )}
      {view === 'history' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')} className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">← Volver</button>
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Historial</div>
          </div>
          <HistoryContent history={history} today={today} onReaudit={iniciarReauditoria} onExportPDF={exportarPDF} />
        </div>
      )}

      {/* ── MOBILE MENU ── */}
      {mobileMenuOpen && <MobileMenu onClose={() => setMobileMenuOpen(false)} onNavigate={v => { setView(v); setMobileMenuOpen(false); }} />}

      {/* ── ODOO CONFIG ── */}
      {showOdooConf && (
        <OdooConfigModal initial={odooConfig}
          onSave={cfg => { saveOdooConfig(cfg); setOdooConfig(cfg); showToast('✓ Config Odoo guardada', '#16A34A'); }}
          onClose={() => setShowOdooConf(false)} />
      )}
    </div>
  );
}
