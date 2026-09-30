import { describe, it, expect } from 'vitest';
import { aDDMM } from '../crucePesosDia';

describe('aDDMM — la conversión que une las tres fuentes', () => {
  it('pasa del formato de Odoo al de las tablas y la hoja', () => {
    // Odoo y el calendario hablan en `YYYY-MM-DD`; `despacho_rm.fecha` y la columna FECHA de la
    // planilla, en `DD/MM/YYYY`. El cruce tiene que cruzar las dos, y equivocarse acá no da error:
    // devuelve cero filas de Bodega y la hoja sale con las celdas de peso vacías — exactamente el
    // síntoma que este módulo vino a arreglar.
    expect(aDDMM('2026-09-29')).toBe('29/09/2026');
    expect(aDDMM('2026-01-05')).toBe('05/01/2026');
  });

  it('conserva los ceros a la izquierda', () => {
    // '5/1/2026' no calzaría con ninguna fila: la comparación es de texto, no de fecha.
    expect(aDDMM('2026-01-05')).not.toBe('5/1/2026');
    expect(aDDMM('2026-12-31')).toBe('31/12/2026');
  });
});
