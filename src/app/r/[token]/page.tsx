'use client';
import { useEffect, useState } from 'react';
import { useParams }           from 'next/navigation';

/* ── Types ─────────────────────────────────────────────── */
interface TiendaRuta {
  id: number; store_cod: string; orden: number;
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
const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#FF9500', en_camino: '#007AFF', entregado: '#34C759', recibido: '#8E8E93',
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_camino: 'En Camino', entregado: 'Entregado', recibido: 'Recibido',
};
const ESTADO_ICON: Record<string, string> = {
  pendiente: '🕐', en_camino: '🚚', entregado: '📦', recibido: '✅',
};

function fechaLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

/* ── Page ─────────────────────────────────────────────── */
export default function RutaPublicaPage() {
  const { token } = useParams<{ token: string }>();
  const [ruta,    setRuta]    = useState<RutaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/r/${token}`)
      .then(r => r.json())
      .then((json: { data?: RutaData; error?: string }) => {
        if (json.error) setError(json.error);
        else setRuta(json.data ?? null);
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false));
  }, [token]);

  /* Loading */
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#0f172a' }}>
      <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
      <p className="text-white/60 text-sm">Cargando ruta…</p>
    </div>
  );

  /* Error */
  if (error || !ruta) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0f172a' }}>
      <div className="text-5xl mb-4">🚫</div>
      <h1 className="text-white text-xl font-bold mb-2">Enlace no válido</h1>
      <p className="text-white/50 text-sm text-center">{error ?? 'Este QR no corresponde a ninguna ruta activa.'}</p>
    </div>
  );

  const estadoCol   = ESTADO_COLOR[ruta.estado] ?? '#8E8E93';
  const estadoLbl   = ESTADO_LABEL[ruta.estado] ?? ruta.estado;
  const estadoIcon  = ESTADO_ICON[ruta.estado]  ?? '📋';
  const totalP      = ruta.ruta_tiendas.reduce((s, t) => s + t.pallets, 0);
  const totalB      = ruta.ruta_tiendas.reduce((s, t) => s + t.bultos, 0);

  return (
    <div className="min-h-screen pb-10" style={{ background: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a2550 0%, #2d3f8a 100%)', padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#C62828', letterSpacing: -1 }}>KIOS</span>
          <span style={{ fontSize: 18, fontStyle: 'italic', fontWeight: 700, color: '#C62828' }}>Club</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
            Sistema de Despacho
          </span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: 1, marginBottom: 4 }}>
          {ruta.codigo_ruta}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
          {fechaLabel(ruta.fecha)}
        </p>

        {/* Estado badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 50, fontWeight: 700, fontSize: 13, color: '#fff', background: estadoCol }}>
          <span>{estadoIcon}</span>
          <span>{estadoLbl}</span>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Info ruta */}
        <div style={{ background: '#1e293b', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Información de Ruta
          </div>
          {[
            ['🚗 Chofer',   ruta.chofer],
            ['🪪 Patente',  ruta.patente],
            ['🏭 Bodega',   ruta.bodega_origen],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {([[ ruta.ruta_tiendas.length, 'Tiendas' ], [ totalP, 'Pallets' ], [ totalB, 'Bultos' ]] as [number, string][]).map(([n, l]) => (
            <div key={l} style={{ background: '#1e293b', borderRadius: 12, padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#C62828', lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: .5, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Tiendas */}
        <div style={{ background: '#1e293b', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Tiendas Destino
          </div>
          {[...ruta.ruta_tiendas].sort((a, b) => a.orden - b.orden).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2d3f8a', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {t.orden}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{t.store_cod}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                  {t.pallets > 0 && `${t.pallets} pallet${t.pallets !== 1 ? 's' : ''}`}
                  {t.pallets > 0 && t.bultos > 0 && ' · '}
                  {t.bultos > 0 && `${t.bultos} bulto${t.bultos !== 1 ? 's' : ''}`}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR[t.estado_entrega] ?? '#666', textTransform: 'capitalize' }}>
                {ESTADO_LABEL[t.estado_entrega] ?? t.estado_entrega}
              </div>
            </div>
          ))}
        </div>

        {/* Guías DTE */}
        {ruta.ruta_guias.length > 0 && (
          <div style={{ background: '#1e293b', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Guías DTE · Folios SII
            </div>
            {ruta.ruta_guias.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>#{g.folio_dte}</div>
                  {g.store_cod && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{g.store_cod}</div>}
                </div>
                {g.drive_url && (
                  <a href={g.drive_url} target="_blank" rel="noreferrer"
                    style={{ padding: '5px 12px', background: '#2d3f8a', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                    Ver PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sin guías */}
        {ruta.ruta_guias.length === 0 && (
          <div style={{ background: '#1e293b', borderRadius: 14, padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              Las guías DTE se vinculan desde el módulo Estado/Seguimiento
            </div>
          </div>
        )}

        {/* Fiscalización notice */}
        <div style={{ background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.25)', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#34C759', marginBottom: 4 }}>✓ Documento Válido para Fiscalización</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            Este QR reemplaza la presentación de guías físicas. Todas las guías son electrónicas válidas del SII.
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingTop: 4 }}>
          KiosClub · Centro de Distribución · {ruta.codigo_ruta}
        </div>
      </div>
    </div>
  );
}
