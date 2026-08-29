import { describe, it, expect } from 'vitest';
import { mejorCamion, empacarEnFlota, enrutarV2, OPCIONES_DEFAULT, type GrupoCarga } from '../utils/enrutadorV2';
import { ZONAS_DEFAULT, type ConfigZonas } from '../utils/zonasTransporte';
import type { Vehiculo } from '../data/flota';

// [E8] El filtro por empresa en zonas de RUTEO es blando: prefiere las habilitadas, pero nunca
// deja carga sin asignar por falta de camión habilitado. Antes no se aplicaba en absoluto —
// medido contra la flota real, un camión de Falabella (que solo hace Regiones) recibía 6
// tiendas de Santiago sin que nada lo dijera.

const V = (p: string, empresa: string, c = 10): Vehiculo =>
  ({ p, c, b: 100, t: 'camion', tlbd: false, on: true, porton: null, refrigerado: false, empresa });

const G = (cods: string[], p: number, zona?: 'santiago' | 'costa'): GrupoCarga => ({ cods, p, ch: 0, zona });

describe('mejorCamion · preferencia blanda por empresa', () => {
  const stgo = ZONAS_DEFAULT.santiago;   // Luis Fica, Kios Club

  it('elige la empresa habilitada cuando la hay', () => {
    const v = mejorCamion(G(['A'], 2), [V('AAA111', 'Falabella'), V('BBB222', 'Kios Club')], {}, stgo);
    expect(v?.p).toBe('BBB222');
  });

  it('igual asigna cuando NINGUNA empresa está habilitada', () => {
    const v = mejorCamion(G(['A'], 2), [V('AAA111', 'Falabella'), V('CCC333', 'Ortiz')], {}, stgo);
    expect(v).not.toBeNull();
  });

  it('sin config se comporta como antes', () => {
    const libres = [V('AAA111', 'Falabella'), V('BBB222', 'Kios Club')];
    expect(mejorCamion(G(['A'], 2), libres, {})?.p).toBe(mejorCamion(G(['A'], 2), libres, {})?.p);
  });

  it('una zona sin empresas configuradas no expresa preferencia', () => {
    const vacia = { ...stgo, empresas: [] };
    const libres = [V('AAA111', 'Falabella'), V('BBB222', 'Kios Club')];
    expect(mejorCamion(G(['A'], 2), libres, {}, vacia)?.p).toBe(mejorCamion(G(['A'], 2), libres, {})?.p);
  });

  it('la capacidad manda sobre la empresa: no elige uno que no aguanta', () => {
    const v = mejorCamion(G(['A'], 8), [V('BBB222', 'Kios Club', 4), V('AAA111', 'Falabella', 10)], {}, stgo);
    expect(v?.p).toBe('AAA111');
  });

  it('la preferencia de zona pesa más que la fidelidad de la tienda', () => {
    // la tienda históricamente viaja con Falabella, pero Falabella no hace Santiago
    const v = mejorCamion(G(['A'], 2), [V('AAA111', 'Falabella'), V('BBB222', 'Luis Fica')],
                          { A: 'Falabella' }, stgo);
    expect(v?.p).toBe('BBB222');
  });
});

describe('empacarEnFlota · respeta la zona del grupo', () => {
  it('manda cada grupo a un camión de su zona', () => {
    const zonas: ConfigZonas = {
      ...ZONAS_DEFAULT,
      costa:    { ...ZONAS_DEFAULT.costa,    empresas: ['Kios Club'] },
      santiago: { ...ZONAS_DEFAULT.santiago, empresas: ['Luis Fica'] },
    };
    const { asignaciones, sobrante } = empacarEnFlota(
      [G(['C1'], 4, 'costa'), G(['S1'], 4, 'santiago')],
      [V('KKK111', 'Kios Club', 5), V('LLL222', 'Luis Fica', 5)],
      () => 4, c => c, {}, zonas,
    );
    expect(sobrante).toEqual([]);
    const de = (cod: string) => asignaciones.find(a => a.cods.includes(cod))?.v.empresa;
    expect(de('C1')).toBe('Kios Club');
    expect(de('S1')).toBe('Luis Fica');
  });

  it('no pierde carga cuando no hay camión habilitado', () => {
    const zonas: ConfigZonas = { ...ZONAS_DEFAULT,
      santiago: { ...ZONAS_DEFAULT.santiago, empresas: ['Empresa Inexistente'] } };
    const { asignaciones, sobrante } = empacarEnFlota(
      [G(['S1'], 4, 'santiago')], [V('AAA111', 'Falabella', 10)], () => 4, c => c, {}, zonas,
    );
    expect(sobrante).toEqual([]);
    expect(asignaciones[0].v.p).toBe('AAA111');
  });
});

describe('enrutarV2 · avisa cuando el camión no está habilitado', () => {
  const gps = { '55ITA': [-33.45, -70.60], '26ALC': [-33.44, -70.65], '20CTC': [-33.43, -70.62] };
  const cd: [number, number] = [-33.412581, -70.632438];
  const tiendas = Object.fromEntries(Object.keys(gps).map(c => [c, { n: c, z: '', v: '', sector: 'Santiago' }]));
  const pool = Object.keys(gps).map(c => ({ c, p: 2, b: 0, ch: 0 }));

  it('asigna igual, pero lo dice', () => {
    const r = enrutarV2(pool, [V('FFF111', 'Falabella', 10)], gps, cd, tiendas,
                        { ...OPCIONES_DEFAULT, zonas: ZONAS_DEFAULT });
    expect(r.rutas.length).toBe(1);
    expect(r.rutas[0].ts.length).toBe(3);                       // no se perdió nada
    const aviso = r.avisos.find(a => a.includes('FFF111') && a.includes('no está habilitado'));
    expect(aviso).toBeTruthy();
    expect(aviso).toContain('santiago');
    expect(aviso).toContain('Luis Fica');
  });

  it('no avisa cuando el camión sí está habilitado', () => {
    const r = enrutarV2(pool, [V('LLL222', 'Luis Fica', 10)], gps, cd, tiendas,
                        { ...OPCIONES_DEFAULT, zonas: ZONAS_DEFAULT });
    expect(r.avisos.some(a => a.includes('no está habilitado'))).toBe(false);
  });

  it('prefiere el habilitado teniendo los dos', () => {
    const r = enrutarV2(pool, [V('FFF111', 'Falabella', 10), V('LLL222', 'Luis Fica', 10)], gps, cd, tiendas,
                        { ...OPCIONES_DEFAULT, zonas: ZONAS_DEFAULT });
    expect(r.rutas.map(x => x.v.p)).toEqual(['LLL222']);
    expect(r.avisos.some(a => a.includes('no está habilitado'))).toBe(false);
  });
});
