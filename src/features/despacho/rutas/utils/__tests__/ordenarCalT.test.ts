import { describe, it, expect } from 'vitest';
import { ordenarCalT } from '../ordenarCalT';

type Cal = { on: boolean; p: number; b: number; c: number; ch: number; g?: string };
const d = (over: Partial<Cal> = {}): Cal => ({ on: true, p: 1, b: 0, c: 0, ch: 0, ...over });

// esFantasma real: fuera de catálogo y sin cantidades ⇒ fantasma.
const esFantasma = (data: Cal, enCat: boolean) =>
  enCat ? false : (data.p || 0) === 0 && (data.b || 0) === 0 && (data.ch || 0) === 0;
const enCatalogoAll = () => true;

describe('ordenarCalT', () => {
  it('respeta grupos Regiones(fal) → Costa → Santiago(rm) y el orden del calendario', () => {
    const calT = { '57CAS': d({ g: 'fal' }), '43CUR': d({ g: 'costa' }), '18FLO': d({ g: 'rm' }), '26ALC': d({ g: 'rm' }) };
    const calDia = { fal: ['57CAS'], costa: ['43CUR'], rm: ['18FLO', '26ALC'] };
    expect(Object.keys(ordenarCalT(calT, calDia, enCatalogoAll, esFantasma)))
      .toEqual(['57CAS', '43CUR', '18FLO', '26ALC']);
  });

  it('con el calendario de la BD, 57CAS (Regiones) va PRIMERO y 26ALC en su posición rm (no al final)', () => {
    // Reproduce el caso real: MA.fal=[57CAS,...], MA.rm=[...,26ALC,06MQH]
    const calT = { '06MQH': d({ g: 'rm' }), '26ALC': d({ g: 'rm', p: 2, ch: 6 }), '57CAS': d({ g: 'fal', p: 6 }) };
    const calDia = { fal: ['57CAS'], costa: [], rm: ['26ALC', '06MQH'] };
    expect(Object.keys(ordenarCalT(calT, calDia, enCatalogoAll, esFantasma)))
      .toEqual(['57CAS', '26ALC', '06MQH']);
  });

  it('tiendas que NO están en el calendario del día caen al final (extras), ordenadas por grupo', () => {
    // Bug histórico: cal SIN 26ALC/57CAS ⇒ entran por sesión pero quedan como extras al final.
    const calT = { '18FLO': d({ g: 'rm' }), '26ALC': d({ g: 'rm', p: 2 }), '57CAS': d({ g: 'fal', p: 6 }) };
    const calDia = { fal: [], costa: [], rm: ['18FLO'] };  // calendario viejo sin las dos
    // 18FLO (en calendario) primero; luego extras ordenados por grupo: 57CAS(fal) antes de 26ALC(rm)
    expect(Object.keys(ordenarCalT(calT, calDia, enCatalogoAll, esFantasma)))
      .toEqual(['18FLO', '57CAS', '26ALC']);
  });

  it('oculta fantasmas: fuera de catálogo y sin cantidades', () => {
    const calT = { 'ALC': d({ g: 'rm', p: 0, b: 0, ch: 0 }), '26ALC': d({ g: 'rm', p: 2 }) };
    const calDia = { fal: [], costa: [], rm: ['26ALC'] };
    const enCatalogo = (c: string) => c === '26ALC'; // 'ALC' no está en catálogo
    expect(Object.keys(ordenarCalT(calT, calDia, enCatalogo, esFantasma))).toEqual(['26ALC']);
  });

  it('no incluye tiendas del calendario que no estén en calT', () => {
    const calT = { '18FLO': d({ g: 'rm' }) };
    const calDia = { fal: [], costa: [], rm: ['18FLO', '99XXX'] };
    expect(Object.keys(ordenarCalT(calT, calDia, enCatalogoAll, esFantasma))).toEqual(['18FLO']);
  });
});
