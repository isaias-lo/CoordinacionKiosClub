'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import type { TrazabilidadUnidad, TrazabilidadEstadoResolucion } from '@/lib/trazabilidad.types';

const ESTADO_COLOR: Record<string, string> = {
  CREADO:               '#8E8E93',
  EN_RUTA:              '#007AFF',
  RECIBIDO_CONFORME:    '#34C759',
  RECIBIDO_INCIDENCIA:  '#FF3B30',
  CERRADO:              '#636366',
};

const RESOLUCION_OPTS: { value: TrazabilidadEstadoResolucion; label: string; color: string }[] = [
  { value: 'EN_REVISION', label: 'En revisión',  color: '#FF9500' },
  { value: 'RESUELTO',    label: 'Resuelto',     color: '#34C759' },
  { value: 'RECHAZADO',   label: 'Rechazado',    color: '#FF3B30' },
];

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', hour12: false, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function IncidenciasPage() {
  const router          = useRouter();
  const { profile }     = useAuth();
  const [items,         setItems]         = useState<TrazabilidadUnidad[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filtroEstado,  setFiltroEstado]  = useState<string>('RECIBIDO_INCIDENCIA');
  const [selected,      setSelected]      = useState<TrazabilidadUnidad | null>(null);
  const [resolucion,    setResolucion]    = useState<TrazabilidadEstadoResolucion>('EN_REVISION');
  const [observaciones, setObservaciones] = useState('');
  const [saving,        setSaving]        = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filtroEstado ? `?estado=${filtroEstado}` : '';
      const res = await fetch(`/api/trazabilidad${qs}`);
      const json = await res.json() as { data: TrazabilidadUnidad[] };
      setItems(json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [filtroEstado]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function handleCierre() {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch('/api/trazabilidad', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punto:                   'cierre',
          id_unidad_logistica:     selected.id_unidad_logistica,
          estado_resolucion:       resolucion,
          observaciones:           observaciones || undefined,
          usuario_cierre:          profile?.full_name ?? profile?.id ?? 'supervisor',
        }),
      });
      setSelected(null);
      void cargar();
    } finally {
      setSaving(false);
    }
  }

  const paths = profile?.allowedPaths ?? [];
  function goBack() {
    if (paths.includes('*') || paths.includes('/despacho')) { router.push('/despacho'); return; }
    router.push('/');
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a2550 0%, #2d3f8a 100%)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
        <button onClick={goBack}
          style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ‹
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2 }}>Trazabilidad</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>Incidencias</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8, overflowX: 'auto', flexShrink: 0 }}>
        {[
          { v: 'RECIBIDO_INCIDENCIA', l: 'Activas' },
          { v: 'EN_RUTA',             l: 'En ruta' },
          { v: 'RECIBIDO_CONFORME',   l: 'Conformes' },
          { v: 'CERRADO',             l: 'Cerradas' },
          { v: '',                    l: 'Todas' },
        ].map(f => (
          <button key={f.v} onClick={() => setFiltroEstado(f.v)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              background: filtroEstado === f.v ? '#fff' : 'rgba(255,255,255,0.08)',
              color:      filtroEstado === f.v ? '#0f172a' : 'rgba(255,255,255,0.5)',
              border: 'none',
            }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#60A5FA', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Cargando…</p>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Sin registros en este filtro</p>
          </div>
        )}

        {!loading && items.map(item => (
          <div key={item.id_unidad_logistica}
            onClick={() => { setSelected(item); setResolucion('EN_REVISION'); setObservaciones(''); }}
            style={{ background: '#1e293b', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', border: item.estado_actual === 'RECIBIDO_INCIDENCIA' ? '1.5px solid rgba(255,59,48,0.35)' : '1px solid rgba(255,255,255,0.06)' }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2 }}>
                  {item.tienda_destino ?? item.codigo_tienda}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.id_unidad_logistica}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#fff', background: ESTADO_COLOR[item.estado_actual] ?? '#8E8E93' }}>
                  {item.estado_actual.replace(/_/g, ' ')}
                </span>
                {item.estado_resolucion && (
                  <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(255,149,0,0.7)' }}>
                    {item.estado_resolucion}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
              {item.tipo_unidad    && <span style={{ color: 'rgba(255,255,255,0.5)' }}>{item.tipo_unidad}</span>}
              {item.transportista  && <span style={{ color: 'rgba(255,255,255,0.5)' }}>· {item.transportista}</span>}
              {item.tipo_incidencia && (
                <span style={{ padding: '2px 8px', borderRadius: 99, background: 'rgba(255,59,48,0.18)', color: '#FF6B6B', fontWeight: 700 }}>
                  ⚠ {item.tipo_incidencia}
                </span>
              )}
              {item.indicador_llegada_tiempo === 'TARDE' && item.minutos_desfase && (
                <span style={{ padding: '2px 8px', borderRadius: 99, background: 'rgba(255,149,0,0.18)', color: '#FF9500', fontWeight: 700 }}>
                  +{item.minutos_desfase} min tarde
                </span>
              )}
              {item.alerta_temperatura && item.alerta_temperatura !== 'OK' && (
                <span style={{ padding: '2px 8px', borderRadius: 99, background: 'rgba(255,59,48,0.18)', color: '#FF6B6B', fontWeight: 700 }}>
                  🌡 {item.alerta_temperatura}
                </span>
              )}
            </div>

            {item.descripcion_incidencia && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                {item.descripcion_incidencia}
              </div>
            )}

            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
              <span>Llegada: {fmtFecha(item.fecha_hora_real_llegada)}</span>
              {item.reintentos_recepcion > 0 && <span>{item.reintentos_recepcion} reintento{item.reintentos_recepcion !== 1 ? 's' : ''}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de cierre */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div style={{ background: '#1e293b', borderRadius: '20px 20px 0 0', padding: '20px 20px 36px', width: '100%', maxHeight: '85dvh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{selected.tienda_destino ?? selected.codigo_tienda}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{selected.id_unidad_logistica}</div>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>

            {/* Datos de la incidencia */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { l: 'Tipo incidencia',    v: selected.tipo_incidencia },
                { l: 'Transportista',      v: selected.transportista },
                { l: 'Tipo unidad',        v: selected.tipo_unidad },
                { l: 'Régimen',            v: selected.regimen },
                { l: 'Temp. salida',       v: selected.temperatura_salida ? `${selected.temperatura_salida}°C` : null },
                { l: 'Temp. llegada',      v: selected.temperatura_llegada ? `${selected.temperatura_llegada}°C` : null },
                { l: 'Indicador puntual.', v: selected.indicador_llegada_tiempo },
                { l: 'Desfase',            v: selected.minutos_desfase ? `${selected.minutos_desfase} min` : null },
                { l: 'Recepcionado por',   v: selected.usuario_recepcion },
                { l: 'Reintentos',         v: selected.reintentos_recepcion > 0 ? `${selected.reintentos_recepcion}` : null },
              ].filter(d => d.v).map(d => (
                <div key={d.l} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{d.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{d.v}</div>
                </div>
              ))}
            </div>

            {selected.descripcion_incidencia && (
              <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,100,100,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Descripción</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{selected.descripcion_incidencia}</div>
              </div>
            )}

            {/* Evidencias fotográficas */}
            {selected.links_evidencia && selected.links_evidencia.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Evidencias fotográficas</div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                  {selected.links_evidencia.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`evidencia ${i + 1}`}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Solo mostrar panel de cierre si hay incidencia activa */}
            {selected.estado_actual === 'RECIBIDO_INCIDENCIA' && (
              <>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '16px 0' }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Resolver incidencia
                </div>

                {/* Resolución */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {RESOLUCION_OPTS.map(opt => (
                    <button key={opt.value} onClick={() => setResolucion(opt.value)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${resolucion === opt.value ? opt.color : 'rgba(255,255,255,0.1)'}`, background: resolucion === opt.value ? `${opt.color}22` : 'transparent', color: resolucion === opt.value ? opt.color : 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Observaciones */}
                <textarea
                  value={observaciones}
                  onChange={e => setObservaciones(e.target.value)}
                  rows={3}
                  placeholder="Detalle de la resolución (opcional)…"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }}
                />

                <button onClick={() => void handleCierre()} disabled={saving}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: saving ? 'rgba(255,255,255,0.1)' : '#1B2A6B', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Guardando…' : 'Cerrar incidencia →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
