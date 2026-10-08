'use client';

import React from 'react';
import { GRUPOS, PESTANAS, type PestanaPicking } from './pestanas';

interface Props {
  tab: PestanaPicking;
  onTab: (t: PestanaPicking) => void;
  /** Tiendas elegidas: se muestran junto a la pestaña de operación abierta. */
  tiendasElegidas: number;
  onAyuda: () => void;
}

/** Menú lateral (escritorio): las siete pestañas agrupadas en Operación, Seguimiento y Ajustes. */
export function MenuLateral({ tab, onTab, tiendasElegidas, onAyuda }: Props) {
  return (
    <nav className="pk-nav print:hidden" aria-label="Secciones de Picking">
      {GRUPOS.map(g => (
        <React.Fragment key={g}>
          <span className="pk-navg">{g}</span>
          {PESTANAS.filter(p => p.grupo === g).map(p => {
            const on = p.key === tab;
            const n = on && g === 'Operación' && tiendasElegidas > 0
              ? `${tiendasElegidas} ${tiendasElegidas === 1 ? 'tienda' : 'tiendas'}` : null;
            return (
              <button key={p.key} type="button" onClick={() => onTab(p.key)}
                aria-current={on ? 'page' : undefined}
                className={`pk-navi${on ? ' on' : ''}`}>
                <span className="dot" aria-hidden="true" />{p.label}
                {n && <span className="n">{n}</span>}
              </button>
            );
          })}
        </React.Fragment>
      ))}
      <span className="pk-sp" />
      <button type="button" className="pk-navi ayuda" onClick={onAyuda} aria-keyshortcuts="?">
        Ayuda y atajos
      </button>
    </nav>
  );
}
