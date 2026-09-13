import { describe, it, expect } from 'vitest';
import { buildControlCongeladosRows, claveControlCong, nombreDia } from '../controlCongelados';

// El día real: armado viernes 11/09/2026, despacho lunes 14/09/2026.
const META = { fechaArmado: '2026-09-11', fechaDespacho: '2026-09-14' };
const REGION: Record<string, string> = { '22LGN': 'RM', '16PQA': 'RM', '08RNC': "O'Higgins" };
const regionDe = (c: string) => REGION[c] ?? '';

describe('buildControlCongeladosRows', () => {
  it('escribe las dos fechas: el armado y el despacho NO son el mismo día', () => {
    const [fila] = buildControlCongeladosRows([{ cod: '22LGN', cc: 12, cn: 1 }], META, regionDe);
    expect(fila[0]).toBe('11/09/2026'); // armado, viernes
    expect(fila[1]).toBe('14/09/2026'); // despacho, lunes
  });

  it('el día es el del DESPACHO, que es cuando la tienda recibe', () => {
    const [fila] = buildControlCongeladosRows([{ cod: '22LGN', cc: 1, cn: 0 }], META, regionDe);
    expect(fila[2]).toBe('Lunes');
  });

  it('separa CC y CN y suma el total', () => {
    const [fila] = buildControlCongeladosRows([{ cod: '22LGN', cc: 12, cn: 1 }], META, regionDe);
    expect(fila.slice(4, 7)).toEqual([12, 1, 13]);
  });

  it('el día completo del 11/09: 19 cajas en 3 tiendas', () => {
    const filas = buildControlCongeladosRows([
      { cod: '22LGN', cc: 12, cn: 1 },
      { cod: '16PQA', cc: 3,  cn: 1 },
      { cod: '02SCL', cc: 1,  cn: 1 },
    ], META, regionDe);
    expect(filas).toHaveLength(3);
    expect(filas.reduce((n, f) => n + (f[6] as number), 0)).toBe(19);
  });

  it('una tienda sin cajas no genera fila: la hoja registra despachos, no ceros', () => {
    const filas = buildControlCongeladosRows(
      [{ cod: '22LGN', cc: 0, cn: 0 }, { cod: '16PQA', cc: 4, cn: 0 }], META, regionDe,
    );
    expect(filas.map(f => f[3])).toEqual(['16PQA']);
  });

  it('sin patente la columna queda vacía, no "undefined"', () => {
    const [fila] = buildControlCongeladosRows([{ cod: '22LGN', cc: 1, cn: 0 }], META, regionDe);
    expect(fila[7]).toBe('');
  });

  it('lleva la patente cuando ya se asignó camión', () => {
    const [fila] = buildControlCongeladosRows([{ cod: '22LGN', cc: 1, cn: 0, patente: 'TYKK42' }], META, regionDe);
    expect(fila[7]).toBe('TYKK42');
  });

  it('normaliza el código y resuelve la región', () => {
    const [fila] = buildControlCongeladosRows([{ cod: ' 08rnc ', cc: 2, cn: 0 }], META, regionDe);
    expect(fila[3]).toBe('08RNC');
    expect(fila[8]).toBe('08RNC');
    expect(fila[9]).toBe("O'Higgins");
  });

  it('una tienda fuera del catálogo deja la región vacía en vez de reventar', () => {
    const [fila] = buildControlCongeladosRows([{ cod: '99XXX', cc: 1, cn: 0 }], META, regionDe);
    expect(fila[9]).toBe('');
  });

  it('siempre 10 columnas: el layout es posicional', () => {
    const filas = buildControlCongeladosRows([{ cod: '22LGN', cc: 1, cn: 1 }], META, regionDe);
    expect(filas[0]).toHaveLength(10);
  });

  it('sin tiendas no escribe nada', () => {
    expect(buildControlCongeladosRows([], META, regionDe)).toEqual([]);
  });
});

describe('nombreDia', () => {
  it('nombra el día en español', () => {
    expect(nombreDia('2026-09-14')).toBe('Lunes');
    expect(nombreDia('2026-09-11')).toBe('Viernes');
    expect(nombreDia('2026-09-13')).toBe('Domingo');
  });

  it('una fecha inválida no revienta', () => {
    expect(nombreDia('cualquier cosa')).toBe('');
  });
});

describe('claveControlCong', () => {
  it('una tienda aparece una vez por día de despacho', () => {
    expect(claveControlCong('14/09/2026', '22LGN')).toBe('14/09/2026::22LGN');
    expect(claveControlCong('14/09/2026', ' 22lgn ')).toBe('14/09/2026::22LGN');
  });
});
