'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Ruta } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';
import { supabase } from '@/lib/supabase';

/* ── Detalle ítem-a-ítem por tienda (para el manifiesto por tienda) ── */
export interface ItemDetalle {
  canonical_id: string;
  tipo: string;      // P | B | C | CH
  seq: number | null;
  contenido: string;
  peso_kg: number | null;
  alto: number | null;
  largo: number | null;
  ancho: number | null;
  refs: string;      // guías/DTE separadas por +
}

/* ── Types ─────────────────────────────────────────────── */
interface TiendaManifiesto {
  store_cod: string;
  nombre: string;
  ventana: string;
  orden: number;
  pallets: number;
  bultos: number;
  chocolates: number;
  contenedores: number;
}

interface ManifiestoData {
  idx: number;
  id?: number;
  codigo_ruta: string;
  fecha: string;
  chofer: string;
  patente: string;
  bodega_origen: string;
  estado: string;
  token_qr?: string;
  tiendas: TiendaManifiesto[];
  total_pallets: number;
  total_bultos: number;
  total_chocolates: number;
}

interface Props {
  rutas: Ruta[];
  fecha: string;
  supervisor: string;
  tiendas: Record<string, TiendaInfo & { _parada?: boolean }>;
  isOpen: boolean;
  onClose: () => void;
}

/* ── Helpers ────────────────────────────────────────────── */
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_camino: 'En Camino',
  entregado: 'Entregado',
  recibido:  'Recibido',
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#FF9500',
  en_camino: '#007AFF',
  entregado: '#34C759',
  recibido:  '#8E8E93',
};

function codigoRuta(fecha: string, i: number): string {
  const [y, m, d] = fecha.split('-');
  return `RUTA-${d}${m}${y.slice(2)}-${String(i + 1).padStart(2, '0')}`;
}

function infoTienda(cod: string, tiendas: Record<string, TiendaInfo & { _parada?: boolean }>) {
  return tiendas[cod] ?? tiendas[cod.toUpperCase()] ?? tiendas[cod.toLowerCase()] ?? { n: cod, v: '—', z: '—' };
}

function fromRuta(ruta: Ruta, idx: number, fecha: string, tiendas: Record<string, TiendaInfo & { _parada?: boolean }>): ManifiestoData {
  return {
    idx,
    codigo_ruta:   codigoRuta(fecha, idx),
    fecha,
    chofer:        ruta._choferAsignado || ruta.v.ch || 'Sin asignar',
    patente:       ruta.v.p,
    bodega_origen: 'Santiago',
    estado:        'pendiente',
    tiendas: ruta.ts.map((t, i) => {
      const info = infoTienda(t.c, tiendas);
      return { store_cod: t.c, nombre: info.n, ventana: info.v, orden: i + 1, pallets: t.p, bultos: t.b, chocolates: ((t as { ch?: number }).ch ?? 0), contenedores: 0 };
    }),
    total_pallets:    ruta.ts.reduce((s, t) => s + t.p, 0),
    total_bultos:     ruta.ts.reduce((s, t) => s + t.b, 0),
    total_chocolates: ruta.ts.reduce((s, t) => s + ((t as { ch?: number }).ch ?? 0), 0),
  };
}

