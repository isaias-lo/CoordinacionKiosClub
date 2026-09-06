'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';

export interface CambioBitacora {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  entidad: string;
  entidad_id: string | null;
  accion: string;
  resumen: string | null;
}

const ENTIDAD_LABEL: Record<string, string> = { tienda: 'Tienda', flota: 'Camión' };
const ACCION_ESTILO: Record<string, { label: string; bg: string; color: string }> = {
  crear:    { label: 'Creó',     bg: '#DCFCE7', color: '#15803D' },
  editar:   { label: 'Editó',    bg: '#DBEAFE', color: '#1D4ED8' },
  eliminar: { label: 'Eliminó',  bg: '#FEE2E2', color: '#B91C1C' },
};

/** Fecha y hora en horario de Chile, que es donde se opera. */
function cuando(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
    });
  } catch { return iso; }
}

/**
 * Quién cambió qué en el catálogo, más reciente primero.
 *
 * Responde en segundos lo que antes obligaba a cruzar tablas a mano cuando algo desaparecía.
 * Es solo lectura: la tabla es append-only y solo la escribe el servidor.
 */
export default function BitacoraTab() {
  const [filas,   setFilas]   = useState<CambioBitacora[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error,   setError]   = useState('');
  const [filtro,  setFiltro]  = useState<'' | 'tienda' | 'flota'>('');

  const cargar = useCallback(() => {
    setCargando(true); setError('');
    const qs = filtro ? `?entidad=${filtro}` : '';
    fetch(`/api/bitacora${qs}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { data?: CambioBitacora[] }) => setFilas(j.data ?? []))
      .catch(() => setError('No se pudo cargar la bitácora.'))
      .finally(() => setCargando(false));
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
          <History size={15} style={{ color: '#2563EB' }} /> Cambios del catálogo
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {([['', 'Todo'], ['tienda', 'Tiendas'], ['flota', 'Flota']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)}
              style={{ fontSize: 12, fontWeight: filtro === id ? 700 : 500, padding: '5px 12px', borderRadius: 20,
                border: `1px solid ${filtro === id ? '#BFDBFE' : '#E2E8F0'}`,
                background: filtro === id ? '#EFF6FF' : '#fff',
                color: filtro === id ? '#1D4ED8' : '#64748B', cursor: 'pointer' }}>
              {label}
            </button>
          ))}
          <button onClick={cargar} disabled={cargando} aria-label="Actualizar"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '5px 12px',
              borderRadius: 20, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer' }}>
            <RefreshCw size={12} /> Actualizar
          </button>
        </div>
      </div>

      {error && <div style={{ fontSize: 12.5, color: '#B91C1C', marginBottom: 10 }}>{error}</div>}

      {!cargando && !filas.length && !error && (
        <div style={{ fontSize: 13, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '18px 16px', textAlign: 'center' }}>
          Todavía no hay cambios registrados. Desde ahora, cada edición de una tienda o de la flota queda acá.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filas.map(f => {
          const est = ACCION_ESTILO[f.accion] ?? { label: f.accion, bg: '#F1F5F9', color: '#475569' };
          return (
            <div key={f.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: est.bg, color: est.color }}>
                  {est.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                  {ENTIDAD_LABEL[f.entidad] ?? f.entidad} {f.entidad_id}
                </span>
                <span style={{ fontSize: 11.5, color: '#64748B', marginLeft: 'auto' }}>
                  {f.actor_name || 'desconocido'} · {cuando(f.created_at)}
                </span>
              </div>
              {f.resumen && (
                <div style={{ fontSize: 11.5, color: '#475569', marginTop: 4, lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {f.resumen}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
