import { describe, it, expect } from 'vitest';
import { resumenCierre, textoResumenCierre } from '../resumenCierre';

const t = (c: string) => ({ c });

describe('resumenCierre', () => {
  it('cuenta camiones con carga y las tiendas que llevan', () => {
    const r = resumenCierre('2026-09-03', ['A', 'B', 'C'], {
      'AB-1': [t('A'), t('B')],
      'CD-2': [t('C')],
    }, ['A', 'B', 'C']);
    expect(r.camiones).toBe(2);
    expect(r.tiendas).toBe(3);
    expect(r.hayAvisos).toBe(false);
  });

  // Las patentes con lista vacía existen en el tablero y no son camiones.
  it('una patente sin tiendas no cuenta como manifiesto', () => {
    const r = resumenCierre('2026-09-03', ['A'], { 'AB-1': [t('A')], 'CD-2': [] }, ['A']);
    expect(r.camiones).toBe(1);
  });

  it('avisa de las tiendas con carga que nadie va a llevar', () => {
    const r = resumenCierre('2026-09-03', ['A', 'B', '40LIL'], { 'AB-1': [t('A'), t('B')] }, ['A', 'B']);
    expect(r.sinCamion).toEqual(['40LIL']);
    expect(r.hayAvisos).toBe(true);
  });

  // Una tienda puede ir en el camión sin que Bodega la haya registrado: sale sin dimensiones.
  it('avisa de las que van en camión y Bodega nunca registró', () => {
    const r = resumenCierre('2026-09-03', ['26ALC', '02SCL'], {
      'VXSX43': [t('26ALC'), t('02SCL')],
    }, ['02SCL']);
    expect(r.sinDatosDeBodega).toEqual(['26ALC']);
    expect(r.hayAvisos).toBe(true);
  });

  it('sin datos de Bodega, todas las asignadas se reportan', () => {
    const r = resumenCierre('2026-09-03', ['A'], { 'AB-1': [t('A')] });
    expect(r.sinDatosDeBodega).toEqual(['A']);
  });

  it('los avisos salen ordenados y sin repetir', () => {
    const r = resumenCierre('2026-09-03', ['C', 'A', 'B'], {}, []);
    expect(r.sinCamion).toEqual(['A', 'B', 'C']);
  });

  it('día vacío: no cuenta nada ni avisa', () => {
    const r = resumenCierre('2026-09-03', [], {}, []);
    expect(r).toMatchObject({ camiones: 0, tiendas: 0, hayAvisos: false });
  });

  it('una tienda repetida en dos camiones se cuenta una vez', () => {
    const r = resumenCierre('2026-09-03', ['A'], { 'AB-1': [t('A')], 'CD-2': [t('A')] }, ['A']);
    expect(r.tiendas).toBe(1);
  });
});

describe('textoResumenCierre', () => {
  it('día limpio: solo los números', () => {
    const r = resumenCierre('2026-09-03', ['A', 'B'], { 'AB-1': [t('A'), t('B')] }, ['A', 'B']);
    expect(textoResumenCierre(r)).toBe('Día cerrado · 1 manifiesto · 2 tiendas');
  });

  it('con problemas: los nombra, para poder actuar antes de que salgan los camiones', () => {
    const r = resumenCierre('2026-09-03', ['A', '40LIL'], { 'AB-1': [t('A')] }, []);
    const txt = textoResumenCierre(r);
    expect(txt).toContain('sin camión: 40LIL');
    expect(txt).toContain('sin datos de Bodega: A');
  });

  it('singular y plural correctos', () => {
    const uno = resumenCierre('2026-09-03', ['A'], { 'AB-1': [t('A')] }, ['A']);
    expect(textoResumenCierre(uno)).toContain('1 manifiesto · 1 tienda');
  });
});
