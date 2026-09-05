import { describe, it, expect } from 'vitest';
import { mergeRutasPlan, conAlMenosUna, type RutaPlan } from '../planSync';

const r = (id: string, selected: string[] = []): RutaPlan => ({ id, nombre: `Ruta ${id}`, selected });

describe('mergeRutasPlan', () => {
  // El punto: dos equipos armando rutas distintas no se borran entre sí.
  it('las rutas de ambos equipos conviven', () => {
    expect(mergeRutasPlan([r('r2')], [r('r1')], []).map(x => x.id)).toEqual(['r2', 'r1']);
  });

  it('una ruta que NO edité adopta lo que hizo el otro', () => {
    const base = [r('r1', ['A'])];
    const out = mergeRutasPlan([r('r1', ['A', 'B'])], [r('r1', ['A'])], base);
    expect(out[0].selected).toEqual(['A', 'B']);
  });

  it('una ruta que SÍ edité no se me pisa', () => {
    const base = [r('r1', ['A'])];
    const out = mergeRutasPlan([r('r1', ['X'])], [r('r1', ['A', 'B'])], base);
    expect(out[0].selected).toEqual(['A', 'B']);
  });

  it('si el otro la borró y yo no la toqué, se borra', () => {
    expect(mergeRutasPlan([], [r('r1', ['A'])], [r('r1', ['A'])])).toEqual([]);
  });

  it('si el otro la borró pero yo la edité, se queda', () => {
    const out = mergeRutasPlan([], [r('r1', ['A', 'B'])], [r('r1', ['A'])]);
    expect(out.map(x => x.id)).toEqual(['r1']);
  });

  it('una ruta nueva del otro equipo entra aunque yo no la conozca', () => {
    expect(mergeRutasPlan([r('r9')], [], []).map(x => x.id)).toEqual(['r9']);
  });

  it('nunca duplica una ruta que está en los dos lados', () => {
    const out = mergeRutasPlan([r('r1')], [r('r1')], [r('r1')]);
    expect(out.map(x => x.id)).toEqual(['r1']);
  });

  it('el orden remoto manda y lo nuevo local queda al final', () => {
    const out = mergeRutasPlan([r('a'), r('b')], [r('b'), r('c')], [r('b')]);
    expect(out.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('el orden de las claves no cuenta como edición', () => {
    const base: RutaPlan[] = [{ id: 'r1', nombre: 'N', selected: ['A'] }];
    const loc:  RutaPlan[] = [{ selected: ['A'], id: 'r1', nombre: 'N' }];   // mismas claves, otro orden
    const out = mergeRutasPlan([{ id: 'r1', nombre: 'N', selected: ['Z'] }], loc, base);
    expect(out[0].selected).toEqual(['Z']);   // se trató como "no la toqué"
  });

  it('tolera rutas sin id', () => {
    expect(mergeRutasPlan([{ id: '' }], [r('r1')], []).map(x => x.id)).toEqual(['r1']);
  });
});

describe('conAlMenosUna', () => {
  it('un plan vacío recibe la ruta por defecto: la pantalla necesita una para editar', () => {
    expect(conAlMenosUna([], r('r1')).map(x => x.id)).toEqual(['r1']);
  });
  it('si ya hay rutas, no agrega nada', () => {
    expect(conAlMenosUna([r('a')], r('r1')).map(x => x.id)).toEqual(['a']);
  });
});
