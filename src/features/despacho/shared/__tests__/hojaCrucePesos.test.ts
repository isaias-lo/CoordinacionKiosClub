import { describe, it, expect } from 'vitest';
import {
  ENCABEZADO_CRUCE, valoresDeFila, aFilaPosicional, indicesDeEncabezado,
  normalizarColumna, llaveDeFila, letraDeColumna, formulaPctDif, primeraFilaDe,
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

// ── Lo que pasó el 30/09 en la planilla de verdad ──────────────────────────────────────────────
//
// Dos cambios que hizo una persona a mano y que el sistema tenía que aprender a respetar:
// renombraron TOTAL BODEGA a «TOTAL Fisico», y le pusieron a «% DIF» la fórmula `=(E2-D2)/D2`
// arrastrada hasta el final. Además movieron las cuatro columnas de totales al principio.

/** El encabezado REAL de la hoja al 30/09/2026, leído de la planilla. */
const HOJA_REAL = [
  'FECHA', 'CÓDIGO', 'TIENDA', 'TOTAL ODOO', 'TOTAL Fisico', '% DIF', 'KG DIF',
  'REF COMIDA', 'KG COMIDA', 'REF ASEO', 'KG ASEO', 'REF HOGAR', 'KG HOGAR',
  'REF CHOCOLATE', 'KG CHOCOLATE', 'ACTUALIZADO',
];

describe('ALIAS_COLUMNA — renombraron TOTAL BODEGA a «TOTAL Fisico»', () => {
  it('la encuentra igual, en la posición nueva', () => {
    const idx = indicesDeEncabezado(HOJA_REAL);
    expect(idx[normalizarColumna('TOTAL BODEGA')]).toBe(4);   // la E
  });

  it('SIN el alias la columna quedaba huérfana — esto es lo que se evitó', () => {
    // El escritor agrega al final las columnas del sistema que no encuentra. Sin alias habría
    // nacido una TOTAL BODEGA vacía en la Q, y «TOTAL Fisico» se quedaba congelada con los datos
    // de esa noche sin que nadie lo notara.
    const faltantes = ENCABEZADO_CRUCE.filter(
      c => indicesDeEncabezado(HOJA_REAL)[normalizarColumna(c)] === undefined);
    // Lo que se prueba acá es que TOTAL BODEGA NO queda huérfana, que es lo que el alias resuelve.
    expect(faltantes).not.toContain('TOTAL BODEGA');
    // `TOTAL PESADO` sí falta, y está bien: es una columna NUEVA que la hoja todavía no tiene y
    // que el escritor va a agregar al final. No es un renombre sin alias, es un estreno.
    expect(faltantes).toEqual(['TOTAL PESADO']);
  });

  it('con acento también, y sin importar mayúsculas', () => {
    for (const nombre of ['TOTAL Físico', 'total fisico', '  TOTAL   FISICO  ']) {
      const idx = indicesDeEncabezado(['FECHA', nombre]);
      expect(idx[normalizarColumna('TOTAL BODEGA')], nombre).toBe(1);
    }
  });

  it('si la hoja tuviera los dos nombres, manda el primero', () => {
    const idx = indicesDeEncabezado(['TOTAL BODEGA', 'TOTAL Fisico']);
    expect(idx[normalizarColumna('TOTAL BODEGA')]).toBe(0);
  });
});

describe('letraDeColumna', () => {
  it('las de siempre', () => {
    expect([0, 3, 4, 5, 25].map(letraDeColumna)).toEqual(['A', 'D', 'E', 'F', 'Z']);
  });

  it('pasando la Z', () => {
    expect([26, 27, 51, 52].map(letraDeColumna)).toEqual(['AA', 'AB', 'AZ', 'BA']);
  });

  it('un índice inválido no inventa una letra', () => {
    expect(letraDeColumna(-1)).toBe('');
    expect(letraDeColumna(1.5)).toBe('');
  });
});

describe('formulaPctDif — la misma que pusieron a mano', () => {
  it('reproduce exactamente `=(E2-D2)/D2`', () => {
    expect(formulaPctDif(HOJA_REAL, 2)).toBe('=(E2-D2)/D2');
    expect(formulaPctDif(HOJA_REAL, 59)).toBe('=(E59-D59)/D59');
  });

  it('USA LAS LETRAS DE HOY, no una E y una D fijas', () => {
    // Es el punto de que la hoja sea por nombre: el día que alguien mueva una columna, la fórmula
    // tiene que seguir apuntando a los totales y no a lo que haya quedado en la E.
    const movida = ['FECHA', 'CÓDIGO', 'TIENDA', 'NOTA', 'TOTAL ODOO', 'TOTAL BODEGA', '% DIF'];
    expect(formulaPctDif(movida, 7)).toBe('=(F7-E7)/E7');
  });

  it('sin separadores de argumentos: no depende del idioma de la planilla', () => {
    expect(formulaPctDif(HOJA_REAL, 2)).not.toMatch(/[,;]/);
  });

  it('si falta una de las dos columnas no inventa nada', () => {
    expect(formulaPctDif(['FECHA', 'TOTAL ODOO'], 2)).toBeNull();
    expect(formulaPctDif(['FECHA', 'TOTAL BODEGA'], 2)).toBeNull();
  });

  it('la fila 1 es el encabezado: nunca lleva fórmula', () => {
    expect(formulaPctDif(HOJA_REAL, 1)).toBeNull();
    expect(formulaPctDif(HOJA_REAL, 0)).toBeNull();
  });
});

describe('primeraFilaDe — dónde cayeron las filas nuevas', () => {
  it('lo saca del rango que devuelve el append', () => {
    expect(primeraFilaDe("'CRUCE PESOS'!A60:P62")).toBe(60);
    expect(primeraFilaDe('CRUCE PESOS!A7:P7')).toBe(7);
  });

  it('sin rango, null — y el que llama escribe el número, como antes', () => {
    expect(primeraFilaDe(undefined)).toBeNull();
    expect(primeraFilaDe(null)).toBeNull();
    expect(primeraFilaDe('')).toBeNull();
    expect(primeraFilaDe('A60:P62')).toBeNull();
  });

  it('la fila 1 no vale: es el encabezado', () => {
    expect(primeraFilaDe("'CRUCE PESOS'!A1:P1")).toBeNull();
  });
});

describe('aFilaPosicional con fórmula', () => {
  const valores = {
    'FECHA': '28/09/2026', 'CÓDIGO': '02SCL', 'TIENDA': 'San Carlos',
    'TOTAL ODOO': 561.1, 'TOTAL BODEGA': 470, '% DIF': -16.2, 'KG DIF': -91.1,
  };

  it('escribe la FÓRMULA en % DIF, en la columna que le toca', () => {
    const fila = aFilaPosicional(valores, HOJA_REAL, [], 2);
    expect(fila[5]).toBe('=(E2-D2)/D2');
  });

  it('los kilos siguen yendo como NÚMERO — solo el porcentaje es fórmula', () => {
    const fila = aFilaPosicional(valores, HOJA_REAL, [], 2);
    expect(fila[4]).toBe(470);     // TOTAL Fisico
    expect(fila[6]).toBe(-91.1);   // KG DIF
  });

  it('SIN PESAR queda VACÍO, no con la fórmula', () => {
    // La fórmula sobre una celda vacía da −100%, que se lee como «no vino nada» — la afirmación
    // que todo este módulo se cuida de no hacer.
    const sinPesar = { ...valores, 'TOTAL BODEGA': '', '% DIF': '', 'KG DIF': '' };
    const fila = aFilaPosicional(sinPesar, HOJA_REAL, [], 2);
    expect(fila[5]).toBe('');
  });

  it('sin número de fila escribe el número, como antes', () => {
    // Es el caso de una fila que se va a AGREGAR: todavía no se sabe dónde va a caer.
    expect(aFilaPosicional(valores, HOJA_REAL, [])[5]).toBe(-16.2);
  });

  it('una columna agregada a mano se conserva CON su fórmula', () => {
    const conNota = [...HOJA_REAL, 'REVISADO POR'];
    const previa = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '=A2&" ok"'];
    const fila = aFilaPosicional(valores, conNota, previa, 2);
    expect(fila[16]).toBe('=A2&" ok"');
  });
});

