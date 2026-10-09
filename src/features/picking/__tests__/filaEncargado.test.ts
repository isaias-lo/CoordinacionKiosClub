import { describe, it, expect } from 'vitest';
import {
  iniciales, colorAvatar, estadoOdoo, seccionesDeFila, unidadesDeFila, notaUnidades,
  totalesPorTipo, sinImprimir, estadoEtiquetas,
} from '../seco/filaEncargado';

describe('iniciales y avatar', () => {
  it('nombre y apellido', () => expect(iniciales('Juan Pérez')).toBe('JP'));
  it('tres palabras usa la primera y la última', () => expect(iniciales('Ana María Díaz')).toBe('AD'));
  it('una palabra', () => expect(iniciales('cmorales')).toBe('CM'));
  it('vacío', () => expect(iniciales('  ')).toBe('?'));
  it('el color no cambia entre llamadas', () => expect(colorAvatar('Juan')).toBe(colorAvatar('Juan')));
});

describe('estadoOdoo', () => {
  it('manual', () => expect(estadoOdoo([])).toEqual({ texto: 'Manual', tono: 'mute' }));
  it('todo realizado', () => {
    expect(estadoOdoo([{ state: 'done' }])).toEqual({ texto: 'Realizado', tono: 'ok' });
    expect(estadoOdoo([{ state: 'done' }, { state: 'done' }]).texto).toBe('Realizado 2/2');
  });
  it('a medias', () => expect(estadoOdoo([{ state: 'done' }, { state: 'assigned' }]).texto).toBe('1/2 realizadas'));
  it('ninguna: el estado de Odoo', () => expect(estadoOdoo([{ state: 'assigned' }])).toEqual({ texto: 'Preparado', tono: 'warn' }));
});

describe('unidades por fila (tiposUnidad.ts)', () => {
  it('Comida y Aseo no llevan chocolate', () => {
    const s = seccionesDeFila(['Comida', 'Aseo']);
    expect(unidadesDeFila(s, 'all', {})).toEqual(['P', 'B']);
    expect(notaUnidades(s, ['P', 'B'])).toBe('Comida y Aseo no llevan chocolate, por eso no aparece.');
  });
  it('Chocolates no lleva bultos', () => {
    const s = seccionesDeFila(['Chocolates']);
    expect(unidadesDeFila(s, 'all', {})).toEqual(['P', 'CH:negra', 'CH:carton']);
    expect(notaUnidades(s, ['P', 'CH:negra', 'CH:carton'])).toBe('Chocolates no lleva bultos, por eso no aparecen.');
  });
  it('una unidad que ya existe se ve igual', () => {
    expect(unidadesDeFila(seccionesDeFila(['Hogar']), 'all', { 'CH:negra': 1 })).toContain('CH:negra');
  });
  it('el filtro de sección activo manda', () => {
    expect(unidadesDeFila(seccionesDeFila(['Comida', 'Chocolates']), 'comida', {})).toEqual(['P', 'B']);
  });
  it('sin secciones reconocibles ofrece todo menos contenedor', () => {
    expect(unidadesDeFila(seccionesDeFila([]), 'all', {})).toEqual(['P', 'B', 'CH:negra', 'CH:carton']);
  });
});

describe('totales y etiquetas', () => {
  it('suma las dos cajas de chocolate', () => {
    expect(totalesPorTipo({ P: 2, 'CH:negra': 1, 'CH:carton': 2 })).toEqual({ P: 2, B: 0, CH: 3, total: 5 });
  });
  it('cuenta lo que no tiene código', () => {
    expect(sinImprimir([{ canonical_id: 'x' }, { canonical_id: null }, {}])).toBe(2);
  });
  it('columna ETIQUETAS', () => {
    const base = { unidades: 3, pendientes: 3, bloqueadaPorOdoo: false, enOtraSeccion: false };
    expect(estadoEtiquetas(base)).toEqual({ texto: '3 por imprimir', tono: 'info' });
    expect(estadoEtiquetas({ ...base, pendientes: 0 }).texto).toBe('Impresas');
    expect(estadoEtiquetas({ ...base, bloqueadaPorOdoo: true }).texto).toBe('Espera a Odoo');
    expect(estadoEtiquetas({ ...base, unidades: 0 }).texto).toBe('Falta contar');
    expect(estadoEtiquetas({ ...base, unidades: 0, enOtraSeccion: true }).texto).toBe('En otra sección');
  });
});
