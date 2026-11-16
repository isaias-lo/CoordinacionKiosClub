'use client';

// Pestaña «Topes» de Config. Tiendas — cuántos pallets aguanta recibir cada tienda.
//
// El coordinador tenía ese número en una lista impresa y Bodega no lo sabía. Acá se mueve cuando
// la tienda cambia: una bodega que se agranda, un muelle que se cierra por obra.
//
// ── POR QUÉ UNA TABLA Y NO EL FORMULARIO DE TIENDAS ────────────────────────────────────────────
//
// El formulario de la pestaña Tiendas edita UNA tienda: abrir, cambiar, guardar, cerrar. Ajustar
// topes es pasar por varias de una sentada, así que acá se edita en la fila y se guarda al salir
// del campo. Mismo patrón que `TransportistasTab`.
//
// Guarda con `PATCH /api/tiendas/tope`, que toca SOLO esa columna. No se usa el POST de
// `/api/tiendas` porque es un upsert completo que reescribe las 30 columnas y resincroniza la
// hoja — ver la cabecera de `api/tiendas/tope/route.ts`.
//
// Vacío es «sin tope», y es un valor legítimo: así se borra uno mal cargado. No es cero.

import { useEffect, useMemo, useState } from 'react';
import { Ruler, Check, Loader2, AlertTriangle, Search } from 'lucide-react';
import { topeDesdeTexto, TOPE_MIN, TOPE_MAX } from './topeEditable';

interface TiendaFila {
  codigo: string;
  nombre: string;
  tipo: string | null;
  region: string | null;
  max_pallets: number | null;
}

type Estado = 'idle' | 'saving' | 'ok' | 'error';

