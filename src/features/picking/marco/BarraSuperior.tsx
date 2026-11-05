'use client';

import React from 'react';
import { fechaCorta, pestana, textoConexion, textoConexionCorto, type PestanaPicking } from './pestanas';
import { Ayudita } from './Ayudita';
import { MenuArriba } from './MenuArriba';

interface Props {
  tab: PestanaPicking;
  online: boolean;
  /** Acciones de Picking que esperan en la cola de este equipo. */
  pendientes: number;
  /** Teléfono y handheld, con la planilla abierta: volver a la lista de tiendas. */
  onVolverATiendas?: () => void;
  /** Escritorio: el menú de secciones vive acá desde que se sacó el lateral, que ocupaba 201 px
   *  que la planilla necesita. En teléfono no se pasa: ahí el menú es `BarraInferior`. */
  menu?: { onTab: (t: PestanaPicking) => void; tiendasElegidas: number; onAyuda: () => void };
}

/** Franja superior blanca: ruta a la izquierda; conexión y fecha a la derecha. */
export function BarraSuperior({ tab, online, pendientes, onVolverATiendas, menu }: Props) {
  const p = pestana(tab);
  return (
    <header className="pk-top mobile-menu-safe print:hidden">
      {onVolverATiendas && (
        <button type="button" onClick={onVolverATiendas} className="pk-btn lg:hidden" style={{ padding: '6px 10px' }}>
          ← Tiendas
        </button>
      )}
      {menu && (
        <MenuArriba tab={tab} onTab={menu.onTab}
                    tiendasElegidas={menu.tiendasElegidas} onAyuda={menu.onAyuda} />
      )}
      {/* Con el menú arriba, el grupo ya se ve resaltado ahí: repetirlo en la ruta sería decir dos
          veces lo mismo en la misma franja. En teléfono no hay menú y la ruta queda entera. */}
      <span className="pk-crumb">{!menu && <span className="max-lg:hidden">{p.grupo} / </span>}<b>{p.label}</b></span>
      <span className="pk-sp" />
      <span className={`pk-sync${online ? '' : ' off'}`} role="status" title={textoConexion(online, pendientes)}>
        <i aria-hidden="true" />
        <span className="max-lg:hidden">{textoConexion(online, pendientes)}</span>
        <span className="lg:hidden">{textoConexionCorto(online, pendientes)}</span>
      </span>
      <Ayudita tema="conexion" />
      <span className="pk-fecha max-lg:hidden">{fechaCorta(new Date())}</span>
    </header>
  );
}
