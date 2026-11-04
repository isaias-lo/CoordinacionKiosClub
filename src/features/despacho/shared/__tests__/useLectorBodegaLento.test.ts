// @vitest-environment jsdom
// La pistola con el equipo ocupado: las teclas llegan con pausas que cortan la ráfaga. Antes no
// pasaba nada (ni pitido); ahora, si lo escrito calza con una etiqueta, se toma como lectura.
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLectorBodega } from '../useLectorBodega';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ETIQUETAS = new Set(['P130PHU21102026P', '4127']);
let root: Root | null = null;

function montar() {
  const leidas: string[] = [];
  function Pantalla() {
    useLectorBodega({ activo: true, reconoce: c => ETIQUETAS.has(c), alEscanear: c => { leidas.push(c); } });
    return null;
  }
  const div = document.createElement('div');
  root = createRoot(div);
  act(() => { root!.render(React.createElement(Pantalla)); });
  return leidas;
}

/** Un campo Peso de tarjeta con el foco puesto. */
function campoPeso(valor = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.setAttribute('data-campo', 'peso');
  el.value = valor;
  document.body.appendChild(el);
  el.focus();
  return el;
}

function tecla(key: string, t: number) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'timeStamp', { value: t });
  (document.activeElement ?? window).dispatchEvent(e);
  const el = document.activeElement;
  // Lo que haría el navegador: escribir el carácter en el campo si nadie lo frenó.
  if (!e.defaultPrevented && key.length === 1 && el instanceof HTMLInputElement) el.value += key;
}

function escribir(texto: string, horas: number[]) {
  [...texto].forEach((c, i) => tecla(c, horas[i]!));
}

afterEach(() => {
  act(() => { root?.unmount(); });
  root = null;
  document.body.innerHTML = '';
});

describe('useLectorBodega · equipo ocupado', () => {
  it('una etiqueta que llegó con frenadas se lee igual, y el Peso queda como estaba', () => {
    const leidas = montar();
    const peso = campoPeso('35');
    const horas = [0, 8, 16, 166, 174, 182, 482, 490, 498, 506, 514, 522, 530, 538, 546, 554];
    escribir('P130PHU21102026P', horas);
    tecla('Enter', 562);
    expect(leidas).toEqual(['P130PHU21102026P']);
    expect(peso.value).toBe('35');
  });

  it('la lectura rápida de siempre sigue igual', () => {
    const leidas = montar();
    campoPeso();
    escribir('P130PHU21102026P', [...Array(16)].map((_, i) => i * 8));
    tecla('Enter', 130);
    expect(leidas).toEqual(['P130PHU21102026P']);
  });

  it('un peso tecleado que coincide con un número de pallet no se toma como lectura', () => {
    const leidas = montar();
    const peso = campoPeso();
    escribir('4127', [0, 150, 300, 450]);
    tecla('Enter', 600);
    expect(leidas).toEqual([]);
    expect(peso.value).toBe('4127');
  });

  it('algo lento que no es una etiqueta de hoy no hace nada', () => {
    const leidas = montar();
    campoPeso();
    escribir('X999ZZZ01012026X', [...Array(16)].map((_, i) => i * 100));
    tecla('Enter', 1700);
    expect(leidas).toEqual([]);
  });

  it('sin cursor en ningún campo, un número de pallet lento también se lee', () => {
    const leidas = montar();
    escribir('4127', [0, 90, 180, 270]);
    tecla('Enter', 360);
    expect(leidas).toEqual(['4127']);
  });
});