/* ── Print helper (single) ──────────────────────────────── */
function buildManifiestoHTML(m: ManifiestoData, supervisor: string, origin: string): string {
  const qrUrl = m.token_qr ? `${origin}/r/${m.token_qr}` : `${origin}/despacho/estado`;
  const fechaLabel = new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  const genLabel   = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const filas = m.tiendas.map(t =>
    `<tr>
      <td style="width:28px;text-align:center;color:#444;">${t.orden}</td>
      <td><strong>${t.nombre}</strong> <span style="color:#555;font-size:10px;">(${t.store_cod})</span></td>
      <td style="text-align:center;color:#333;">${t.ventana}</td>
      <td style="text-align:center;font-weight:700;">${t.pallets}</td>
      <td style="text-align:center;font-weight:700;">${t.bultos}</td>
      <td style="text-align:center;font-weight:700;">${t.chocolates}</td>
    </tr>`
  ).join('');

  return `<div class="manifiesto-page">
<div class="hdr">
  <div>
    <img src="${origin}/logo-kiosclub.png" alt="KIOS Club" class="logo-img" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='block'"/>
    <div class="logo" style="display:none">KIOSClub</div>
    <div class="razon">Kiosclub American Supermarket SPA</div>
    <div class="rut">RUT 76.360.868-9</div>
    <div class="logo-sub">Centro de Distribución · Bodega ${m.bodega_origen}</div>
  </div>
  <div>
    <div class="title">MANIFIESTO DE RUTA</div>
    <div class="code-lbl">N° Manifiesto</div>
    <div class="code">${m.codigo_ruta}</div>
  </div>
</div>

<div class="meta">
  <div class="mi"><label>Fecha</label><span>${fechaLabel}</span></div>
  <div class="mi"><label>Patente</label><span>${m.patente}</span></div>
  <div class="mi"><label>Bodega Origen</label><span>${m.bodega_origen}</span></div>
  <div class="mi"><label>N° Tiendas</label><span>${m.tiendas.length}</span></div>
  <div class="mi"><label>Supervisor</label><span>${supervisor || '—'}</span></div>
</div>

<div class="sec">Tiendas destino (orden de entrega)</div>
<table>
  <thead><tr><th>#</th><th>Tienda</th><th>Ventana horaria</th><th>Pallets</th><th>Bultos</th><th>Choc.</th></tr></thead>
  <tbody>${filas}</tbody>
</table>

<div class="totals" style="grid-template-columns:repeat(4,1fr)">
  <div class="tc"><div class="n">${m.tiendas.length}</div><div class="l">Tiendas</div></div>
  <div class="tc"><div class="n">${m.total_pallets}</div><div class="l">Pallets</div></div>
  <div class="tc"><div class="n">${m.total_bultos}</div><div class="l">Bultos</div></div>
  <div class="tc"><div class="n">${m.total_chocolates}</div><div class="l">Choc.</div></div>
</div>

<div class="sec">Guías DTE asociadas</div>
<div style="padding:8px 12px;background:#f5f5f5;border-radius:5px;font-size:11px;color:#444;margin-bottom:14px;border:1px solid #ddd;">
  Las guías se vinculan desde Estado/Seguimiento. Escanee el QR para acceso digital completo.
</div>

<div class="sec">QR Maestro de Ruta</div>
<div class="qr-box">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrUrl)}" width="110" height="110" alt="QR Ruta"/>
  <div class="qr-info">
    <div class="badge">Pendiente</div>
    <h3>Acceso Digital Completo</h3>
    <p>Escanee para ver guías, estado de entrega, productos y folios SII asociados a esta ruta.</p>
    <p>Funciona para fiscalización rápida sin necesidad de guías físicas.</p>
    <div class="qr-url">${qrUrl}</div>
  </div>
</div>

<div class="firma-section">
  <div class="sec" style="margin-bottom:10px">Firmas y Conformidad</div>
  <div class="firma-box">
    <div class="firma">
      <div class="firma-hdr">Supervisor</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">RUT</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">Fecha</span><span class="firma-field-blank"></span></div>
      </div>
    </div>
    <div class="firma">
      <div class="firma-hdr">Chofer</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Patente</span><span class="firma-field-val">${m.patente}</span></div>
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">RUT</span><span class="firma-field-blank"></span></div>
      </div>
    </div>
    <div class="firma">
      <div class="firma-hdr">Tienda / Recepción</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">RUT</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">Fecha</span><span class="firma-field-blank"></span></div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  KiosClub · Centro de Distribución · Generado ${genLabel} · Sistema de Despacho v5.0
</div>
</div>`;
}

