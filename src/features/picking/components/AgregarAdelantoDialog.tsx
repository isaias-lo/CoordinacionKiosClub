'use client';

import { useMemo, useState } from 'react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { addTiendaAdelanto, zonaForStore, type ZonaAdelanto } from '@/features/despacho/shared/tiendasAdelanto';

interface Props {
  /** Fecha (YYYY-MM-DD) en que la tienda entra al flujo (hoy). */
  date: string;
  /** Quién la agrega (para auditoría). */
  creadoPor?: string;
  onClose: () => void;
  /** Se llama tras agregar con éxito (para refrescar la lista). */
  onAdded: () => void;
}

const ZONA_LABEL: Record<ZonaAdelanto, string> = {
  rm:    'Santiago (RM)',
  costa: 'Costa',
  fal:   'Regiones (Nacional)',
};

/**
 * Diálogo para agregar una tienda de "adelanto" al flujo del día desde Picking:
 * buscar la tienda, confirmar la zona (Bodega destino) y la fecha de despacho.
 * No toca el calendario central — solo agrega un extra para hoy.
 */
export function AgregarAdelantoDialog({ date, creadoPor, onClose, onAdded }: Props) {
  const [q, setQ]             = useState('');
  const [sel, setSel]         = useState<{ cod: string; name: string } | null>(null);
  const [zona, setZona]       = useState<ZonaAdelanto>('rm');
  const [fechaDesp, setFecha] = useState<string>(date);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const results = useMemo(() => {
    const upper = q.trim().toUpperCase();
    if (!upper) return [] as { cod: string; name: string }[];
    return Object.entries(TIENDAS_INICIAL)
      .filter(([cod, info]) => cod.includes(upper) || info.n.toUpperCase().includes(upper))
      .slice(0, 12)
      .map(([cod, info]) => ({ cod, name: info.n }));
  }, [q]);

  function pick(store: { cod: string; name: string }) {
    setSel(store);
    setZona(zonaForStore(store.cod)); // default automático; el usuario puede cambiarlo
    setError(null);
  }

  async function confirm() {
    if (!sel) return;
    setSaving(true); setError(null);
    const res = await addTiendaAdelanto({
      fecha:          date,
      store_cod:      sel.cod,
      zona,
      fecha_despacho: fechaDesp || null,
      creado_por:     creadoPor,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo agregar'); return; }
    onAdded();
    onClose();
  }

  const bigBtn: React.CSSProperties = {
    width: '100%', textAlign: 'left', borderRadius: 12, padding: '10px 12px',
    border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer',
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <span className="font-bold text-[17px]" style={{ color: '#0F172A' }}>⚡ Agregar tienda (adelanto)</span>
          <button onClick={onClose} aria-label="Cerrar"
            className="text-[24px] leading-none cursor-pointer" style={{ color: '#94A3B8', background: 'none', border: 'none' }}>×</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {!sel ? (
            <>
              <p className="text-[13px]" style={{ color: '#475569' }}>
                Busca la tienda que se adelanta o que saldrá fuera de su día de calendario.
              </p>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ border: '1.5px solid #CBD5E1' }}>
                <span style={{ color: '#94A3B8' }}>🔎</span>
                <input
                  autoFocus value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Código o nombre (ej. 12LAS, Las Condes)"
                  className="flex-1 text-[15px] font-medium outline-none"
                  style={{ color: '#0F172A', border: 'none' }}
                />
              </div>
              <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto">
                {results.map(r => (
                  <button key={r.cod} style={bigBtn} onClick={() => pick(r)}>
                    <span className="font-mono font-bold text-[13px] mr-2" style={{ color: '#1E40AF' }}>{r.cod}</span>
                    <span className="text-[14px]" style={{ color: '#0F172A' }}>{r.name}</span>
                  </button>
                ))}
                {q.trim() && results.length === 0 && (
                  <div className="text-[13px] text-center py-3" style={{ color: '#94A3B8' }}>Sin coincidencias.</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: '#F8FAFF', border: '1px solid #BFDBFE' }}>
                <div>
                  <span className="font-mono font-bold text-[14px] mr-2" style={{ color: '#1E40AF' }}>{sel.cod}</span>
                  <span className="text-[14px] font-semibold" style={{ color: '#0F172A' }}>{sel.name}</span>
                </div>
                <button onClick={() => { setSel(null); setError(null); }}
                  className="text-[12px] font-bold cursor-pointer" style={{ color: '#64748B', background: 'none', border: 'none' }}>cambiar</button>
              </div>

              {/* Zona / bodega destino */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748B' }}>Bodega destino</div>
                <div className="flex gap-2">
                  {(['rm', 'costa', 'fal'] as ZonaAdelanto[]).map(z => (
                    <button key={z} onClick={() => setZona(z)}
                      className="flex-1 py-2 rounded-lg text-[12px] font-bold cursor-pointer transition-colors"
                      style={zona === z
                        ? { background: '#1E40AF', color: '#fff', border: '1.5px solid #1E40AF' }
                        : { background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0' }}>
                      {ZONA_LABEL[z]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha de despacho */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748B' }}>Fecha de despacho</div>
                <input type="date" value={fechaDesp} onChange={e => setFecha(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                  style={{ border: '1.5px solid #CBD5E1', color: '#0F172A' }} />
              </div>

              {error && (
                <div className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
                  {error}
                </div>
              )}

              <div className="flex gap-2 mt-1">
                <button onClick={onClose}
                  className="flex-1 rounded-xl py-2.5 font-semibold text-[14px] cursor-pointer"
                  style={{ background: '#F1F5F9', color: '#475569', border: 'none' }}>
                  Cancelar
                </button>
                <button onClick={() => void confirm()} disabled={saving}
                  className="flex-1 rounded-xl py-2.5 font-bold text-[14px] cursor-pointer"
                  style={{ background: saving ? '#94A3B8' : '#16A34A', color: '#fff', border: 'none' }}>
                  {saving ? 'Agregando…' : '⚡ Agregar adelanto'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
