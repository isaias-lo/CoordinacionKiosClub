import { describe, it, expect } from 'vitest';
import { avanceFila, chipFila, estadoLista, filtroVigente, pasaFiltro, resumenDia } from '../listaTiendas';

const cero = { pallet: 0, bulto: 0, contenedor: 0, chocolate: 0 };

describe('estadoLista', () => {
  it('terminada gana, aunque tenga cosas por pesar', () => {
    expect(estadoLista({ cargadas: 0, terminada: true })).toBe('lista');
  });
  it('con algo cargado está en curso; sin nada, sin empezar', () => {
    expect(estadoLista({ cargadas: 2, terminada: false })).toBe('curso');
    expect(estadoLista({ cargadas: 0, terminada: false })).toBe('pendiente');
  });
});

describe('avanceFila', () => {
  it('suma lo que Picking imprimió y falta cargar al total de cada tipo', () => {
    const a = avanceFila({ ...cero, pallet: 4, bulto: 1 }, { ...cero, pallet: 1, bulto: 2 });
    expect(a.porTipo).toEqual([
      { clase: 'pallet', pesadas: 4, total: 5 },
      { clase: 'bulto', pesadas: 1, total: 3 },
    ]);
    expect(a.pesadas).toBe(5);
    expect(a.total).toBe(8);
  });
  it('va en el orden de las tarjetas y omite los tipos sin unidades', () => {
    const a = avanceFila({ ...cero, chocolate: 1, contenedor: 1 }, { ...cero, pallet: 2 });
    expect(a.porTipo.map(t => t.clase)).toEqual(['pallet', 'contenedor', 'chocolate']);
  });
  it('una tienda vacía no tiene avance', () => {
    expect(avanceFila(cero, cero)).toEqual({ pesadas: 0, total: 0, porTipo: [] });
  });
});

describe('resumenDia y filtros', () => {
  const r = resumenDia(['lista', 'curso', 'curso', 'pendiente']);
  it('cuenta por estado', () => {
    expect(r).toEqual({ total: 4, lista: 1, curso: 2, pendiente: 1 });
  });
  it('«todas» deja pasar todo; un filtro, solo lo suyo', () => {
    expect(pasaFiltro('pendiente', 'todas')).toBe(true);
    expect(pasaFiltro('pendiente', 'curso')).toBe(false);
    expect(pasaFiltro('curso', 'curso')).toBe(true);
  });
  it('un filtro que se quedó sin tiendas vuelve a «todas»', () => {
    expect(filtroVigente('lista', { ...r, lista: 0 })).toBe('todas');
    expect(filtroVigente('curso', r)).toBe('curso');
  });
});

describe('chipFila', () => {
  it('lo sin pesar gana sobre todo', () => {
    expect(chipFila({ estado: 'lista', sinPesar: 2, conGuia: true })).toEqual({ texto: '2 sin pesar', tono: 'aviso' });
  });
  it('terminada sin guía avisa; con guía, lista', () => {
    expect(chipFila({ estado: 'lista', sinPesar: 0, conGuia: false }).texto).toBe('Falta guía');
    expect(chipFila({ estado: 'lista', sinPesar: 0, conGuia: true })).toEqual({ texto: 'Lista', tono: 'ok' });
  });
  it('en curso y sin empezar', () => {
    expect(chipFila({ estado: 'curso', sinPesar: 0, conGuia: false }).texto).toBe('En curso');
    expect(chipFila({ estado: 'pendiente', sinPesar: 0, conGuia: false }).tono).toBe('apagado');
  });
});
