'use client';

// El «?» al lado de lo que confunde. En computador abre una burbuja fija sobre la pantalla, ubicada
// con `posicionBurbuja` para que nunca se corte (antes colgaba del botón y se salía del panel); en
// teléfono y handheld la misma burbuja se ve como hoja desde abajo (lo decide marco.css, que ahí no
// usa la posición calculada). El texto vive en ayudaContexto.ts.

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AYUDITAS, EVENTO_ABRIR_GUIA, posicionBurbuja, type PosBurbuja, type TemaAyudita } from './ayudaContexto';

export function Ayudita({ tema }: { tema: TemaAyudita }) {
  const [abierta, setAbierta] = useState(false);
  const [pos, setPos] = useState<PosBurbuja | null>(null);
  const caja = useRef<HTMLSpanElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const globo = useRef<HTMLSpanElement>(null);
  const id = useId();
  const a = AYUDITAS[tema];

  useEffect(() => {
    if (!abierta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierta(false); } };
    const fuera = (e: PointerEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierta(false); };
    window.addEventListener('keydown', esc, true);
    window.addEventListener('pointerdown', fuera);
    return () => { window.removeEventListener('keydown', esc, true); window.removeEventListener('pointerdown', fuera); };
  }, [abierta]);

  // Se mide antes de pintar, y otra vez si cambia la pantalla o algo se desplaza debajo.
  useLayoutEffect(() => {
    if (!abierta) { setPos(null); return; }
    const medir = () => {
      const b = boton.current?.getBoundingClientRect();
      const g = globo.current;
      if (!b || !g) return;
      setPos(posicionBurbuja(b, { ancho: window.innerWidth, alto: window.innerHeight }, { ancho: g.offsetWidth, alto: g.offsetHeight }));
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [abierta]);

  // Va dentro de <label> y de filas que se abren al tocar: el toque no tiene que llegar a ellos.
  const parar = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  const estilo = pos
    ? { '--q-x': `${pos.x}px`, '--q-y': `${pos.y}px`, '--q-flecha': `${pos.flecha}px` } as React.CSSProperties
    : { visibility: 'hidden' as const };

  return (
    <span ref={caja} className="pk-q-caja print:hidden">
      <button ref={boton} type="button" className={`pk-q${abierta ? ' on' : ''}`}
        aria-label={`Ayuda: ${a.titulo}`} aria-expanded={abierta} aria-controls={id}
        onClick={e => { parar(e); setAbierta(v => !v); }}>?</button>
      {abierta && (
        <>
          <span className="pk-q-velo" aria-hidden="true" onClick={e => { parar(e); setAbierta(false); }} />
          <span ref={globo} id={id} role="dialog" aria-label={a.titulo}
            className={`pk-q-burbuja${pos?.arriba ? ' arriba' : ''}`} style={estilo}>
            <b>{a.titulo}</b>
            <ul>{a.lineas.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <span className="pk-q-pie">
              <button type="button" className="pk-q-guia" onClick={e => {
                parar(e); setAbierta(false); window.dispatchEvent(new Event(EVENTO_ABRIR_GUIA));
              }}>Ver guía completa</button>
              <button type="button" className="pk-btn pri pk-q-ok" onClick={e => { parar(e); setAbierta(false); }}>Entendido</button>
            </span>
          </span>
        </>
      )}
    </span>
  );
}