/* ── Manifiesto POR TIENDA (detalle ítem-a-ítem, para recepción) ── */
const TIPO_LABEL: Record<string, string> = { P: 'Pallet', B: 'Bulto', C: 'Contenedor', CH: 'Chocolate' };
const CONTENIDO_LABEL: Record<string, string> = {
  hogar: 'Hogar', comida: 'Comida', 'comida-hogar': 'Mixto', 'comida-aseo': 'Comida/Aseo',
  aseo: 'Aseo', chocolate: 'Chocolate', mixto: 'Mixto',
};

function guiasDeItems(items: ItemDetalle[]): string[] {
  const set = new Set<string>();
  for (const it of items) (it.refs || '').split('+').map(s => s.trim()).filter(Boolean).forEach(g => set.add(g));
  return [...set];
}

function buildManifiestoTiendaHTML(
  t: TiendaManifiesto,
  info: (TiendaInfo & { _parada?: boolean }) | undefined,
  items: ItemDetalle[],
  meta: { fecha: string; codigo_ruta: string; chofer: string; patente: string; supervisor: string; origin: string },
): string {
  const fechaLabel = new Date(meta.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  const nP  = items.filter(i => i.tipo === 'P').length;
  const nB  = items.filter(i => i.tipo === 'B').length;
  const nCH = items.filter(i => i.tipo === 'CH').length;
  const nC  = items.filter(i => i.tipo === 'C').length;
  const pesoTotal = Math.round(items.reduce((s, i) => s + (Number(i.peso_kg) || 0), 0) * 10) / 10;
  const guias = guiasDeItems(items);
  const qrUrl = `${meta.origin}/recepcion?cod=${encodeURIComponent(t.store_cod)}&p=${nP}&b=${nB + nCH}${guias.length ? `&g=${encodeURIComponent(guias.join(','))}` : ''}`;

  const filas = items.length ? items.map(it => {
    const dims = it.tipo === 'P' ? '120×100' : (it.alto && it.largo && it.ancho) ? `${it.alto}×${it.largo}×${it.ancho}` : '—';
    const guia = (it.refs || '').split('+').map(s => s.trim()).filter(Boolean).join(', ') || '—';
    return `<tr>
      <td style="width:26px;text-align:center;font-size:15px">☐</td>
      <td style="font-family:monospace;font-weight:700;font-size:10px">${it.canonical_id}</td>
      <td><strong>${it.tipo}${it.seq ?? ''}</strong> <span style="color:#555">${TIPO_LABEL[it.tipo] ?? it.tipo}</span></td>
      <td>${CONTENIDO_LABEL[it.contenido] ?? it.contenido}</td>
      <td style="text-align:center;font-weight:700">${it.peso_kg ?? '—'}</td>
      <td style="text-align:center;font-size:9px;color:#555">${dims}</td>
      <td style="font-size:9px;color:#444">${guia}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;color:#888;padding:16px">Sin detalle de ítems etiquetados para esta tienda.</td></tr>`;

  return `<div class="manifiesto-page">
<div class="hdr">
  <div>
    <img src="${meta.origin}/logo-kiosclub.png" alt="KIOS Club" class="logo-img" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='block'"/>
    <div class="logo" style="display:none">KIOSClub</div>
    <div class="razon">Kiosclub American Supermarket SPA</div>
    <div class="rut">RUT 76.360.868-9</div>
    <div class="logo-sub">Manifiesto de recepción · Tienda</div>
  </div>
  <div>
    <div class="title">RECEPCIÓN TIENDA</div>
    <div class="code-lbl">Manifiesto de ruta</div>
    <div class="code">${meta.codigo_ruta}</div>
  </div>
</div>

<div class="meta" style="grid-template-columns:repeat(2,1fr)">
  <div class="mi"><label>Tienda</label><span>${info?.n ?? t.nombre} (${t.store_cod})</span></div>
  <div class="mi"><label>Comuna / Zona</label><span>${info?.z ?? '—'}</span></div>
  <div class="mi"><label>Fecha</label><span>${fechaLabel}</span></div>
  <div class="mi"><label>Ventana horaria</label><span>${info?.v ?? t.ventana ?? '—'}</span></div>
  <div class="mi"><label>Patente / Chofer</label><span>${meta.patente} · ${meta.chofer}</span></div>
  <div class="mi"><label>Supervisor</label><span>${meta.supervisor || '—'}</span></div>
</div>

<div class="sec">Detalle de la carga — marque cada ítem al recibirlo (coteje el código con la etiqueta física)</div>
<table>
  <thead><tr><th>✓</th><th>Código etiqueta</th><th>Ítem</th><th>Contenido</th><th>Peso kg</th><th>Dimensiones</th><th>Guía / DTE</th></tr></thead>
  <tbody>${filas}</tbody>
</table>

<div class="totals" style="grid-template-columns:repeat(5,1fr)">
  <div class="tc"><div class="n">${nP}</div><div class="l">Pallets</div></div>
  <div class="tc"><div class="n">${nB}</div><div class="l">Bultos</div></div>
  <div class="tc"><div class="n">${nCH}</div><div class="l">Choc.</div></div>
  <div class="tc"><div class="n">${nC}</div><div class="l">Cont.</div></div>
  <div class="tc"><div class="n">${pesoTotal}</div><div class="l">Kg total</div></div>
</div>

<div class="sec">Guías / DTE asociadas (${guias.length})</div>
<div style="padding:8px 12px;background:#f5f5f5;border-radius:5px;font-size:11px;color:#333;margin-bottom:14px;border:1px solid #ddd;font-family:monospace">
  ${guias.length ? guias.join(' · ') : 'Sin guías registradas'}
</div>

<div class="qr-box">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrUrl)}" width="110" height="110" alt="QR Recepción"/>
  <div class="qr-info">
    <div class="badge" style="background:#34C759">Recepción digital</div>
    <h3>Escanee para recibir</h3>
    <p>Abre la recepción de esta tienda: descargar guías, confirmar cantidades y dejar observaciones.</p>
    <div class="qr-url">${qrUrl}</div>
  </div>
</div>

<div class="firma-section">
  <div class="sec" style="margin-bottom:10px">Conformidad de recepción</div>
  <div style="display:flex;gap:18px;font-size:11px;font-weight:700;color:#333;margin-bottom:10px">
    <span>☐ Recibido conforme</span><span>☐ Recibido con observaciones</span>
  </div>
  <div style="border:1px solid #ccc;border-radius:6px;padding:10px 12px;margin-bottom:12px">
    <div style="font-size:8px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:22px">Observaciones (faltantes / daños)</div>
  </div>
  <div class="firma-box" style="grid-template-columns:1fr 1fr">
    <div class="firma">
      <div class="firma-hdr">Entrega — Chofer</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Patente</span><span class="firma-field-val">${meta.patente}</span></div>
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-val">${meta.chofer}</span></div>
      </div>
    </div>
    <div class="firma">
      <div class="firma-hdr">Recepción — Tienda</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">RUT</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">Hora</span><span class="firma-field-blank"></span></div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  KiosClub · Comprobante de recepción por tienda · ${new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
</div>
</div>`;
}

const PRINT_STYLES = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:18px 20px;max-width:780px;margin:auto}
.manifiesto-page{page-break-after:always}
.manifiesto-page:last-child{page-break-after:auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C62828;padding-bottom:10px;margin-bottom:14px}
.logo{font-size:24px;font-weight:900;color:#C62828;letter-spacing:-1px}
.logo-img{height:52px;width:auto;display:block;margin-bottom:2px}
.razon{font-size:11px;font-weight:700;color:#1a2550;margin-top:3px}
.rut{font-size:10px;font-weight:600;color:#555;margin-top:1px}
.logo-sub{font-size:9px;color:#555;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
.title{font-size:20px;font-weight:900;color:#1a2550;text-align:right}
.code-lbl{font-size:8px;font-weight:700;color:#888;text-align:right;text-transform:uppercase;letter-spacing:.8px;margin-top:4px}
.code{font-size:15px;font-weight:800;color:#C62828;text-align:right;margin-top:1px}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#f0f2f5;padding:10px 14px;border-radius:6px;margin-bottom:14px}
.mi label{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.4px;display:block;font-weight:600}
.mi span{font-size:13px;font-weight:700;color:#111}
.sec{font-size:9px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:7px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
th{background:#1a2550;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px}
td{padding:5px 8px;border-bottom:1px solid #eee;color:#222}
tr:nth-child(even) td{background:#f8f8f8}
.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.tc{background:#1a2550;color:#fff;padding:8px;border-radius:5px;text-align:center}
.tc .n{font-size:26px;font-weight:900;line-height:1}
.tc .l{font-size:9px;text-transform:uppercase;opacity:.8;margin-top:2px}
.qr-box{display:flex;align-items:center;gap:14px;border:2px solid #1a2550;padding:12px 14px;border-radius:8px;margin-bottom:18px}
.qr-info h3{font-size:13px;font-weight:700;color:#1a2550;margin-bottom:3px}
.qr-info p{font-size:10px;color:#444;line-height:1.5}
.qr-url{font-size:8px;color:#888;font-family:monospace;margin-top:5px;word-break:break-all}
.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:#FF9500;color:#fff;margin-bottom:4px}
.footer{font-size:9px;color:#777;text-align:center;border-top:1px solid #ddd;padding-top:8px;margin-top:14px}
.firma-section{margin-top:18px}
.firma-box{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.firma{border:1.5px solid #bbb;border-radius:6px;overflow:hidden}
.firma-hdr{background:#1a2550;color:#fff;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;padding:7px 10px;text-align:center}
.firma-space{height:88px;background:#fafafa}
.firma-fields{border-top:1.5px solid #ccc;padding:10px 12px 12px}
.firma-field{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px dotted #bbb}
.firma-field:last-child{border-bottom:none}
.firma-field-lbl{font-size:8px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;min-width:46px;flex-shrink:0}
.firma-field-val{font-size:12px;font-weight:800;color:#1a2550;letter-spacing:.4px}
.firma-field-blank{flex:1;min-height:16px}
@media print{body{padding:8px 10px}}
`;

function imprimirManifiesto(m: ManifiestoData, supervisor: string, origin: string) {
  const body = buildManifiestoHTML(m, supervisor, origin);
  const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"/>
<title>Manifiesto ${m.codigo_ruta}</title>
<style>${PRINT_STYLES}</style>
</head><body>
${body}
<script>window.onload = () => { setTimeout(() => window.print(), 600); };<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=850,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ── Component ──────────────────────────────────────────── */
export default function ManifiestoPanel({ rutas, fecha, supervisor, tiendas, isOpen, onClose }: Props) {
  const [manifiestos, setManifiestos] = useState<ManifiestoData[]>([]);
  const [itemsByStore, setItemsByStore] = useState<Record<string, ItemDetalle[]>>({}); // detalle por tienda
  const [saving,  setSaving]  = useState<Record<number, boolean>>({});
  const [saved,   setSaved]   = useState<Record<number, boolean>>({});
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selección masiva
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allSelected = manifiestos.length > 0 && selected.size === manifiestos.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(Array.from({ length: manifiestos.length }, (_, i) => i)));
  const toggleOne = (i: number) => setSelected(prev => {
    const s = new Set(prev);
    s.has(i) ? s.delete(i) : s.add(i);
    return s;
  });

  // Rebuild whenever rutas changes (e.g. chofer re-assigned)
  useEffect(() => {
    setManifiestos(rutas.map((r, i) => fromRuta(r, i, fecha, tiendas)));
    setSaved({});
    setSelected(new Set());
  }, [rutas, fecha, tiendas]);

  // Detalle ítem-a-ítem por tienda (para el manifiesto por tienda). Toma, por tienda, los ítems
  // de su fecha MÁS RECIENTE en picking_pallets → sirve para 1ª vuelta (hoy) y 2ª vuelta (fecha origen).
  useEffect(() => {
    if (!isOpen) return;
    const cods = [...new Set(rutas.flatMap(r => r.ts.map(t => t.c)))];
    if (!cods.length) { setItemsByStore({}); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('picking_pallets')
        .select('store_cod, date, tipo, seq, canonical_id, contenido, peso_kg, alto, largo, ancho, refs')
        .in('store_cod', cods)
        .eq('is_active', true)
        .not('canonical_id', 'is', null)
        .order('date', { ascending: false })
        .order('tipo', { ascending: true })
        .order('seq', { ascending: true });
      if (cancelled || !data) return;
      const rows = data as (ItemDetalle & { store_cod: string; date: string })[];
      const latestDate: Record<string, string> = {};
      for (const r of rows) if (!latestDate[r.store_cod]) latestDate[r.store_cod] = r.date;
      const map: Record<string, ItemDetalle[]> = {};
      for (const r of rows) {
        if (r.date !== latestDate[r.store_cod]) continue; // solo la fecha vigente por tienda
        (map[r.store_cod] ??= []).push({
          canonical_id: r.canonical_id, tipo: r.tipo, seq: r.seq, contenido: r.contenido,
          peso_kg: r.peso_kg, alto: r.alto, largo: r.largo, ancho: r.ancho, refs: r.refs,
        });
      }
      setItemsByStore(map);
    })();
    return () => { cancelled = true; };
  }, [isOpen, rutas]);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const guardar = useCallback(async (idx: number) => {
    const m = manifiestos[idx];
    setSaving(prev => ({ ...prev, [idx]: true }));
    try {
      const res  = await fetch('/api/rutas-despacho', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha:         m.fecha,
          codigo_ruta:   m.codigo_ruta,
          chofer:        m.chofer,
          patente:       m.patente,
          bodega_origen: m.bodega_origen,
          tiendas:       m.tiendas,
          guias:         [],
        }),
      });
      const json = await res.json() as { data?: { id: number; token_qr: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error guardando');
      setManifiestos(prev => prev.map((item, i) =>
        i === idx ? { ...item, id: json.data!.id, token_qr: json.data!.token_qr } : item
      ));
      setSaved(prev => ({ ...prev, [idx]: true }));
      showToast(`✓ ${m.codigo_ruta} guardado`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error desconocido', false);
    } finally {
      setSaving(prev => ({ ...prev, [idx]: false }));
    }
  }, [manifiestos, showToast]);

  const actualizarEstado = useCallback(async (idx: number, estado: string) => {
    const m = manifiestos[idx];
    if (!m.id) { showToast('Guarda el manifiesto primero', false); return; }
    const res = await fetch('/api/rutas-despacho', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: m.id, estado }),
    });
    if (res.ok) {
      setManifiestos(prev => prev.map((item, i) => i === idx ? { ...item, estado } : item));
      showToast(`Estado → ${ESTADO_LABEL[estado]}`);
      // Registrar evento de trazabilidad
      const tipoEvento = estado === 'en_camino' ? 'salida' : estado === 'recibido' ? 'recepcion' : null;
      if (tipoEvento) {
        void fetch('/api/ruta-eventos', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ruta_id: m.id, tipo: tipoEvento, datos: { chofer: m.chofer, patente: m.patente } }),
        });
      }
    }
  }, [manifiestos, showToast]);

  const imprimir = useCallback((idx: number) => {
    imprimirManifiesto(manifiestos[idx], supervisor, window.location.origin);
  }, [manifiestos, supervisor]);

  const imprimirSeleccionados = useCallback(() => {
    const idxs = Array.from(selected);
    if (idxs.length === 0) return;
    const origin = window.location.origin;
    const bodies = idxs.map(i => buildManifiestoHTML(manifiestos[i], supervisor, origin)).join('\n');
    const titulo = idxs.length === 1
      ? `Manifiesto ${manifiestos[idxs[0]].codigo_ruta}`
      : `Manifiestos (${idxs.length})`;
    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"/>
<title>${titulo}</title>
<style>${PRINT_STYLES}</style>
</head><body>
${bodies}
<script>window.onload = () => { setTimeout(() => window.print(), 600); };<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  }, [selected, manifiestos, supervisor]);

  const guardarSeleccionados = useCallback(async () => {
    const idxs = Array.from(selected);
    for (const i of idxs) {
      await guardar(i);
    }
  }, [selected, guardar]);

  // Imprime las hojas POR TIENDA (detalle ítem-a-ítem) de una o varias rutas.
  const imprimirHojasTienda = useCallback((idxs: number[]) => {
    if (!idxs.length) return;
    const origin = window.location.origin;
    const bodies = idxs.flatMap(idx => {
      const m = manifiestos[idx];
      return m.tiendas.map(t => buildManifiestoTiendaHTML(
        t, tiendas[t.store_cod] ?? tiendas[t.store_cod.toUpperCase()], itemsByStore[t.store_cod] ?? [],
        { fecha: m.fecha, codigo_ruta: m.codigo_ruta, chofer: m.chofer, patente: m.patente, supervisor, origin },
      ));
    }).join('\n');
    const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"/>
<title>Manifiestos por tienda</title>
<style>${PRINT_STYLES}</style>
</head><body>
${bodies}
<script>window.onload = () => { setTimeout(() => window.print(), 600); };<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  }, [manifiestos, tiendas, itemsByStore, supervisor]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-knavy text-white flex-shrink-0"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.4)' }}>
        <div>
          <div className="font-barlow-condensed text-[20px] font-bold tracking-widest uppercase">
            Manifiestos de Ruta
          </div>
          <div className="text-white/50 text-[11px] mt-0.5">
            {rutas.length} ruta{rutas.length !== 1 ? 's' : ''} · {fecha}
          </div>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
          ✕
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-60 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white shadow-lg"
          style={{ background: toast.ok ? '#34C759' : '#FF3B30' }}>
          {toast.msg}
        </div>
      )}

      {/* Barra de acciones masivas */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 flex-shrink-0 text-sm bg-white/3">
        <label className="flex items-center gap-2 cursor-pointer text-text-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-4 h-4 rounded"
          />
          <span>Todos</span>
        </label>
        <span className="text-text-3">{selected.size} de {manifiestos.length}</span>
        <div className="flex-1" />
        <button
          onClick={imprimirSeleccionados}
          disabled={selected.size === 0}
          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40 bg-white/10 hover:bg-white/15"
        >
          🖨 Maestro ({selected.size})
        </button>
        <button
          onClick={() => imprimirHojasTienda(Array.from(selected))}
          disabled={selected.size === 0}
          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40 bg-white/10 hover:bg-white/15"
        >
          🏪 Hojas por tienda ({selected.size})
        </button>
        <button
          onClick={() => void guardarSeleccionados()}
          disabled={selected.size === 0}
          className="px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40 bg-navy/60 hover:bg-navy/80 text-white"
        >
          💾 Guardar ({selected.size})
        </button>
      </div>

      {/* Content — grid multi-columna */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {manifiestos.map((m, idx) => {
            const qrUrl     = m.token_qr ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${m.token_qr}` : '';
            const estadoCol = ESTADO_COLOR[m.estado] ?? '#8E8E93';
            const isSaved   = saved[idx];
            const isSaving  = saving[idx];
            const isChecked = selected.has(idx);

            return (
              <div key={idx} className="bg-white rounded-2xl shadow-xl overflow-hidden">

                {/* Manifiesto header */}
                <div className="flex items-start justify-between px-5 py-4"
                  style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(idx)}
                      className="w-4 h-4 rounded mt-1 flex-shrink-0"
                    />
                    <div>
                      <div className="font-barlow-condensed text-[22px] font-bold text-knavy tracking-wide leading-tight">
                        {m.codigo_ruta}
                      </div>
                      <div className="text-[12px] text-gray-400 mt-0.5">
                        {m.chofer} · {m.patente} · {m.bodega_origen}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white mt-0.5 flex-shrink-0"
                    style={{ background: estadoCol }}>
                    {ESTADO_LABEL[m.estado] ?? m.estado}
                  </span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 divide-x" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  {([[ m.tiendas.length, 'Tiendas' ], [ m.total_pallets, 'Pallets' ], [ m.total_bultos, 'Bultos' ]] as [number, string][]).map(([n, l]) => (
                    <div key={l} className="py-3 text-center">
                      <div className="text-[26px] font-extrabold leading-none" style={{ color: '#C62828' }}>{n}</div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>

                {/* Tiendas list */}
                <div className="px-5 py-4">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                    Tiendas destino · orden de entrega
                  </div>
                  <div className="space-y-0.5">
                    {m.tiendas.map((t) => (
                      <div key={t.store_cod} className="flex items-center justify-between py-1.5"
                        style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                            style={{ background: '#1a2550' }}>
                            {t.orden}
                          </span>
                          <div>
                            <div className="text-[13px] font-semibold text-gray-800 leading-tight">{t.nombre}</div>
                            <div className="text-[10px] text-gray-400">{t.store_cod} · {t.ventana}</div>
                          </div>
                        </div>
                        <div className="text-[11px] font-mono text-gray-500">
                          {t.pallets > 0 && <span className="mr-1">{t.pallets}P</span>}
                          {t.bultos > 0  && <span className="mr-1">{t.bultos}B</span>}
                          {t.chocolates > 0 && <span>{t.chocolates}CH</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* QR preview (only after saving) */}
                {m.token_qr && (
                  <div className="mx-5 mb-4 flex items-center gap-4 rounded-xl px-4 py-3"
                    style={{ background: 'rgba(26,37,80,0.04)', border: '1.5px solid rgba(26,37,80,0.1)' }}>
                    <div className="flex-shrink-0">
                      <QRCodeSVG value={qrUrl} size={72} level="M" />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-knavy">QR Maestro de Ruta</div>
                      <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                        Escanear para ver guías, estado y productos<br/>— funciona para fiscalización rápida
                      </div>
                    </div>
                  </div>
                )}

                {/* Estado buttons (only when saved) */}
                {isSaved && (
                  <div className="px-5 pb-3">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Actualizar estado</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(ESTADO_LABEL).map(([key, label]) => (
                        <button key={key}
                          onClick={() => void actualizarEstado(idx, key)}
                          className="px-3 py-1 rounded-full text-[10px] font-bold border transition-all"
                          style={m.estado === key
                            ? { background: ESTADO_COLOR[key], color: '#fff', borderColor: ESTADO_COLOR[key] }
                            : { background: '#fff', color: '#666', borderColor: '#e0e0e0' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 px-5 pb-5">
                  {!isSaved ? (
                    <button onClick={() => void guardar(idx)} disabled={isSaving}
                      className="flex-1 h-10 rounded-xl text-white text-[13px] font-bold transition-opacity disabled:opacity-50"
                      style={{ background: '#1a2550' }}>
                      {isSaving ? '⏳ Guardando…' : '💾 Guardar en Sistema'}
                    </button>
                  ) : (
                    <div className="flex-1 h-10 rounded-xl text-[13px] font-bold flex items-center justify-center"
                      style={{ background: '#EAF7EE', color: '#34C759', border: '1px solid #34C75940' }}>
                      ✓ Guardado en Sistema
                    </div>
                  )}
                  <button onClick={() => imprimir(idx)}
                    className="h-10 px-4 rounded-xl text-[13px] font-bold transition-colors"
                    style={{ background: '#f5f5f5', color: '#444', border: '1px solid #e0e0e0' }}>
                    🖨️ Maestro
                  </button>
                  <button onClick={() => imprimirHojasTienda([idx])}
                    className="h-10 px-4 rounded-xl text-[13px] font-bold transition-colors"
                    style={{ background: '#EEF2FF', color: '#1B2A6B', border: '1px solid #C7D2FE' }}>
                    🏪 Hojas x tienda
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-5 py-3 bg-white/90 border-t border-gray-200 text-center text-[11px] text-gray-400 flex-shrink-0">
        Guarda el manifiesto en el sistema antes de imprimir para generar el QR activo
      </div>
    </div>
  );
}
