'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { PickerGroupCard } from '../components/PickerGroupCard';
import { COLOR_SECCION, colorAvatar, iniciales } from './filaEncargado';
import type { FilaSeco } from './TablaEncargados';

interface Props {
  fila: FilaSeco;
  nombreTienda: string;
  onCerrar: () => void;
  onAnterior?: () => void;
  onSiguiente?: () => void;
}

/** Panel lateral con el detalle de un encargado (diseño SecoDetalle). */
export function PanelEncargado({ fila, nombreTienda, onCerrar, onAnterior, onSiguiente }: Props) {
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => { cerrar.current?.focus(); }, [fila.group.stateKey]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  return (
    <>
      <button type="button" className="pk-velo-main print:hidden" tabIndex={-1} aria-hidden="true" onClick={onCerrar} />
      <section className="pk-panel print:hidden" role="dialog" aria-modal="true" aria-labelledby="pk-panel-titulo">
        <div className="pk-panel-h">
          <span className="pk-av" style={{ background: colorAvatar(fila.group.key) }} aria-hidden="true">{iniciales(fila.nombre)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 2 }}>
            <span id="pk-panel-titulo" className="pk-ttl">{fila.nombre}</span>
            <span className="pk-sub">
              {nombreTienda} ·{' '}
              {fila.categorias.map(c => (
                <span key={c} className="pk-chip"><i style={{ background: COLOR_SECCION[c] ?? '#8A91A1' }} />{c}</span>
              ))}
            </span>
          </span>
          <button ref={cerrar} type="button" className="pk-btn" style={{ padding: '6px 10px' }} onClick={onCerrar} aria-label="Cerrar el detalle">
            <X size={15} />
          </button>
        </div>
        <PickerGroupCard {...fila.tarjeta} variante="panel" unidades={fila.unidades} notaUnidades={fila.nota}
          pie={<>
            <button type="button" className="pk-btn" onClick={onAnterior} disabled={!onAnterior}>Anterior</button>
            <button type="button" className="pk-btn" onClick={onSiguiente} disabled={!onSiguiente}>Siguiente</button>
          </>} />
      </section>
    </>
  );
}
