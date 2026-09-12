import { describe, it, expect } from 'vitest';
import { normHeader, isDataRow, makeReader, makeRmMapper, makeRegionesMapper, missingHeaders, RM_HEADERS, REGIONES_HEADERS } from '../parseRows';

// Encabezados reales de las hojas (30 cols, idénticos en RM y REGIONES).
const HEADERS = [
  'ID', 'FECHA', 'COD', 'TIENDA', 'TIPO', 'REGIMEN', 'TRANSPORTE', 'PATENTE', 'CARGA', 'REGION',
  'COMUNA', 'TIPO_COMUNA', 'PESO_KG', 'ALTO', 'LARGO', 'ANCHO', 'PESO_V', 'VENTANA', 'ESTADO',
  'N_PALLET_BULTO', 'FECHA_LLEGADA', 'CONDUCTOR', 'RUTA', 'SUPERVISOR', 'GUIA', 'VALOR',
  'PIONETA 1', 'PIONETA 2', 'FECHA ARMADO', 'CÓDIGO',
];

// Una fila coherente con esos encabezados.
const ROW = [
  'R1', '13/05/2026', '49PTA', 'Puente Alto', 'Pallet', 'Seco', 'Luis Fica', 'ABCD12', 'Hogar', 'RM',
  'Puente Alto', 'Providencia', '120', '1', '2', '1', '3', '09:00-11:00', 'Listo', 'P1',
  '', 'Juan Pérez', 'R5', 'María', 'F900', '15000', 'Pio Uno', 'Pio Dos', '13/05/2026', '49PTA',
];

describe('normHeader', () => {
  it('trim + mayúsculas + sin acentos', () => {
    expect(normHeader('  código ')).toBe('CODIGO');
    expect(normHeader('Pioneta 1')).toBe('PIONETA 1');
  });
});

describe('isDataRow', () => {
  it('descarta el encabezado y filas vacías', () => {
    expect(isDataRow(HEADERS)).toBe(false);       // id === 'ID'
    expect(isDataRow(['', 'x'])).toBe(false);
    expect(isDataRow(ROW)).toBe(true);
  });
});

describe('makeReader (fallback posicional)', () => {
  it('lee por nombre cuando el encabezado existe', () => {
    const get = makeReader(HEADERS);
    expect(get(ROW, 'GUIA', 0)).toBe('F900');
    expect(get(ROW, 'VALOR', 0)).toBe('15000');
  });
  it('cae a la posición de respaldo si el encabezado no está', () => {
    const get = makeReader(HEADERS);
    expect(get(ROW, 'NO_EXISTE', 2)).toBe('49PTA'); // pos 2 = COD
  });
});

describe('makeRmMapper', () => {
  it('mapea RM correctamente (conductor/ruta/supervisor/pionetas)', () => {
    const rec = makeRmMapper(HEADERS)(ROW);
    expect(rec.cod).toBe('49PTA');
    expect(rec.conductor).toBe('Juan Pérez');
    expect(rec.ruta).toBe('R5');
    expect(rec.supervisor).toBe('María');
    expect(rec.pioneta_1).toBe('Pio Uno');
    expect(rec.pioneta_2).toBe('Pio Dos');
    expect(rec.peso_kg).toBe(120);
    expect(rec.seguimiento).toBe('Registrado');
  });

  // El CÓDIGO (col AD) es el id de la unidad en picking_pallets. Sin él, una fila que entra por la
  // sincronización pierde el vínculo con su unidad y ya no se puede sacar del despacho cuando esa
  // unidad se borra en Picking (51SER, 11/09/2026).
  it('trae el CÓDIGO como picking_slot_id', () => {
    const row = [...ROW];
    row[29] = '12733';
    expect(makeRmMapper(HEADERS)(row).picking_slot_id).toBe(12733);
  });

  // Ojo con parseFloat: '49PTA' daría 49, que es el id de OTRA unidad. Ese id se usa para sacar
  // filas del despacho, así que un valor inventado borraría carga ajena. Solo entero limpio.
  it('un CÓDIGO vacío o no numérico queda en null, nunca en un id inventado', () => {
    expect(makeRmMapper(HEADERS)(ROW).picking_slot_id).toBeNull();   // ROW trae '49PTA' ahí
    for (const basura of ['', '  ', '49PTA', 'P1', '12,5', '-3', 'null']) {
      const row = [...ROW]; row[29] = basura;
      expect(makeRmMapper(HEADERS)(row).picking_slot_id).toBeNull();
    }
  });

  it('es REORDER-SAFE: con columnas movidas sigue leyendo por nombre', () => {
    // Mover COD y GUIA a otras posiciones (simula reordenar la hoja).
    const hdr = ['FECHA', 'ID', 'COD', 'PATENTE', 'CONDUCTOR', 'TIENDA'];
    const row = ['13/05/2026', 'R9', '77XYZ', 'PPPP11', 'Pedro', 'La Reina'];
    const rec = makeRmMapper(hdr)(row);
    expect(rec.id).toBe('R9');
    expect(rec.cod).toBe('77XYZ');
    expect(rec.patente).toBe('PPPP11');
    expect(rec.conductor).toBe('Pedro');
    expect(rec.tienda).toBe('La Reina');
  });
});

describe('missingHeaders', () => {
  it('no falta ninguna con los encabezados reales', () => {
    expect(missingHeaders(HEADERS, RM_HEADERS)).toEqual([]);
    expect(missingHeaders(HEADERS, REGIONES_HEADERS)).toEqual([]);
  });
  it('detecta un encabezado renombrado (ej. PESO_KG → "PESO KG")', () => {
    const hdr = HEADERS.map(h => h === 'PESO_KG' ? 'PESO KG' : h);
    expect(missingHeaders(hdr, RM_HEADERS)).toEqual(['PESO_KG']);
  });
});

describe('makeRegionesMapper', () => {
  // Nacional también necesita el vínculo: 51SER es de esta hoja y fue la tienda del pallet fantasma.
  it('trae el CÓDIGO como picking_slot_id', () => {
    const row = [...ROW];
    row[29] = '12877';
    expect(makeRegionesMapper(HEADERS)(row).picking_slot_id).toBe(12877);
  });

  it('lee GUIA/VALOR de las columnas correctas (arregla el bug posicional 21/22)', () => {
    const rec = makeRegionesMapper(HEADERS)(ROW);
    // Antes leía guia=row[21] (CONDUCTOR='Juan Pérez') y valor=row[22] (RUTA). Por nombre:
    expect(rec.guia).toBe('F900');
    expect(rec.valor).toBe(15000);
    expect(rec.cod).toBe('49PTA');
    expect(rec.seguimiento).toBe('Registrado');
  });
});
