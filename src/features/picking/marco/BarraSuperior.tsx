'use client';

import React from 'react';
import { fechaCorta, pestana, textoConexion, textoConexionCorto, type PestanaPicking } from './pestanas';

interface Props {
  tab: PestanaPicking;
  online: boolean;
  /** Acciones de Picking que esperan en la cola de este equipo. */
  pendientes: number;
  /** Teléfono y handheld, con la planilla abierta: volver a la lista de tiendas. */
  onVolverATiendas?: () => void;
}

/** Franja superior blanca: ruta a la izquierda; conexión y fecha a la derecha. */
export function BarraSuperior({ tab, online, pendientes, onVolverATiendas }: Props) {
  const p = pestana(tab);
  return (
    <header className="pk-top mobile-menu-safe print:hidden">
      {onVolverATiendas && (
        <button type="button" onClick={onVolverATiendas} className="pk-btn lg:hidden" style={{ padding: '6px 10px' }}>
          ← Tiendas
        </button>
      )}
      <span className="pk-crumb"><span className="max-lg:hidden">{p.grupo} / </span><b>{p.label}</b></span>
      <span className="pk-sp" />
      <span className={`pk-sync${online ? '' : ' off'}`} role="status" title={textoConexion(online, pendientes)}>
        <i aria-hidden="true" />
        <span className="max-lg:hidden">{textoConexion(online, pendientes)}</span>
        <span className="lg:hidden">{textoConexionCorto(online, pendientes)}</span>
      </span>
      <span className="pk-fecha max-lg:hidden">{fechaCorta(new Date())}</span>
    </header>
  );
}
