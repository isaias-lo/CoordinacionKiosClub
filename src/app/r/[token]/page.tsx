'use client';
import { useEffect, useState } from 'react';
import { useParams }           from 'next/navigation';
import { guiaHref }            from '@/lib/guiaUrl';

/* ── Types ─────────────────────────────────────────────── */
interface TiendaRuta {
  id: number; store_cod: string; nombre?: string; ventana?: string; orden: number;
  pallets: number; bultos: number; contenedores: number;
  estado_entrega: string;
}
interface GuiaRuta {
  id: number; store_cod?: string; folio_dte: string; drive_url?: string; tipo: string;
}
interface RutaData {
  id: number; codigo_ruta: string; fecha: string;
  chofer: string; patente: string; bodega_origen: string;
  estado: string; token_qr: string;
  ruta_tiendas: TiendaRuta[];
  ruta_guias:   GuiaRuta[];
}

/* ── Helpers ─────────────────────────────────────────────── */
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_camino: 'En Camino', entregado: 'Entregado', recibido: 'Recibido',
};

function fechaLabel(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function docId(ruta: RutaData) {
  return `${ruta.patente.replace(/[-\s]/g, '')}-${ruta.fecha.replace(/-/g, '')}`;
}

function generadoEn() {
  // Hora real de Chile, independiente de la zona del dispositivo.
  return new Date().toLocaleString('es-CL', {
    timeZone: 'America/Santiago', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const ESTADO_CELL: Record<string, { bg: string; color: string; label: string }> = {
  pendiente:  { bg: '#fef3c7', color: '#92400e', label: 'Pendiente'  },
  en_camino:  { bg: '#dbeafe', color: '#1e40af', label: 'En Camino'  },
  entregado:  { bg: '#dcfce7', color: '#166534', label: 'Entregado'  },
  recibido:   { bg: '#f1f5f9', color: '#475569', label: 'Recibido'   },
};

/* ── Styles ─────────────────────────────────────────────── */
const S = {
  page:      { background: '#fff', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#111827', minHeight: '100vh' },
  header:    { background: '#1a2550', padding: '16px 20px', color: '#fff' },
  hTop:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  hBrand:    { fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 0.5 },
  hSub:      { fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  hTitle:    { fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 2 },
  hDocId:    { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' },
  hDate:     { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2, textTransform: 'capitalize' as const },
  body:      { padding: '0 16px 32px' },
  section:   { border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', margin: '14px 0' },
  sTitle:    { background: '#f9fafb', borderBottom: '1px solid #d1d5db', padding: '8px 14px', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1.2 },
  infoRow:   { display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13 },
  infoLabel: { color: '#6b7280', fontWeight: 500 },
  infoVal:   { color: '#111827', fontWeight: 600 },
  statsRow:  { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '14px 0' },
  statBox:   { border: '1px solid #d1d5db', borderRadius: 8, padding: '12px 8px', textAlign: 'center' as const },
  statN:     { fontSize: 26, fontWeight: 900, color: '#1a2550', lineHeight: 1 },
  statL:     { fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginTop: 3 },
  tHead:     { display: 'flex', background: '#f9fafb', borderBottom: '1px solid #d1d5db', padding: '7px 12px', gap: 8 },
  tHeadCell: { fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  tRow:      { display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', gap: 8 },
  badge:     { width: 22, height: 22, borderRadius: '50%', background: '#1a2550', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  storeName: { flex: 1, minWidth: 0 },
  storeN:    { fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  storeSub:  { fontSize: 10, color: '#9ca3af', marginTop: 1 },
  qty:       { fontSize: 11, fontWeight: 700, color: '#374151', flexShrink: 0 },
  printBtn:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px', background: '#1a2550', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', margin: '16px 0 4px' },
};

/* ── Page ─────────────────────────────────────────────── */
export default function RutaPublicaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [ruta,      setRuta]      = useState<RutaData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!token) return;
    const cacheKey = `r_cache_${token}`;
    fetch(`/api/r/${token}`)
      .then(r => r.json())
      .then((json: { data?: RutaData; error?: string }) => {
        if (json.error) { setError(json.error); return; }
        setRuta(json.data ?? null);
        // Guardar la última carga (con timestamp) → re-abrir/re-escanear sin señal en ruta.
        if (json.data) { try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: json.data })); } catch { /* cuota */ } }
      })
      .catch(() => {
        // Sin señal: usar la última carga guardada de ESTE token, si es válida y no muy vieja.
        try {
          const raw = localStorage.getItem(cacheKey);
          const parsed = raw ? JSON.parse(raw) as { ts?: number; data?: RutaData } : null;
          const cached = parsed?.data;
          const fresca = !!parsed?.ts && (Date.now() - parsed.ts) < 7 * 24 * 60 * 60 * 1000; // 7 días
          if (cached && Array.isArray(cached.ruta_tiendas) && fresca) {
            setRuta(cached);
            setFromCache(true);
          } else {
            setError('Sin conexión y sin datos guardados válidos de esta ruta.');
          }
        } catch { setError('Error de conexión'); }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #d1d5db', borderTopColor: '#1a2550', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ color: '#6b7280', fontSize: 13 }}>Cargando manifiesto…</p>
    </div>
  );

  if (error || !ruta) return (
    <div style={{ ...S.page, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <div style={{ width: 48, height: 48, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>✕</div>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Enlace no válido</h1>
      <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>{error ?? 'Este QR no corresponde a ninguna ruta activa.'}</p>
    </div>
  );

  const totalP = ruta.ruta_tiendas.reduce((s, t) => s + t.pallets, 0);
  const totalB = ruta.ruta_tiendas.reduce((s, t) => s + t.bultos, 0);
  const estadoRuta = ESTADO_LABEL[ruta.estado] ?? ruta.estado;
  const sorted = [...ruta.ruta_tiendas].sort((a, b) => a.orden - b.orden);

  return (
    <div style={S.page}>
      <style>{`
        /* Vista pública: anular el overflow:hidden global del shell para que
           el manifiesto scrollee hasta el final (guías, fiscalización, imprimir). */
        html, body { overflow: auto !important; height: auto !important; }
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          div { page-break-inside: avoid; }
        }
      `}</style>

      {/* Header corporativo */}
      <div style={S.header}>
        <div style={S.hTop}>
          <div>
            <div style={S.hBrand}>KIOSCLUB</div>
            <div style={S.hSub}>Sistema de Despacho — CD</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1 }}>N° Documento</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#fff', fontWeight: 700 }}>{docId(ruta)}</div>
          </div>
        </div>
        <div style={S.hTitle}>Manifiesto de Despacho</div>
        <div style={S.hDate}>{fechaLabel(ruta.fecha)}</div>
      </div>

      <div style={S.body}>

        {fromCache && (
          <div style={{ margin: '12px 0 0', padding: '9px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#9a3412', lineHeight: 1.45 }}>
            📴 <strong>Sin conexión</strong> — mostrando la última versión guardada de esta ruta. Puede no reflejar el estado más reciente.
          </div>
        )}

        {/* Info ruta */}
        <div style={S.section}>
          <div style={S.sTitle}>Datos del Transporte</div>
          {([
            ['Conductor',     ruta.chofer],
            ['Patente',       ruta.patente],
            ['Bodega Origen', ruta.bodega_origen],
            ['Estado',        estadoRuta],
          ] as [string, string][]).map(([label, val], i, arr) => (
            <div key={label} style={{ ...S.infoRow, borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <span style={S.infoLabel}>{label}</span>
              <span style={S.infoVal}>{val}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div style={S.statsRow}>
          {([
            [ruta.ruta_tiendas.length, 'Tiendas'],
            [totalP, 'Pallets'],
            [totalB, 'Bultos'],
          ] as [number, string][]).map(([n, l]) => (
            <div key={l} style={S.statBox}>
              <div style={S.statN}>{n}</div>
              <div style={S.statL}>{l}</div>
            </div>
          ))}
        </div>

        {/* Tabla de tiendas */}
        <div style={S.section}>
          <div style={{ ...S.sTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Paradas</span>
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {sorted.length} tiendas · {totalP}P · {totalB}B
            </span>
          </div>
          <div style={{ ...S.tHead }}>
            <span style={{ ...S.tHeadCell, width: 22 }}>#</span>
            <span style={{ ...S.tHeadCell, flex: 1 }}>Tienda</span>
            <span style={{ ...S.tHeadCell, width: 26, textAlign: 'right' }}>P</span>
            <span style={{ ...S.tHeadCell, width: 26, textAlign: 'right' }}>B</span>
            <span style={{ ...S.tHeadCell, width: 70, textAlign: 'right' }}>Estado</span>
          </div>
          {sorted.map((t, i) => {
            const ec = ESTADO_CELL[t.estado_entrega] ?? { bg: '#f9fafb', color: '#6b7280', label: t.estado_entrega };
            return (
              <div key={t.id} style={{ ...S.tRow, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <div style={S.badge}>{t.orden}</div>
                <div style={S.storeName}>
                  <div style={S.storeN}>{t.nombre ?? t.store_cod}</div>
                  {t.ventana && <div style={S.storeSub}>{t.ventana}</div>}
                </div>
                <span style={{ ...S.qty, width: 26, textAlign: 'right' }}>{t.pallets || '—'}</span>
                <span style={{ ...S.qty, width: 26, textAlign: 'right' }}>{t.bultos || '—'}</span>
                <span style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: ec.bg, color: ec.color }}>
                    {ec.label}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Guías DTE */}
        <div style={S.section}>
          <div style={S.sTitle}>Guias de Despacho SII</div>
          {ruta.ruta_guias.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
              Sin guias vinculadas — se adjuntan desde el modulo Estado
            </div>
          ) : ruta.ruta_guias.map((g, i, arr) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>Folio #{g.folio_dte}</div>
                {g.store_cod && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{g.store_cod}</div>}
              </div>
              {g.drive_url && (
                <a href={guiaHref(g.drive_url)} target="_blank" rel="noreferrer"
                  style={{ padding: '5px 13px', background: '#1a2550', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                  Descargar PDF
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Fiscalización */}
        <div style={{ border: '1px solid #bbf7d0', borderRadius: 8, background: '#f0fdf4', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
            DOCUMENTO VALIDO PARA FISCALIZACION
          </div>
          <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.5 }}>
            Todas las guias adjuntas son Documentos Tributarios Electronicos (DTE) validos ante el Servicio de Impuestos Internos (SII).
            Generado: {generadoEn()}
          </div>
        </div>

        {/* Print button */}
        <button className="no-print" style={S.printBtn} onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>

        <div style={{ textAlign: 'center', fontSize: 10, color: '#d1d5db', marginTop: 8 }}>
          KiosClub · {ruta.codigo_ruta} · {ruta.patente}
        </div>
      </div>
    </div>
  );
}