// ── TOTAL PESADO: LA SEGUNDA PREGUNTA ──────────────────────────────────────────────────────────
//
// `TOTAL BODEGA` (en la hoja «TOTAL Fisico») contesta ¿ya se mandó? · `TOTAL PESADO` contesta
// ¿cuánto marcó la balanza? Una sola columna no puede contestar las dos, y el 02/10/2026 eso costó
// dos correcciones de la planilla en un día, en direcciones opuestas.
describe('TOTAL PESADO', () => {
  it('está en el encabezado del sistema', () => {
    expect(ENCABEZADO_CRUCE).toContain('TOTAL PESADO');
  });

  it('EL CASO de 26ALC: pesado con número y registrado VACÍO', () => {
    // 194,7 kg en la balanza (CH1 31,2 + P1 163,5) y nadie apretó REGISTRAR. Antes la hoja decía
    // una celda vacía y se leía "esta tienda no se pesó", que era falso.
    const v = valoresDeFila({ ...base, kgBodega: null, kgPesado: 194.7 });
    expect(v['TOTAL PESADO']).toBe(194.7);
    expect(v['TOTAL BODEGA']).toBe('');
  });

  it('los dos vacíos: carga que nadie tocó — esa es la alarma de verdad', () => {
    const v = valoresDeFila({ ...base, kgBodega: null, kgPesado: null });
    expect(v['TOTAL PESADO']).toBe('');
    expect(v['TOTAL BODEGA']).toBe('');
  });

  it('los dos con número y distintos: se registró con una foto vieja del estado', () => {
    // 31TLC el 02/10: la balanza decía 665,65 y el registro mandó 639,5.
    const v = valoresDeFila({ ...base, kgBodega: 639.5, kgPesado: 665.65 });
    expect(v['TOTAL PESADO']).toBe(665.65);
    expect(v['TOTAL BODEGA']).toBe(639.5);
  });

  it('vacío y NO cero cuando no hay nada pesado: un 0 diría "se pesó y no pesó nada"', () => {
    expect(valoresDeFila({ ...base, kgBodega: null, kgPesado: 0 })['TOTAL PESADO']).toBe('');
    expect(valoresDeFila({ ...base, kgBodega: null, kgPesado: -5 })['TOTAL PESADO']).toBe('');
  });

  it('si no se le pasa, la celda queda vacía y no rompe nada', () => {
    const v = valoresDeFila({ ...base, kgBodega: 500 });
    expect(v['TOTAL PESADO']).toBe('');
    expect(v['TOTAL BODEGA']).toBe(500);
  });

  it('NO cambia qué compara % DIF: sigue siendo lo registrado contra Odoo', () => {
    // Cambiar el indicador que mira Jefatura es una decisión del coordinador, no un efecto
    // secundario de agregar una columna.
    const conPesado = valoresDeFila({ ...base, kgBodega: 500, kgPesado: 900 });
    const sinPesado = valoresDeFila({ ...base, kgBodega: 500 });
    expect(conPesado['KG DIF']).toBe(sinPesado['KG DIF']);
  });

  it('la hoja de hoy no la tiene: el escritor la agrega al final', () => {
    const idx = indicesDeEncabezado(HOJA_REAL);
    expect(idx[normalizarColumna('TOTAL PESADO')]).toBeUndefined();
    const conLaNueva = [...HOJA_REAL, 'TOTAL PESADO'];
    expect(indicesDeEncabezado(conLaNueva)[normalizarColumna('TOTAL PESADO')]).toBe(16);
  });

  it('en la hoja real, el valor cae en la columna nueva y no corre a ninguna', () => {
    const enc = [...HOJA_REAL, 'TOTAL PESADO'];
    const fila = aFilaPosicional(
      valoresDeFila({ ...base, kgBodega: 639.5, kgPesado: 665.65 }), enc);
    expect(fila[4]).toBe(639.5);     // TOTAL Fisico, la E, sigue donde estaba
    expect(fila[16]).toBe(665.65);   // TOTAL PESADO, la Q
    expect(fila[0]).toBe('28/09/2026');
    expect(fila[1]).toBe('24SPP');
  });
});

