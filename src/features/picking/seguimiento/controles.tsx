'use client';

// Controles compartidos de Seguimiento: el selector de día (Hoy · Ayer · Elegir día) y el
// desplegable con forma de campo («Tienda: todas ▾»).

import { useState } from 'react';
import { shiftDate } from './cargarDia';

/** «7 oct» a partir de YYYY-MM-DD. */
export function diaCorto(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function SelectorDia({ dia, hoy, onDia }: { dia: string; hoy: string; onDia: (d: string) => void }) {
  const ayer = shiftDate(hoy, -1);
  const otro = dia !== hoy && dia !== ayer;
  const [eligiendo, setEligiendo] = useState(false);
  return (
    <span className="pk-seg" role="group" aria-label="Día">
      <button type="button" className={dia === hoy ? 'on' : ''} aria-pressed={dia === hoy} onClick={() => { setEligiendo(false); onDia(hoy); }}>Hoy</button>
      <button type="button" className={dia === ayer ? 'on' : ''} aria-pressed={dia === ayer} onClick={() => { setEligiendo(false); onDia(ayer); }}>Ayer</button>
      {eligiendo || otro ? (
        <input type="date" aria-label="Elegir día" value={dia} max={hoy}
          onChange={e => { if (e.target.value) onDia(e.target.value); }} />
      ) : (
        <button type="button" onClick={() => setEligiendo(true)}>Elegir día</button>
      )}
    </span>
  );
}

export function Desplegable({ etiqueta, todos, valor, opciones, nombre = v => v, onCambio }: {
  etiqueta: string;
  todos: string;
  valor: string | null;
  opciones: string[];
  nombre?: (v: string) => string;
  onCambio: (v: string | null) => void;
}) {
  return (
    <label className="pk-select">
      <span className="k">{etiqueta}:</span>
      <span className="v">{valor ? nombre(valor) : todos}</span>
      <span aria-hidden="true">▾</span>
      <select value={valor ?? ''} aria-label={etiqueta} onChange={e => onCambio(e.target.value || null)}>
        <option value="">{todos}</option>
        {opciones.map(o => <option key={o} value={o}>{nombre(o)}</option>)}
      </select>
    </label>
  );
}
