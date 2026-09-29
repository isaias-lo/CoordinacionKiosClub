import { describe, it, expect } from 'vitest';
import {
  ENCABEZADO_CRUCE, valoresDeFila, aFilaPosicional, indicesDeEncabezado,
  normalizarColumna, llaveDeFila,
} from '../hojaCrucePesos';
import type { FilaCruce } from '../cruceDePesos';

const cruce: FilaCruce = {
  codigo: '24SPP',
  refs: {
    comida: ['99REC/DT/131559'],
    aseo: ['99REC/DT/131497', '99REC/DT/131527'],
    hogar: [],
    chocolate: ['99REC/DT/131581'],
  },
  kg: { comida: 210.85, aseo: 94.45, hogar: 0, chocolate: 84.86 },
  totalOdoo: 390.16,
};

const base = { fecha: '28/09/2026', cruce, nombre: 'San Pedro de la Paz', actualizado: '2026-09-29T12:00:00Z' };
const ENC = [...ENCABEZADO_CRUCE];

describe('valoresDeFila', () => {
  it('la referencia va COMPLETA, para poder pegarla en Odoo', () => {
    const v = valoresDeFila({ ...base, kgBodega: 400 });
    expect(v['REF COMIDA']).toBe('99REC/DT/131559');
    expect(v['REF ASEO']).toBe('99REC/DT/131497, 99REC/DT/131527');
  });

  it('los kilos van como NÚMERO, no como texto', () => {
    // Si fueran texto, la columna dejaría de sumar en la planilla y nadie lo notaría hasta que
    // el total diera cero.
    const v = valoresDeFila({ ...base, kgBodega: 400 });
    expect(typeof v['KG COMIDA']).toBe('number');
    expect(typeof v['TOTAL ODOO']).toBe('number');
    expect(typeof v['TOTAL BODEGA']).toBe('number');
  });

  it('un tipo sin movimientos deja la referencia vacía y el peso en cero', () => {
    const v = valoresDeFila({ ...base, kgBodega: 400 });
    expect(v['REF HOGAR']).toBe('');
    expect(v['KG HOGAR']).toBe(0);
  });

  it('SIN PESAR deja vacío, NO cero', () => {
    // Un cero se lee como "no vino nada". "Todavía no lo pesamos" es otra cosa, y más leve.
    const v = valoresDeFila({ ...base, kgBodega: null });
    expect(v['TOTAL BODEGA']).toBe('');
    expect(v['% DIF']).toBe('');
  });

  it('el % sale redondeado a un decimal', () => {
    expect(valoresDeFila({ ...base, kgBodega: 390.16 })['% DIF']).toBe(0);
    expect(valoresDeFila({ ...base, kgBodega: 351.14 })['% DIF']).toBeCloseTo(-10, 1);
  });

  it('cubre TODAS las columnas del encabezado', () => {
    // El modo de falla que evita: agregar una columna y olvidarse de llenarla.
    const v = valoresDeFila({ ...base, kgBodega: 400 });
    const faltan = ENC.filter(c => !(c in v));
    expect(faltan).toEqual([]);
  });
});

describe('normalizarColumna e indicesDeEncabezado', () => {
  it('encuentra la columna aunque cambien acentos, mayúsculas o espacios', () => {
    // Para que «CODIGO», «Código» y « código » sigan siendo la misma columna.
    expect(normalizarColumna(' código ')).toBe('CODIGO');
    expect(normalizarColumna('KG  COMIDA')).toBe('KG COMIDA');
  });

  it('mapea cada nombre a su posición real', () => {
    const idx = indicesDeEncabezado(['CÓDIGO', 'FECHA', 'TIENDA']);
    expect(idx['CODIGO']).toBe(0);
    expect(idx['FECHA']).toBe(1);
  });

  it('con un nombre repetido manda el primero, en vez de romperse', () => {
    expect(indicesDeEncabezado(['FECHA', 'FECHA'])['FECHA']).toBe(0);
  });
});

describe('aFilaPosicional — LAS COLUMNAS SE PUEDEN MOVER', () => {
  it('escribe en el orden que tenga la hoja, no en el original', () => {
    // Esta es la razón de ser del módulo: el coordinador puede reordenar la hoja y el sistema
    // sigue escribiendo en la columna correcta.
    const alReves = [...ENC].reverse();
    const fila = aFilaPosicional(valoresDeFila({ ...base, kgBodega: 400 }), alReves);
    expect(fila[alReves.indexOf('CÓDIGO')]).toBe('24SPP');
    expect(fila[alReves.indexOf('KG COMIDA')]).toBe(210.85);
    expect(fila[alReves.indexOf('FECHA')]).toBe('28/09/2026');
  });

  it('NO PISA una columna agregada a mano', () => {
    // Si alguien agrega «OBSERVACIÓN» y escribe algo, cada registro posterior lo conservaría.
    // Borrárselo sin avisar sería la peor forma de perder un dato.
    const conExtra = ['OBSERVACIÓN', ...ENC];
    const previa: (string | number)[] = ['revisar con bodega'];
    const fila = aFilaPosicional(valoresDeFila({ ...base, kgBodega: 400 }), conExtra, previa);
    expect(fila[0]).toBe('revisar con bodega');
    expect(fila[conExtra.indexOf('CÓDIGO')]).toBe('24SPP');
  });

  it('una columna del sistema que no esté en la hoja se omite, sin correr las demás', () => {
    const sinChocolate = ENC.filter(c => c !== 'KG CHOCOLATE');
    const fila = aFilaPosicional(valoresDeFila({ ...base, kgBodega: 400 }), sinChocolate);
    expect(fila).toHaveLength(sinChocolate.length);
    expect(fila[sinChocolate.indexOf('TOTAL ODOO')]).toBe(390.16);
  });

  it('la fila resultante mide lo mismo que el encabezado', () => {
    const fila = aFilaPosicional(valoresDeFila({ ...base, kgBodega: 400 }), ENC);
    expect(fila).toHaveLength(ENC.length);
  });

  it('sin fila previa, las celdas que el sistema no conoce quedan vacías', () => {
    const conExtra = [...ENC, 'NOTA'];
    const fila = aFilaPosicional(valoresDeFila({ ...base, kgBodega: 400 }), conExtra);
    expect(fila[conExtra.indexOf('NOTA')]).toBe('');
  });
});

describe('llaveDeFila — lo que evita duplicar al registrar dos veces', () => {
  it('la misma tienda y el mismo día dan la misma llave', () => {
    // Registrar una tienda sola y después el día completo tiene que ACTUALIZAR esa fila, no
    // agregar otra. Toda esa garantía se apoya en esta llave.
    expect(llaveDeFila('28/09/2026', '24SPP')).toBe(llaveDeFila('28/09/2026', '24spp'));
    expect(llaveDeFila('28/09/2026', ' 24SPP ')).toBe(llaveDeFila('28/09/2026', '24SPP'));
  });

  it('distinto día o distinta tienda, distinta llave', () => {
    expect(llaveDeFila('28/09/2026', '24SPP')).not.toBe(llaveDeFila('29/09/2026', '24SPP'));
    expect(llaveDeFila('28/09/2026', '24SPP')).not.toBe(llaveDeFila('28/09/2026', '31TLC'));
  });
});
