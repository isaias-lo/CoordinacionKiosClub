'use client';

// Barra de abajo de teléfono y handheld (diseño «Picking, propuesta empresarial», Teléfono):
// Seco, Congelados y Actividad a un toque; el resto y la ayuda en «Más».

import React from 'react';
import { PESTANAS, type PestanaPicking } from '../marco/pestanas';

const PRINCIPALES: PestanaPicking[] = ['monitoreo', 'congelados', 'actividad'];
const AYUDA = 'ayuda';

interface Props {
  tab: PestanaPicking;
  onTab: (k: PestanaPicking) => void;
  onAyuda: () => void;
}

export function BarraInferior({ tab, onTab, onAyuda }: Props) {
  const enMas = PESTANAS.filter(p => !PRINCIPALES.includes(p.key));
  const masActiva = enMas.some(p => p.key === tab);
  return (
    <nav className="pk-tel-nav print:hidden" aria-label="Secciones de Picking">
      {PRINCIPALES.map(k => {
        const on = tab === k;
        return (
          <button key={k} type="button" className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => onTab(k)}>
            <i aria-hidden="true" />{PESTANAS.find(p => p.key === k)!.label}
          </button>
        );
      })}
      <label className={masActiva ? 'on' : ''}>
        <i aria-hidden="true" />Más
        <select value={masActiva ? tab : ''} aria-label="Más secciones"
          onChange={e => {
            const v = e.target.value;
            if (v === AYUDA) onAyuda(); else if (v) onTab(v as PestanaPicking);
          }}>
          <option value="" disabled>Más</option>
          {enMas.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          <option value={AYUDA}>Ayuda y atajos</option>
        </select>
      </label>
    </nav>
  );
}
