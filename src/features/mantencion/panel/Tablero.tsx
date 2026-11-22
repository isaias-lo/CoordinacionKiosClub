'use client';

import { useMemo, useState } from 'react';
import { ZONAS_MANTENCION, etiquetaZona } from '../utils/zonaTienda';
import { esTrabajoAbierto, textoAlerta, type FichaTienda } from '../utils/tablero';
import type { SolicitudMant } from '../tipos';
import { Insignia, Tarjeta } from '../ui';
import { TarjetaGestion } from './TarjetaGestion';

const TODAS = 'Todas';

/**
 * Las tiendas con trabajo abierto, en tarjetas ordenadas por prioridad (`prioridad.ts`): arriba las
 * que más requieren acción. Se reordenan solas cuando entra o cambia algo.
 */
export function Tablero(
  { fichas, solicitudes, tiendaAbierta, abrirTienda, alCambiar }:
  {
    fichas: FichaTienda[]; solicitudes: SolicitudMant[]; tiendaAbierta: string | null;
    abrirTienda: (cod: string | null) => void; alCambiar: () => void;
  },
) {
  const [zona, setZona] = useState(TODAS);
  const zonas = useMemo(() => {
    const base = [TODAS, ...ZONAS_MANTENCION.map(etiquetaZona)];
    return fichas.some(f => f.zona === 'Sin zona') ? [...base, 'Sin zona'] : base;
  }, [fichas]);
  const visibles = fichas.filter(f => zona === TODAS || f.zona === zona);
  const abierta = tiendaAbierta ? fichas.find(f => f.codigoTienda === tiendaAbierta) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Solicitudes por tienda</h2>
          <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>Se reordenan solas: arriba las que más requieren acción.</p>
        </div>
        <div role="group" aria-label="Zona" className="flex flex-wrap gap-1">
          {zonas.map(z => (
            <button key={z} type="button" aria-pressed={zona === z} onClick={() => setZona(z)}
              className="min-h-[36px] rounded-full px-3 text-sm font-semibold"
              style={zona === z
                ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                : { background: 'var(--color-bg-2)', color: 'var(--color-text-sub)' }}>
              {z}
            </button>
          ))}
        </div>
      </div>

      <div className={abierta ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : ''}>
        <div className={abierta ? 'grid content-start gap-3 sm:grid-cols-2' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}>
          {visibles.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
              {fichas.length === 0 ? 'No hay solicitudes abiertas.' : 'No hay tiendas con solicitudes en esta zona.'}
            </p>
          )}
          {visibles.map(f => <TarjetaTienda key={f.codigoTienda} f={f} activa={abierta?.codigoTienda === f.codigoTienda}
            alAbrir={() => abrirTienda(abierta?.codigoTienda === f.codigoTienda ? null : f.codigoTienda)} />)}
        </div>

        {abierta && (
          <DetalleTienda f={abierta} solicitudes={solicitudes.filter(s => s.codigoTienda === abierta.codigoTienda)}
            cerrar={() => abrirTienda(null)} alCambiar={alCambiar} />
        )}
      </div>
    </div>
  );
}

function TarjetaTienda({ f, activa, alAbrir }: { f: FichaTienda; activa: boolean; alAbrir: () => void }) {
  const borde = f.nivel === 'roja' ? 'var(--est-error)' : f.nivel === 'ambar' ? 'var(--est-aviso)' : 'var(--color-border)';
  return (
    <div className="rounded-xl p-4" style={{
      background: 'var(--color-card)', border: `1px solid ${borde}`,
      boxShadow: activa ? `0 0 0 2px ${borde}` : undefined,
    }}>
      <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{f.codigoTienda} · {f.zona}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="font-semibold">{f.nombre}</p>
        <p className="text-right leading-none">
          <span className="text-2xl font-bold tabular-nums">{f.abiertas}</span>
          <span className="block text-xs" style={{ color: 'var(--color-text-sub)' }}>abiertas</span>
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {f.alertas.map(a => <Insignia key={a.tipo} tono={a.nivel === 'roja' ? 'rojo' : 'ambar'}>{textoAlerta(a)}</Insignia>)}
        {f.porRevisar > 0 && <Insignia tono="azul">{f.porRevisar} por revisar</Insignia>}
      </div>
      <button type="button" onClick={alAbrir} aria-expanded={activa}
        className="mt-3 min-h-[40px] w-full rounded-xl text-sm font-semibold"
        style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
        {activa ? 'Cerrar' : 'Ver solicitudes'}
      </button>
    </div>
  );
}

function DetalleTienda(
  { f, solicitudes, cerrar, alCambiar }:
  { f: FichaTienda; solicitudes: SolicitudMant[]; cerrar: () => void; alCambiar: () => void },
) {
  const [verCerradas, setVerCerradas] = useState(false);
  const abiertas = solicitudes.filter(esTrabajoAbierto);
  const cerradas = solicitudes.filter(s => !esTrabajoAbierto(s));
  return (
    <section aria-label={`Solicitudes de ${f.nombre}`} className="space-y-3">
      <Tarjeta>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-sub)' }}>Solicitudes de la tienda</p>
            <h3 className="text-lg font-bold">{f.nombre}</h3>
            <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
              {f.abiertas} abiertas · {f.sinProgramar} sin programar · la más antigua: {f.diasMasAntigua} {f.diasMasAntigua === 1 ? 'día' : 'días'}
            </p>
          </div>
          <button type="button" onClick={cerrar} className="text-sm font-semibold underline">Cerrar</button>
        </div>
      </Tarjeta>
      {abiertas.map(s => <TarjetaGestion key={s.id} s={s} alCambiar={alCambiar} />)}
      {cerradas.length > 0 && (
        <button type="button" onClick={() => setVerCerradas(v => !v)} className="text-sm font-semibold underline">
          {verCerradas ? 'Ocultar' : 'Ver'} las {cerradas.length} cerradas o descartadas
        </button>
      )}
      {verCerradas && cerradas.map(s => <TarjetaGestion key={s.id} s={s} alCambiar={alCambiar} />)}
    </section>
  );
}
