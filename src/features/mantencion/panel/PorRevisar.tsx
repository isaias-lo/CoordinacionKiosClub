'use client';

import { useState } from 'react';
import { decidir } from '../apiCliente';
import { duplicadosPendientes, sinClasificar, type ParDescartado } from '../utils/tablero';
import { haceCuanto } from '../utils/conversacion';
import { tituloDeSolicitud } from '../utils/formulario';
import type { SolicitudMant } from '../tipos';
import { Tarjeta } from '../ui';
import { TarjetaGestion } from './TarjetaGestion';

/**
 * Todo lo nuevo llega acá: clasificar la urgencia, pedir más detalle si está poco clara y resolver
 * los posibles duplicados antes de programar.
 */
export function PorRevisar(
  { solicitudes, pares, alCambiar }:
  { solicitudes: SolicitudMant[]; pares: ParDescartado[]; alCambiar: () => void },
) {
  const pendientes = duplicadosPendientes(solicitudes, pares);
  const nuevas = sinClasificar(solicitudes, pendientes);

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
        Clasifica la urgencia, pide más detalle si está poco clara y resuelve los duplicados antes de programar.
      </p>

      <section aria-labelledby="sin-clasificar" className="space-y-3">
        <h2 id="sin-clasificar" className="text-base font-bold">Sin clasificar · {nuevas.length}</h2>
        {nuevas.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>Nada nuevo por clasificar.</p>}
        {nuevas.map(s => <TarjetaGestion key={s.id} s={s} alCambiar={alCambiar} abiertaDeEntrada />)}
      </section>

      <section aria-labelledby="duplicados" className="space-y-3">
        <h2 id="duplicados" className="text-base font-bold">Posibles duplicados · {pendientes.length}</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          Misma tienda y misma categoría. Mientras no decidas, la nueva no suma al conteo de la tienda.
        </p>
        {pendientes.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>No hay posibles duplicados.</p>}
        {pendientes.map(p => (
          <ParDuplicado key={`${p.original.id}-${p.posible.id}`} original={p.original} posible={p.posible} alCambiar={alCambiar} />
        ))}
      </section>
    </div>
  );
}

function ParDuplicado(
  { original, posible, alCambiar }: { original: SolicitudMant; posible: SolicitudMant; alCambiar: () => void },
) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hacer = async (accion: 'unir' | 'no_duplicado') => {
    setOcupado(true);
    setError(null);
    try { await decidir(posible.id, { accion, originalId: original.id }); alCambiar(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  };

  return (
    <Tarjeta>
      <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{posible.nombreTienda} · {posible.categoria}</p>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <Lado etiqueta="Nueva" s={posible} />
        <Lado etiqueta="Original" s={original} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={ocupado} onClick={() => hacer('unir')}
          className="min-h-[40px] rounded-xl px-4 text-sm font-bold disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: '#fff' }}>
          Unir con la original
        </button>
        <button type="button" disabled={ocupado} onClick={() => hacer('no_duplicado')}
          className="min-h-[40px] rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          No es duplicado
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--est-error)' }}>{error}</p>}
    </Tarjeta>
  );
}

function Lado({ etiqueta, s }: { etiqueta: string; s: SolicitudMant }) {
  const foto = s.fotos.find(f => f.url);
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-bg-2)' }}>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-sub)' }}>{etiqueta}</p>
      <p className="mt-1 font-semibold">{tituloDeSolicitud(s.descripcion)}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
        {haceCuanto(s.creadaEn)} · {s.fotos.length} {s.fotos.length === 1 ? 'foto' : 'fotos'}
      </p>
      {foto?.url && (
        <a href={foto.url} target="_blank" rel="noreferrer" className="mt-2 block aspect-video overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt={`Foto de: ${tituloDeSolicitud(s.descripcion, 40)}`} className="h-full w-full object-cover" loading="lazy" />
        </a>
      )}
    </div>
  );
}
