import { describe, it, expect } from 'vitest';
import {
  esRespaldoEnrutador, reconciliarRespaldo, aplicarRuteoAFila, aplicarRuteoARecord,
  COL_RUTEO, type FilaRespaldo, type Ruteo,
} from '../reconciliarRespaldo';

describe('esRespaldoEnrutador', () => {
  it('reconoce R… y ENR… como respaldo; NO las de Bodega', () => {
    for (const id of ['R101TPS29082026P', 'R201TPS29082026B', 'ENR-29082026-01TPS'])
      expect(esRespaldoEnrutador(id)).toBe(true);
    for (const id of ['P101TPS29082026P', '1B01TPS29082026B', 'CH101TPS29082026CH', 'C101TPS29082026C'])
      expect(esRespaldoEnrutador(id)).toBe(false);
  });
});

const R = (o: Partial<FilaRespaldo> & { fila: number; id: string; fecha: string; cod: string }): FilaRespaldo => ({
  transporte: '', patente: '', estado: '', conductor: '', ruta: '', supervisor: '', ...o,
});

describe('reconciliarRespaldo', () => {
  it('hereda el ruteo del respaldo y marca sus filas para borrar (desc)', () => {
    const respaldo: FilaRespaldo[] = [
      R({ fila: 10, id: 'R101TPS29082026P', fecha: '29/08/2026', cod: '01TPS', transporte: 'Luis Fica', patente: 'ABCD12', ruta: '2', conductor: 'Juan', supervisor: 'Ana', estado: 'Listo para despachar' }),
      R({ fila: 11, id: 'R101TPS29082026B', fecha: '29/08/2026', cod: '01TPS', transporte: 'Luis Fica', patente: 'ABCD12', ruta: '2' }),
    ];
    const { ruteoPorClave, filasABorrar, idsABorrar } = reconciliarRespaldo(new Set(['29/08/2026::01TPS']), respaldo);
    expect(ruteoPorClave.get('29/08/2026::01TPS')).toMatchObject({ transporte: 'Luis Fica', patente: 'ABCD12', ruta: '2', conductor: 'Juan', supervisor: 'Ana' });
    expect(filasABorrar).toEqual([11, 10]);          // descendente
    expect(idsABorrar.sort()).toEqual(['R101TPS29082026B', 'R101TPS29082026P']);
  });

  it('ignora respaldo de tiendas que Bodega NO está escribiendo', () => {
    const respaldo: FilaRespaldo[] = [
      R({ fila: 5, id: 'R107CCR29082026P', fecha: '29/08/2026', cod: '07CCR', transporte: 'Kios Club', patente: 'XX99' }),
    ];
    const { ruteoPorClave, filasABorrar } = reconciliarRespaldo(new Set(['29/08/2026::01TPS']), respaldo);
    expect(ruteoPorClave.size).toBe(0);
    expect(filasABorrar).toEqual([]);
  });

  it('no toca filas de Bodega aunque coincida la clave', () => {
    const respaldo: FilaRespaldo[] = [
      R({ fila: 8, id: 'P101TPS29082026P', fecha: '29/08/2026', cod: '01TPS', transporte: 'X' }),
    ];
    const { filasABorrar, idsABorrar } = reconciliarRespaldo(new Set(['29/08/2026::01TPS']), respaldo);
    expect(filasABorrar).toEqual([]);
    expect(idsABorrar).toEqual([]);
  });
});

const ruteo: Ruteo = { transporte: 'Luis Fica', patente: 'ABCD12', estado: 'Listo', conductor: 'Juan', ruta: '2', supervisor: 'Ana' };

describe('aplicarRuteoAFila', () => {
  it('rellena las columnas de ruteo vacías por posición y extiende la fila si es corta', () => {
    const row = ['P101TPS29082026P', '29/08/2026', '01TPS', 'Trapense', 'Pallet', 'Seco']; // corta (6 cols)
    const out = aplicarRuteoAFila(row, ruteo);
    expect(out[COL_RUTEO.transporte]).toBe('Luis Fica');
    expect(out[COL_RUTEO.patente]).toBe('ABCD12');
    expect(out[COL_RUTEO.estado]).toBe('Listo');
    expect(out[COL_RUTEO.conductor]).toBe('Juan');
    expect(out[COL_RUTEO.ruta]).toBe('2');
    expect(out[COL_RUTEO.supervisor]).toBe('Ana');
    expect(out[2]).toBe('01TPS'); // no toca lo demás
  });

  it('el ruteo del respaldo (no vacío) PREVALECE sobre el transporte por defecto de Bodega', () => {
    const row: (string | number)[] = [];
    row[COL_RUTEO.transporte] = 'Falabella'; // default a ciegas de Bodega
    const out = aplicarRuteoAFila(row, ruteo);
    expect(out[COL_RUTEO.transporte]).toBe('Luis Fica'); // gana el camión real del Enrutador
    expect(out[COL_RUTEO.patente]).toBe('ABCD12');
  });

  it('un campo vacío del respaldo NO borra lo que ya había', () => {
    const row: (string | number)[] = [];
    row[COL_RUTEO.conductor] = 'Pedro';
    const out = aplicarRuteoAFila(row, { ...ruteo, conductor: '' });
    expect(out[COL_RUTEO.conductor]).toBe('Pedro');
  });
});

describe('aplicarRuteoARecord', () => {
  it('rellena solo los campos de ruteo vacíos', () => {
    const rec = { id: 'P1', cod: '01TPS', transporte: '', patente: '', peso_kg: 320 };
    const out = aplicarRuteoARecord(rec, ruteo);
    expect(out).toMatchObject({ transporte: 'Luis Fica', patente: 'ABCD12', peso_kg: 320, cod: '01TPS' });
  });
  it('el transporte del respaldo prevalece sobre el default de Bodega', () => {
    const rec = { transporte: 'Kios Club', patente: '' };
    const out = aplicarRuteoARecord(rec, ruteo);
    expect(out.transporte).toBe('Luis Fica'); // el camión real gana
    expect(out.patente).toBe('ABCD12');
  });
});
