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

  it('un CERO también es "sin pesar", no una tienda que no recibió nada', () => {
    // Caso real del 29/09: 115 filas registradas con peso 0 —se registra temprano y se pesa
    // después—. Escribirlas como 0 daba «−100%» en toda la hoja, como si no hubiera llegado nada.
    const v = valoresDeFila({ ...base, kgBodega: 0 });
    expect(v['TOTAL BODEGA']).toBe('');
    expect(v['% DIF']).toBe('');
  });

  it('KG DIF dice cuánto pesa la diferencia, no solo su porcentaje', () => {
    // Pedido del coordinador sobre la fila de 24SPP: «Odoo 700, Total bodega 730, Peso diferencia
    // 30». Un −53,8% no dice si faltan 400 kg o 4: en una tienda chica un porcentaje enorme puede
    // ser nada, y en una grande un 5% pueden ser cien kilos.
    expect(valoresDeFila({ ...base, kgBodega: 420.16 })['KG DIF']).toBe(30);      // 420,16 − 390,16
    expect(valoresDeFila({ ...base, kgBodega: 360.16 })['KG DIF']).toBe(-30);
    expect(typeof valoresDeFila({ ...base, kgBodega: 420.16 })['KG DIF']).toBe('number');
  });

  it('SIN PESAR deja KG DIF vacío, no en negativo', () => {
    // Un «−390» acá se leería como que faltan 390 kilos, cuando lo que pasa es que nadie pesó.
    expect(valoresDeFila({ ...base, kgBodega: null })['KG DIF']).toBe('');
    expect(valoresDeFila({ ...base, kgBodega: 0 })['KG DIF']).toBe('');
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
