'use client';

// El «?» al lado de lo que confunde. En computador abre una burbuja debajo del botón; en teléfono y
// handheld la misma burbuja se ve como hoja desde abajo (lo decide marco.css, no el código).
// El texto vive en ayudaContexto.ts.

import React, { useEffect, useId, useRef, useState } from 'react';
import { AYUDITAS, EVENTO_ABRIR_GUIA, type TemaAyudita } from './ayudaContexto';

/** `lado="der"` abre la burbuja hacia la izquierda, para un «?» pegado al borde derecho. */
export function Ayudita({ tema, lado }: { tema: TemaAyudita; lado?: 'der' }) {
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
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

  // Va dentro de <label> y de filas que se abren al tocar: el toque no tiene que llegar a ellos.
  const parar = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <span ref={caja} className={`pk-q-caja print:hidden${lado === 'der' ? ' der' : ''}`}>
      <button type="button" className={`pk-q${abierta ? ' on' : ''}`}
        aria-label={`Ayuda: ${a.titulo}`} aria-expanded={abierta} aria-controls={id}
        onClick={e => { parar(e); setAbierta(v => !v); }}>?</button>
      {abierta && (
        <>
          <span className="pk-q-velo" aria-hidden="true" onClick={e => { parar(e); setAbierta(false); }} />
          <span id={id} role="dialog" aria-label={a.titulo} className="pk-q-burbuja">
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
