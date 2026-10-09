import { describe, it, expect } from 'vitest';
import { accionDeTecla, estaEscribiendo, ATAJOS, GUIA } from '../marco/ayuda';

describe('accionDeTecla', () => {
  it('/ busca y ? abre la ayuda', () => {
    expect(accionDeTecla({ key: '/' }, false)).toEqual({ tipo: 'buscar' });
    expect(accionDeTecla({ key: '?' }, false)).toEqual({ tipo: 'ayuda' });
  });
  it('los números van a las pestañas en el orden del menú', () => {
    expect(accionDeTecla({ key: '1' }, false)).toEqual({ tipo: 'pestana', key: 'monitoreo' });
    expect(accionDeTecla({ key: '2' }, false)).toEqual({ tipo: 'pestana', key: 'congelados' });
    expect(accionDeTecla({ key: '7' }, false)).toEqual({ tipo: 'pestana', key: 'configuracion' });
    expect(accionDeTecla({ key: '8' }, false)).toBeNull();
    expect(accionDeTecla({ key: '0' }, false)).toBeNull();
  });
  it('no hace nada mientras se escribe ni con modificadores', () => {
    expect(accionDeTecla({ key: '1' }, true)).toBeNull();
    expect(accionDeTecla({ key: '1', ctrlKey: true }, false)).toBeNull();
    expect(accionDeTecla({ key: '/', metaKey: true }, false)).toBeNull();
  });
});

describe('estaEscribiendo', () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as Element;
  it('campos de texto sí, casillas no', () => {
    expect(estaEscribiendo(el('INPUT', { type: 'text' }))).toBe(true);
    expect(estaEscribiendo(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(estaEscribiendo(el('TEXTAREA'))).toBe(true);
    expect(estaEscribiendo(el('BUTTON'))).toBe(false);
    expect(estaEscribiendo(null)).toBe(false);
  });
});

describe('guía', () => {
  it('cada atajo de pestaña coincide con una tecla real', () => {
    for (const a of ATAJOS.filter(a => /^\d$/.test(a.teclas[0]))) {
      expect(accionDeTecla({ key: a.teclas[0] }, false)?.tipo).toBe('pestana');
    }
  });
  it('ningún tema vacío', () => {
    for (const t of GUIA) expect(t.pasos.length).toBeGreaterThan(0);
  });
});
