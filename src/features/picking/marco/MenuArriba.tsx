'use client';

// El menú de Picking en la barra de arriba: Operación, Seguimiento y Ajustes como desplegables.
//
// ── POR QUÉ SE MOVIÓ ──────────────────────────────────────────────────────────────────────────
//
// Estaba al costado y medía 201 px (`.pk-nav{width:200px}` más el borde). La planilla necesita ese
// ancho: con el menú al lado, la columna de Chocolate se cortaba y «Valentina Conejera» salía como
// «Valentina Coneje». Arriba, esos 201 px se los queda la tabla.
//
// Se evaluó también plegar el menú lateral a íconos. Daba 151 px y conservaba el clic único, pero
// las pestañas no tienen ícono —solo un punto de color— así que habría que inventar ocho y pasar a
// navegar por dibujos. El coordinador eligió esta.
//
// ── LO QUE CUESTA, Y DÓNDE NO ─────────────────────────────────────────────────────────────────
//
// Cambiar de grupo pasa a ser dos clics: abrir y elegir. DENTRO de un grupo sigue siendo uno,
// porque el desplegable ya está abierto, y es donde se vive: entre Actividad, Planilla, Historial
// y Estadísticas.
//
// En teléfono no cambia nada: ahí el menú es `BarraInferior`, con Seco, Congelados, Actividad y
// «Más». Este componente solo se monta en escritorio.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GRUPOS, PESTANAS, type GrupoPestanas, type PestanaPicking } from './pestanas';

interface Props {
  tab: PestanaPicking;
  onTab: (t: PestanaPicking) => void;
  /** Tiendas elegidas: se muestran junto a la pestaña de operación abierta. */
  tiendasElegidas: number;
  onAyuda: () => void;
}

export function MenuArriba({ tab, onTab, tiendasElegidas, onAyuda }: Props) {
  const [abierto, setAbierto] = useState<GrupoPestanas | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => setAbierto(null), []);

  // Cerrar al tocar fuera y con Escape. Un menú que solo se cierra volviendo a tocar su botón se
  // queda abierto tapando la primera fila de la planilla, que es justo lo que se quería liberar.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) cerrar();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('mousedown', afuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto, cerrar]);

  const grupoActivo = PESTANAS.find(p => p.key === tab)?.grupo;

  return (
    <div className="pk-menu print:hidden" ref={caja}>
      {GRUPOS.map(g => {
        const desplegado = abierto === g;
        return (
          <div key={g} className="pk-menug">
            <button
              type="button"
              className={`pk-menub${g === grupoActivo ? ' on' : ''}`}
              aria-expanded={desplegado}
              aria-haspopup="menu"
              onClick={() => setAbierto(a => (a === g ? null : g))}
            >
              {g}
              <span className="car" aria-hidden="true" />
            </button>

            {desplegado && (
              <div className="pk-menud" role="menu" aria-label={g}>
                {PESTANAS.filter(p => p.grupo === g).map(p => {
                  const on = p.key === tab;
                  // El conteo de tiendas solo tiene sentido en la pestaña de operación abierta.
                  const n = on && g === 'Operación' && tiendasElegidas > 0
                    ? `${tiendasElegidas} ${tiendasElegidas === 1 ? 'tienda' : 'tiendas'}` : null;
                  return (
                    <button
                      key={p.key} type="button" role="menuitem"
                      className={`pk-menui${on ? ' on' : ''}`}
                      aria-current={on ? 'page' : undefined}
                      onClick={() => { onTab(p.key); cerrar(); }}
                    >
                      <span className="dot" aria-hidden="true" />{p.label}
                      {n && <span className="n">{n}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Vivía al fondo del menú lateral. Sin esto, en escritorio la ayuda solo se abriría con `?`,
          que es justamente la tecla que hay que descubrir ahí adentro. */}
      <button type="button" className="pk-menub ayuda" onClick={onAyuda} aria-keyshortcuts="?">
        Ayuda y atajos
      </button>
    </div>
  );
}
