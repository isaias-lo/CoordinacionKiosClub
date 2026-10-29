'use client';

// El «?» de Bodega al lado de lo que confunde. Los textos viven en ayudaBodega.ts.
//
// Es el mismo gesto que el «?» de Picking (`picking/marco/Ayudita.tsx`) y usa su misma cuenta de
// posición (`posicionBurbuja`), pero dibujado con los colores de Bodega: el de Picking depende de
// marco.css, que Bodega no carga. En pantallas anchas abre una burbuja junto al botón; en el
// teléfono, una hoja desde abajo, que no se corta ni tapa el dedo.
//
// La burbuja va en <body> con un portal por lo mismo que la de Picking: `#main-content` lleva
// `transform`, que vuelve a ese contenedor la referencia de `position: fixed` y la cortaba.

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { posicionBurbuja, type PosBurbuja } from '@/features/picking/marco/ayudaContexto';
import { AYUDAS_BODEGA, type TemaAyudaBodega } from './ayudaBodega';

const ANCHO_HOJA = 640;

export function AyudaBodega({ tema }: { tema: TemaAyudaBodega }) {
  const [abierta, setAbierta] = useState(false);
  const [pos, setPos] = useState<PosBurbuja | null>(null);
  const [hoja, setHoja] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const globo = useRef<HTMLDivElement>(null);
  const id = useId();
  const a = AYUDAS_BODEGA[tema];

  const cerrar = (devolverFoco = true) => {
    setAbierta(false);
    if (devolverFoco) boton.current?.focus();
  };

  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAbierta(false);
      boton.current?.focus();
    };
    window.addEventListener('keydown', esc, true);
    globo.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => window.removeEventListener('keydown', esc, true);
  }, [abierta]);

  useLayoutEffect(() => {
    if (!abierta) { setPos(null); return; }
    const medir = () => {
      const enHoja = window.innerWidth < ANCHO_HOJA;
      setHoja(enHoja);
      const b = boton.current?.getBoundingClientRect();
      const g = globo.current;
      if (enHoja || !b || !g) return;
      setPos(posicionBurbuja(b, { ancho: window.innerWidth, alto: window.innerHeight }, { ancho: g.offsetWidth, alto: g.offsetHeight }));
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [abierta]);

  // Va junto a rótulos y filas que se abren al tocar: el toque no tiene que llegar a ellos.
  const parar = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  const lugar: React.CSSProperties = hoja
    ? { left: 0, right: 0, bottom: 0 }
    : pos
      ? { left: pos.x, top: pos.y, maxHeight: pos.altoMax, width: 320 }
      : { visibility: 'hidden', left: 0, top: 0, width: 320 };

  return (
    <>
      <button ref={boton} type="button"
        aria-label={`Ayuda: ${a.titulo}`} aria-expanded={abierta} aria-controls={abierta ? id : undefined}
        onClick={e => { parar(e); setAbierta(v => !v); }}
        className="relative inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border border-border-2 bg-card text-text-2 text-rotulo font-extrabold leading-none cursor-pointer align-middle normal-case tracking-normal print:hidden
          before:content-[''] before:absolute before:-inset-[11px]">
        ?
      </button>
      {abierta && createPortal(
        <>
          <div aria-hidden="true" className="fixed inset-0 z-[650] bg-black/30" onClick={e => { parar(e); cerrar(); }} />
          <div ref={globo} id={id} role="dialog" aria-modal="false" aria-labelledby={`${id}-t`}
            onClick={e => e.stopPropagation()}
            className={`fixed z-[660] bg-card text-text shadow-kios border border-border overflow-auto p-4 flex flex-col gap-2 ${
              hoja ? 'rounded-t-kios pb-[calc(16px+env(safe-area-inset-bottom))] max-h-[70vh]' : 'rounded-kios'}`}
            style={lugar}>
            <h3 id={`${id}-t`} className="m-0 text-cuerpo font-extrabold">{a.titulo}</h3>
            <ul className="m-0 pl-5 flex flex-col gap-1.5 list-disc text-apoyo text-text-2">
              {a.lineas.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            <button type="button" onClick={e => { parar(e); cerrar(); }}
              className="self-end min-h-[44px] px-5 mt-1 rounded-btn bg-navy text-white border-none text-apoyo font-bold cursor-pointer active:opacity-80">
              Entendido
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
