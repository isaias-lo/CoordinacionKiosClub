'use client';
import { useState, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Ruta } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';

/* ── Types ─────────────────────────────────────────────── */
interface TiendaManifiesto {
  store_cod: string;
  nombre: string;
  ventana: string;
  orden: number;
  pallets: number;
  bultos: number;
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
      return { store_cod: t.c, nombre: info.n, ventana: info.v, orden: i + 1, pallets: t.p, bultos: t.b, contenedores: 0 };
    }),
    total_pallets: ruta.tp,
    total_bultos:  ruta.tb,
  };
}

/* ── Print helper ───────────────────────────────────────── */
function imprimirManifiesto(m: ManifiestoData, supervisor: string, origin: string) {
  const qrUrl = m.token_qr ? `${origin}/r/${m.token_qr}` : `${origin}/despacho/estado`;
  const fechaLabel = new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  const genLabel   = new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const filas = m.tiendas.map(t =>
    `<tr>
      <td style="width:28px;text-align:center;color:#888;">${t.orden}</td>
      <td><strong>${t.nombre}</strong> <span style="color:#aaa;font-size:10px;">(${t.store_cod})</span></td>
      <td style="text-align:center;color:#555;">${t.ventana}</td>
      <td style="text-align:center;font-weight:700;">${t.pallets}</td>
      <td style="text-align:center;font-weight:700;">${t.bultos}</td>
    </tr>`
  ).join('');

  const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"/>
<title>Manifiesto ${m.codigo_ruta}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111;padding:18px 20px;max-width:780px;margin:auto}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C62828;padding-bottom:10px;margin-bottom:14px}
.logo{font-size:24px;font-weight:900;color:#C62828;letter-spacing:-1px}
.logo-sub{font-size:9px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
.title{font-size:20px;font-weight:900;color:#1a2550;text-align:right}
.code{font-size:13px;font-weight:700;color:#C62828;text-align:right;margin-top:2px}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#f7f7f7;padding:10px 14px;border-radius:6px;margin-bottom:14px}
.mi label{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.4px;display:block}
.mi span{font-size:13px;font-weight:700;color:#111}
.sec{font-size:9px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:3px;margin-bottom:7px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
th{background:#1a2550;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px}
td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
tr:nth-child(even) td{background:#fafafa}
.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.tc{background:#1a2550;color:#fff;padding:8px;border-radius:5px;text-align:center}
.tc .n{font-size:26px;font-weight:900;line-height:1}
.tc .l{font-size:9px;text-transform:uppercase;opacity:.7;margin-top:2px}
.qr-box{display:flex;align-items:center;gap:14px;border:2px solid #1a2550;padding:12px 14px;border-radius:8px;margin-bottom:14px}
.qr-info h3{font-size:13px;font-weight:700;color:#1a2550;margin-bottom:3px}
.qr-info p{font-size:10px;color:#666;line-height:1.5}
.qr-url{font-size:8px;color:#bbb;font-family:monospace;margin-top:5px;word-break:break-all}
.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;background:#FF9500;color:#fff;margin-bottom:4px}
.footer{font-size:9px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:8px;margin-top:6px}
.firma-box{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:10px}
.firma{border-top:1px solid #ccc;padding-top:4px;font-size:9px;color:#aaa;text-align:center}
@media print{body{padding:8px 10px}}
</style>
</head><body>

<div class="hdr">
  <div>
    <div class="logo">KIOSClub</div>
    <div class="logo-sub">Centro de Distribución · Bodega ${m.bodega_origen}</div>
  </div>
  <div>
    <div class="title">MANIFIESTO DE RUTA</div>
    <div class="code">${m.codigo_ruta}</div>
  </div>
</div>

<div class="meta">
  <div class="mi"><label>Fecha</label><span>${fechaLabel}</span></div>
  <div class="mi"><label>Chofer</label><span>${m.chofer}</span></div>
  <div class="mi"><label>Patente</label><span>${m.patente}</span></div>
  <div class="mi"><label>Bodega Origen</label><span>${m.bodega_origen}</span></div>
  <div class="mi"><label>N° Tiendas</label><span>${m.tiendas.length}</span></div>
  <div class="mi"><label>Supervisor</label><span>${supervisor || '—'}</span></div>
</div>

<div class="sec">Tiendas destino (orden de entrega)</div>
<table>
  <thead><tr><th>#</th><th>Tienda</th><th>Ventana horaria</th><th>Pallets</th><th>Bultos</th></tr></thead>
  <tbody>${filas}</tbody>
</table>

<div class="totals">
  <div class="tc"><div class="n">${m.tiendas.length}</div><div class="l">Tiendas</div></div>
  <div class="tc"><div class="n">${m.total_pallets}</div><div class="l">Pallets</div></div>
  <div class="tc"><div class="n">${m.total_bultos}</div><div class="l">Bultos</div></div>
</div>

<div class="sec">Guías DTE asociadas</div>
<div style="padding:8px 12px;background:#fafafa;border-radius:5px;font-size:11px;color:#888;margin-bottom:14px;border:1px solid #eee;">
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

<div class="firma-box">
  <div class="firma">Firma Chofer</div>
  <div class="firma">Firma Supervisor / Recepción</div>
</div>

<div class="footer">
  KiosClub · Centro de Distribución · Generado ${genLabel} · Sistema de Despacho v5.0
</div>

<script>window.onload = () => { setTimeout(() => window.print(), 600); };</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=850,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

/* ── Component ──────────────────────────────────────────── */
export default function ManifiestoPanel({ rutas, fecha, supervisor, tiendas, isOpen, onClose }: Props) {
  const [manifiestos, setManifiestos] = useState<ManifiestoData[]>([]);
  const [saving,  setSaving]  = useState<Record<number, boolean>>({});
  const [saved,   setSaved]   = useState<Record<number, boolean>>({});
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

  // Rebuild whenever rutas changes (e.g. chofer re-assigned)
  useEffect(() => {
    setManifiestos(rutas.map((r, i) => fromRuta(r, i, fecha, tiendas)));
    setSaved({});
  }, [rutas, fecha, tiendas]);

  // Lock body scroll while panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>

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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {manifiestos.map((m, idx) => {
          const qrUrl     = m.token_qr ? `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${m.token_qr}` : '';
          const estadoCol = ESTADO_COLOR[m.estado] ?? '#8E8E93';
          const isSaved   = saved[idx];
          const isSaving  = saving[idx];

          return (
            <div key={idx} className="bg-white rounded-2xl shadow-xl overflow-hidden">

              {/* Manifiesto header */}
              <div className="flex items-start justify-between px-5 py-4"
                style={{ borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div className="font-barlow-condensed text-[22px] font-bold text-knavy tracking-wide leading-tight">
                    {m.codigo_ruta}
                  </div>
                  <div className="text-[12px] text-gray-400 mt-0.5">
                    {m.chofer} · {m.patente} · {m.bodega_origen}
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white mt-0.5"
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
                        {t.bultos > 0  && <span>{t.bultos}B</span>}
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
                  🖨️ Imprimir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-3 bg-white/90 border-t border-gray-200 text-center text-[11px] text-gray-400 flex-shrink-0">
        Guarda el manifiesto en el sistema antes de imprimir para generar el QR activo
      </div>
    </div>
  );
}