export default function TopesTab({ canEdit }: { canEdit: boolean }) {
  const [filas,   setFilas]   = useState<TiendaFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca,   setBusca]   = useState('');
  const [estado,  setEstado]  = useState<Record<string, Estado>>({});
  const [msg,     setMsg]     = useState<Record<string, string>>({});
  // Lo que hay en el input, que puede no ser un número válido todavía mientras se tipea.
  const [texto,   setTexto]   = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    fetch('/api/tiendas')
      .then(r => (r.ok ? r.json() : { tiendas: [] }))
      .then(({ tiendas }: { tiendas?: Record<string, unknown>[] }) => {
        if (!vivo) return;
        const activas = (tiendas ?? [])
          .filter(t => t.activo !== false)
          .map(t => ({
            codigo:      String(t.codigo ?? ''),
            nombre:      String(t.nombre ?? ''),
            tipo:        t.tipo   ? String(t.tipo)   : null,
            region:      t.region ? String(t.region) : null,
            max_pallets: t.max_pallets == null ? null : Number(t.max_pallets),
          }))
          .sort((a, b) => a.codigo.localeCompare(b.codigo));
        setFilas(activas);
        setTexto(Object.fromEntries(activas.map(t => [t.codigo, t.max_pallets == null ? '' : String(t.max_pallets)])));
        setLoading(false);
      })
      .catch(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(t => t.codigo.toLowerCase().includes(q) || t.nombre.toLowerCase().includes(q));
  }, [filas, busca]);

  const sinTope = useMemo(() => filas.filter(t => t.max_pallets == null).length, [filas]);

  async function guardar(cod: string) {
    const valor = topeDesdeTexto(texto[cod] ?? '');
    if (valor === undefined) {
      setEstado(e => ({ ...e, [cod]: 'error' }));
      setMsg(m => ({ ...m, [cod]: `Tiene que ser un número entre ${TOPE_MIN} y ${TOPE_MAX}, o quedar vacío` }));
      return;
    }
    const actual = filas.find(t => t.codigo === cod)?.max_pallets ?? null;
    if (valor === actual) { setEstado(e => ({ ...e, [cod]: 'idle' })); return; }

    setEstado(e => ({ ...e, [cod]: 'saving' }));
    setMsg(m => ({ ...m, [cod]: '' }));
    try {
      const r = await fetch('/api/tiendas/tope', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: cod, max_pallets: valor }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Error ${r.status}`);
      }
      setFilas(prev => prev.map(t => (t.codigo === cod ? { ...t, max_pallets: valor } : t)));
      setEstado(e => ({ ...e, [cod]: 'ok' }));
    } catch (err) {
      setEstado(e => ({ ...e, [cod]: 'error' }));
      setMsg(m => ({ ...m, [cod]: err instanceof Error ? err.message : 'No se pudo guardar' }));
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#64748B', fontSize: 14, padding: 20 }}>
        <Loader2 size={16} className="animate-spin" /> Cargando tiendas…
      </div>
    );
  }

  const th: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#64748B', padding: '9px 12px',
    borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #F1F5F9', fontSize: 13.5 };

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <Ruler size={19} style={{ color: '#2563EB', flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Tope de recepción</h3>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748B', maxWidth: '62ch', lineHeight: 1.55 }}>
            Cuántas posiciones de piso aguanta recibir cada tienda. Un <b>contenedor cuenta como un
            pallet</b> porque ocupa el mismo lugar; los bultos y los chocolates no suman.
            Bodega lo muestra como aviso: <b>no bloquea nada</b>.
          </p>
          <p style={{ margin: '7px 0 0', fontSize: 13, color: '#64748B' }}>
            Dejar la casilla <b>vacía</b> es «sin tope»: esa tienda no muestra ningún aviso.
            {sinTope > 0 && <> Hoy hay <b>{sinTope}</b> {sinTope === 1 ? 'tienda' : 'tiendas'} sin tope.</>}
          </p>
        </div>
      </div>

      <div style={{ position: 'relative', marginBottom: 12, maxWidth: 320 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94A3B8' }} />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código o nombre"
          aria-label="Buscar tienda"
          style={{ width: '100%', padding: '8px 10px 8px 30px', fontSize: 13, borderRadius: 7, border: '1px solid #CBD5E1' }} />
      </div>

      {!canEdit && (
        <p style={{ fontSize: 12.5, color: '#B45309', background: 'rgba(180,83,9,0.08)',
          border: '1px solid rgba(180,83,9,0.25)', borderRadius: 7, padding: '7px 11px', margin: '0 0 12px' }}>
          Solo lectura: los topes los mueve quien administra tiendas.
        </p>
      )}

      <div style={{ border: '1px solid #E2E8F0', borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8FAFC' }}>
            <tr><th style={th}>Código</th><th style={th}>Tienda</th><th style={th}>Tipo</th>
              <th style={{ ...th, width: 120 }}>Máx. pallets</th><th style={{ ...th, width: 210 }}></th></tr>
          </thead>
          <tbody>
            {visibles.map(t => {
              const st = estado[t.codigo] ?? 'idle';
              return (
                <tr key={t.codigo}>
                  <td style={{ ...td, fontWeight: 700, color: '#1B2A6B', fontVariantNumeric: 'tabular-nums' }}>{t.codigo}</td>
                  <td style={{ ...td, color: '#0F172A' }}>{t.nombre}</td>
                  <td style={{ ...td, color: '#64748B', fontSize: 12.5 }}>{t.tipo ?? '—'}</td>
                  <td style={td}>
                    <input
                      value={texto[t.codigo] ?? ''}
                      disabled={!canEdit}
                      inputMode="numeric"
                      aria-label={`Tope de ${t.nombre}`}
                      placeholder="sin tope"
                      onChange={e => {
                        setTexto(x => ({ ...x, [t.codigo]: e.target.value }));
                        setEstado(x => ({ ...x, [t.codigo]: 'idle' }));
                      }}
                      onBlur={() => canEdit && void guardar(t.codigo)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      style={{
                        width: 78, padding: '6px 9px', fontSize: 14, fontWeight: 700,
                        textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                        borderRadius: 7, border: `1px solid ${st === 'error' ? '#DC2626' : '#CBD5E1'}`,
                        background: canEdit ? '#fff' : '#F8FAFC', color: '#0F172A',
                      }} />
                  </td>
                  <td style={{ ...td, fontSize: 12.5 }}>
                    {st === 'saving' && <span style={{ color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Loader2 size={13} className="animate-spin" /> Guardando…</span>}
                    {st === 'ok'     && <span style={{ color: '#15803D', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}><Check size={13} /> Guardado</span>}
                    {st === 'error'  && <span style={{ color: '#B91C1C', display: 'inline-flex', alignItems: 'flex-start', gap: 5 }}><AlertTriangle size={13} style={{ marginTop: 2, flexShrink: 0 }} /> {msg[t.codigo]}</span>}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={5} style={{ ...td, color: '#64748B', textAlign: 'center', padding: 24 }}>
                Ninguna tienda calza con «{busca}».
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