describe('ALIAS_COLUMNA — y el renombre que queda disponible', () => {
  it('si renombrás «TOTAL Fisico» a «TOTAL REGISTRADO», sigue funcionando', () => {
    // Es el nombre que de verdad describe lo que hay adentro. Queda a una celda de distancia, sin
    // tocar código.
    const hoja = HOJA_REAL.map(c => (c === 'TOTAL Fisico' ? 'TOTAL REGISTRADO' : c));
    expect(indicesDeEncabezado(hoja)[normalizarColumna('TOTAL BODEGA')]).toBe(4);
  });

  it('y la fórmula de % DIF se reapunta sola, porque sale del encabezado', () => {
    const hoja = [...HOJA_REAL.map(c => (c === 'TOTAL Fisico' ? 'TOTAL REGISTRADO' : c)), 'TOTAL PESADO'];
    expect(formulaPctDif(hoja, 2)).toBe('=(E2-D2)/D2');
  });

  it('con la columna nueva en medio, la fórmula apunta a las letras nuevas', () => {
    const hoja = ['FECHA', 'CÓDIGO', 'TIENDA', 'TOTAL ODOO', 'TOTAL PESADO', 'TOTAL Fisico', '% DIF'];
    expect(formulaPctDif(hoja, 5)).toBe('=(F5-D5)/D5');
  });
});
