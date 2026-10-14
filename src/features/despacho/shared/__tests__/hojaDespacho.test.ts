import { describe, it, expect } from 'vitest';
import {
  COLUMNAS_DESPACHO, indicesDeEncabezado, columnasQueFaltan, encabezadoCompleto,
  alinearFila, leerColumna, normalizarColumna,
} from '../hojaDespacho';

/** El encabezado real de las dos hojas hoy: A..AD, en orden canónico. */
const HOY = [...COLUMNAS_DESPACHO];
/** Una fila canónica de juguete: el valor dice de qué columna viene. */
const fila = (n: number = COLUMNAS_DESPACHO.length): string[] =>
  (COLUMNAS_DESPACHO as readonly string[]).slice(0, n).map(c => `v:${c}`);

describe('normalizarColumna', () => {
  it('ignora acentos, mayúsculas y espacios de más', () => {
    expect(normalizarColumna(' código ')).toBe('CODIGO');
    expect(normalizarColumna('Fecha  Armado')).toBe('FECHA ARMADO');
    expect(normalizarColumna(null)).toBe('');
  });
});

describe('indicesDeEncabezado', () => {
  it('ubica cada columna del sistema', () => {
    const idx = indicesDeEncabezado(HOY);
    expect(idx['ID']).toBe(0);
    expect(idx['ESTADO']).toBe(18);
    expect(idx['N_PALLET_BULTO']).toBe(19);
    expect(idx['CÓDIGO']).toBe(29);
  });

  it('resuelve los alias: CODIGO sin tilde es CÓDIGO', () => {
    const idx = indicesDeEncabezado(['CODIGO', 'N PALLET BULTO', 'FECHA_ARMADO']);
    expect(idx['CÓDIGO']).toBe(0);
    expect(idx['N_PALLET_BULTO']).toBe(1);
    expect(idx['FECHA ARMADO']).toBe(2);
  });

  it('ante un nombre repetido manda el primero', () => {
    expect(indicesDeEncabezado(['ID', 'FECHA', 'ID'])['ID']).toBe(0);
  });
});

describe('alinearFila: EL PUNTO DE TODO ESTO', () => {
  it('con el encabezado de hoy, la fila no se mueve', () => {
    expect(alinearFila(HOY, fila())).toEqual(fila());
  });

  it('SE PUEDEN MOVER LAS COLUMNAS: cada valor sigue a su nombre', () => {
    // El coordinador mueve N_PALLET_BULTO justo después de FECHA.
    const movido = ['ID', 'FECHA', 'N_PALLET_BULTO', 'COD', 'TIENDA'];
    const r = alinearFila(movido, fila());
    expect(r[2]).toBe('v:N_PALLET_BULTO');
    expect(r[3]).toBe('v:COD');
    expect(r[1]).toBe('v:FECHA');
  });

  it('una columna propia en el medio queda VACÍA, no se pisa', () => {
    const conNota = ['ID', 'NOTA DEL COORDINADOR', 'FECHA'];
    const r = alinearFila(conNota, fila());
    expect(r[0]).toBe('v:ID');
    expect(r[1]).toBe('');            // el sistema no la conoce: no la toca
    expect(r[2]).toBe('v:FECHA');
  });

  it('una columna del sistema que la hoja no tiene simplemente no se escribe', () => {
    const r = alinearFila(['ID', 'FECHA'], fila());
    expect(r).toEqual(['v:ID', 'v:FECHA']);
  });

  it('el orden invertido también funciona', () => {
    const alReves = [...HOY].reverse();
    const r = alinearFila(alReves, fila());
    expect(r[alReves.indexOf('ID')]).toBe('v:ID');
    expect(r[alReves.indexOf('PESO_KG')]).toBe('v:PESO_KG');
  });

  it('una fila corta no rompe: lo que falta queda vacío', () => {
    const r = alinearFila(HOY, fila(3));
    expect(r[0]).toBe('v:ID');
    expect(r[5]).toBe('');
    expect(r).toHaveLength(HOY.length);
  });
});

describe('columnas nuevas: se estrenan solas', () => {
  it('dice cuáles faltan, en orden canónico', () => {
    expect(columnasQueFaltan(HOY)).toEqual([]);
    expect(columnasQueFaltan(['ID', 'FECHA'])).toContain('PESO_KG');
    expect(columnasQueFaltan(['ID', 'FECHA'])[0]).toBe('COD');
  });

  it('el encabezado completo agrega las que falten AL FINAL, sin mover lo que hay', () => {
    const r = encabezadoCompleto(['ID', 'NOTA', 'FECHA']);
    expect(r.slice(0, 3)).toEqual(['ID', 'NOTA', 'FECHA']);
    expect(r).toContain('PESO_KG');
    expect(r.indexOf('NOTA')).toBe(1);
  });

  it('con la hoja al día no agrega nada', () => {
    expect(encabezadoCompleto(HOY)).toEqual(HOY);
  });
});

describe('leerColumna', () => {
  it('lee por nombre aunque la columna se haya movido', () => {
    const enc = ['ID', 'ESTADO', 'FECHA'];
    expect(leerColumna(enc, ['P1', 'Listo', '13/10/2026'], 'ESTADO')).toBe('Listo');
    expect(leerColumna(enc, ['P1', 'Listo', '13/10/2026'], 'FECHA')).toBe('13/10/2026');
  });

  it('sin encabezado cae a la posición canónica, que es mejor que devolver vacío', () => {
    const f = fila();
    expect(leerColumna([], f, 'ESTADO')).toBe('v:ESTADO');
    expect(leerColumna([], f, 'TRANSPORTE')).toBe('v:TRANSPORTE');
  });

  it('una columna que no existe en ningún lado devuelve vacío', () => {
    expect(leerColumna(['ID'], ['x'], 'NO EXISTE')).toBe('');
  });
});
