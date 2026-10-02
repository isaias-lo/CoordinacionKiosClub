import { describe, it, expect } from 'vitest';
import { sumarPesosPorTienda, conflictosDePeso, pesoCreible, type FilaDePeso } from '../sumaPesosBodega';
import { claseDeTipoCode } from '../tipoCode';
import { TOPE_DURO_KG } from '../pesoIngresado';

// ── LOS DOS CASOS QUE ESTA FUNCIÓN EXISTE PARA IMPEDIR ─────────────────────────────────────────
//
// 30/09/2026 · COPIAS EXACTAS. Cada unidad de RM con dos filas pesadas —sello de armado y sello de
// despacho—, mismo peso, mismo slot. 71 filas, 19 tiendas, 12.622,8 kg de más.
//
// 01/10/2026 · LA MISMA UNIDAD CON DOS PESOS. Siete tiendas de Nacional trabajadas también en
// RM/Costa; cada espejo registró su propia foto del mismo pallet. +1.115,1 kg en 4 tiendas, y
// 28TEM publicó +88,0% contra Odoo cuando lo real era −0,5%.

const f = (cod: string, peso: number, slot?: number | null, tipo = 'Pallet'): FilaDePeso =>
  ({ cod, peso_kg: peso, tipo, picking_slot_id: slot ?? null });

const r1 = (m: Map<string, number>, cod: string) => Math.round((m.get(cod) ?? 0) * 10) / 10;

describe('sumarPesosPorTienda — cada unidad se cuenta UNA vez', () => {
  it('EL CASO 30/09: la misma unidad con el mismo peso, dos veces', () => {
    const m = sumarPesosPorTienda([f('05LP', 342.5, 485), f('05LP', 342.5, 485)]);
    expect(m.get('05LP')).toBe(342.5);   // NO 685
  });

  it('el día entero de 05LP: 9 unidades duplicadas dan 1.154,7, no 2.309,4', () => {
    const unidades: [number, number][] = [
      [342.5, 485], [118.5, 492], [131.5, 493], [480, 595],
      [27, 486], [15, 494], [11.1, 537], [14.7, 538], [14.4, 539],
    ];
    const filas = [...unidades, ...unidades].map(([kg, slot]) => f('05LP', kg, slot));
    expect(r1(sumarPesosPorTienda(filas), '05LP')).toBe(1154.7);
  });

  it('dos unidades DISTINTAS con el mismo peso sí suman las dos', () => {
    // Es lo normal: dos bultos de 27 kg son 54 kg. La llave es el slot justamente por esto.
    expect(sumarPesosPorTienda([f('05LP', 27, 486), f('05LP', 27, 494)]).get('05LP')).toBe(54);
  });

  it('sin slot NO se deduplica: perder carga real sería peor que contar de más', () => {
    expect(sumarPesosPorTienda([f('05LP', 100, null), f('05LP', 100, null)]).get('05LP')).toBe(200);
  });

  it('la deduplicación es por unidad, no por tienda', () => {
    const m = sumarPesosPorTienda([f('05LP', 50, 1), f('05LP', 50, 1), f('07CCR', 50, 2)]);
    expect(m.get('05LP')).toBe(50);
    expect(m.get('07CCR')).toBe(50);
  });

  it('los agregados siguen afuera, duplicados o no', () => {
    const m = sumarPesosPorTienda([f('05LP', 30, 9, 'Adquisicion'), f('05LP', 30, 9, 'Adquisicion')]);
    expect(m.has('05LP')).toBe(false);
  });

  it('una tienda sin filas queda FUERA del mapa, no en cero', () => {
    expect(sumarPesosPorTienda([]).has('05LP')).toBe(false);
  });

  it('el código se normaliza y las filas sin código se descartan', () => {
    const m = sumarPesosPorTienda([f(' 05lp ', 10, 1), f('', 99, 2)]);
    expect(m.get('05LP')).toBe(10);
    expect(m.size).toBe(1);
  });
});

// ── EL CAMBIO DE REGLA ─────────────────────────────────────────────────────────────────────────
//
// Acá había un test que afirmaba lo CONTRARIO: que dos filas del mismo slot con pesos distintos
// debían sumarse las dos (495 + 147 = 642). Estaba razonado así: «no hay forma de saber cuál vale
// sin mirar la balanza, y quedarse con una en silencio sería decidir por el coordinador».
//
// El razonamiento valía; la premisa no. La balanza SE PUEDE mirar —`picking_pallets`, por el mismo
// `picking_slot_id` que la fila ya trae— y el 01/10 el precio de no mirarla fueron 1.115,1 kg
// publicados. Y no queda en silencio: `conflictosDePeso` los lista y el servidor los loguea.
describe('sumarPesosPorTienda — una unidad, UN peso', () => {
  it('el mismo slot con pesos distintos ya NO se suma dos veces', () => {
    expect(sumarPesosPorTienda([f('39PSB', 495, 552), f('39PSB', 147, 552)]).get('39PSB')).toBe(495);
  });

  it('manda la balanza cuando la hay, aunque no sea el mayor', () => {
    const balanza = new Map([[552, 300]]);
    expect(sumarPesosPorTienda([f('39PSB', 495, 552), f('39PSB', 147, 552)], balanza).get('39PSB')).toBe(300);
  });

  it('sin balanza manda el MAYOR: el peso de un pallet solo crece al sumarle chocolates', () => {
    expect(sumarPesosPorTienda([f('33CON', 273, 694), f('33CON', 320.75, 694)]).get('33CON')).toBe(320.75);
  });

  it('una balanza en 0 NO borra el peso de la fila — el B3 de 57CAS del 01/10', () => {
    // El slot quedó sin peso en `picking_pallets` y el registro sí lo tenía en 17,5. Tomar la
    // balanza a ciegas habría perdido esos kilos.
    const balanza = new Map([[729, 0]]);
    expect(sumarPesosPorTienda([f('57CAS', 17.5, 729)], balanza).get('57CAS')).toBe(17.5);
  });

  it('un slot ausente de la balanza cae al mayor de sus filas, no a cero', () => {
    expect(sumarPesosPorTienda([f('05LP', 80, 1)], new Map()).get('05LP')).toBe(80);
  });

  it('la balanza repone lo que el registro dejó atrás — los 94,45 kg del 01/10', () => {
    // El registro escribe la foto del navegador. 33CON perdió 47,75 kg: exactamente la suma que
    // otra persona había hecho a las 13:54:56, que ese navegador no había visto todavía.
    const balanza = new Map([[694, 320.75]]);
    expect(sumarPesosPorTienda([f('33CON', 273, 694)], balanza).get('33CON')).toBe(320.75);
  });
});

// ── LAS CUATRO TIENDAS DEL 01/10, CON SUS NÚMEROS DE VERDAD ────────────────────────────────────
//
// `antes` es lo que la hoja publicó. `balanza` es lo que de verdad se pesó. Si alguien vuelve a
// sumar dos lecturas de una unidad, estos cuatro se caen con el número exacto que salió en la
// planilla, y se entiende al toque qué se rompió.
describe('sumarPesosPorTienda — regresión del 01/10/2026', () => {
  const casos: { cod: string; filas: FilaDePeso[]; antes: number; balanza: number }[] = [
    { cod: '47PTV', antes: 1111.4, balanza: 961.4, filas: [
      f('47PTV', 200.4, 700), f('47PTV', 127.5, 701), f('47PTV', 17.5, 702), f('47PTV', 400, 745), f('47PTV', 216, 746),
      f('47PTV', 150,   700), f('47PTV', 127.5, 701), f('47PTV', 17.5, 702), f('47PTV', 400, 745), f('47PTV', 216, 746),
    ] },
    { cod: '28TEM', antes: 723.3, balanza: 382.8, filas: [
      f('28TEM', 340.5, 732), f('28TEM', 17, 733), f('28TEM', 18, 734),
      f('28TEM', 347.8, 732), f('28TEM', 17, 733), f('28TEM', 18, 734),
    ] },
    { cod: '75PUC', antes: 576.0, balanza: 306.5, filas: [
      f('75PUC', 289.5, 751), f('75PUC', 17, 753),
      f('75PUC', 269.5, 751),
    ] },
    { cod: '57CAS', antes: 1196.9, balanza: 808.9, filas: [
      f('57CAS', 487.4, 708), f('57CAS', 272, 726), f('57CAS', 17.5, 729), f('57CAS', 16, 730), f('57CAS', 16, 731),
      f('57CAS', 388,   708), f('57CAS', 272, 726),
    ] },
  ];

  for (const c of casos) {
    it(`${c.cod}: ${c.antes} publicado → ${c.balanza} real`, () => {
      expect(r1(sumarPesosPorTienda(c.filas), c.cod)).toBe(c.balanza);
    });
  }

  // OJO con dos cifras que se parecen y NO son lo mismo:
  //
  //   1.148,0 kg  es lo que esta función deja de contar — la diferencia entre lo publicado y el
  //               peso verdadero de cada unidad.
  //   1.115,1 kg  fue la diferencia medida ese día contra la balanza TAL COMO ESTABA, que a su vez
  //               tenía el P1 de 47PTV inflado 50,4 kg por una doble suma de chocolates y le
  //               faltaban los 17,5 kg del B3 de 57CAS.
  //
  // Acá se afirma la primera, que es la que depende de este código.
  it('los cuatro juntos: 1.148 kg menos que lo que se publicó', () => {
    const antes   = casos.reduce((a, c) => a + c.antes, 0);
    const ahora   = casos.reduce((a, c) => a + r1(sumarPesosPorTienda(c.filas), c.cod), 0);
    expect(Math.round((antes - ahora) * 10) / 10).toBe(1148);
  });
});

describe('conflictosDePeso — los desacuerdos se DICEN, no se tapan', () => {
  it('lista la unidad con sus pesos, del mayor al menor', () => {
    const c = conflictosDePeso([f('47PTV', 150, 700), f('47PTV', 200.4, 700)]);
    expect(c).toEqual([{ slot: 700, cod: '47PTV', pesos: [200.4, 150] }]);
  });

  it('una unidad con un solo peso no es conflicto, aunque esté repetida', () => {
    expect(conflictosDePeso([f('05LP', 27, 486), f('05LP', 27, 486)])).toEqual([]);
  });

  it('las filas sin slot no pueden estar en conflicto: no hay cómo compararlas', () => {
    expect(conflictosDePeso([f('05LP', 10, null), f('05LP', 20, null)])).toEqual([]);
  });

  it('un 0 NO es un peso que discrepe: es la fila del armado, y es el caso normal', () => {
    // Cada unidad tiene dos filas, la del armado en 0 y la del registro con el peso. Contarlo
    // escupía un aviso por unidad en un día normal, y un aviso que sale siempre nadie lo lee.
    expect(conflictosDePeso([f('54MPQ', 0, 808), f('54MPQ', 394.5, 808)])).toEqual([]);
  });

  it('los agregados quedan afuera también acá', () => {
    expect(conflictosDePeso([f('05LP', 10, 9, 'Adquisicion'), f('05LP', 20, 9, 'Adquisicion')])).toEqual([]);
  });

  it('el día del 01/10 tenía 4 unidades en conflicto', () => {
    const filas = [
      f('47PTV', 200.4, 700), f('47PTV', 150, 700),
      f('28TEM', 340.5, 732), f('28TEM', 347.8, 732),
      f('75PUC', 289.5, 751), f('75PUC', 269.5, 751),
      f('57CAS', 487.4, 708), f('57CAS', 388, 708),
      f('57CAS', 272, 726),   f('57CAS', 272, 726),     // esta no: mismo peso
    ];
    expect(conflictosDePeso(filas).map(c => c.cod).sort()).toEqual(['28TEM', '47PTV', '57CAS', '75PUC']);
  });
});

// ── LO QUE LA AUDITORÍA DEL 02/10 ENCONTRÓ EN ESTE MISMO ARREGLO ───────────────────────────────
//
// La primera versión dejaba que una fila SIN peso tomara el de la balanza. Eso duplicaba el día
// —cada unidad tiene dos filas, la del armado en 0 y la del registro— y de paso rompía para qué
// existe el cuadro: una unidad pesada y nunca registrada habría cuadrado sola.
describe('sumarPesosPorTienda — una fila sin peso es un BORRADOR', () => {
  it('el 0 no toma el peso de la balanza: si no, el día se cuenta dos veces', () => {
    // 01TPS del 29/09: 4 unidades con fila de armado en 0 y fila de registro con peso. Con el 0
    // tomando la balanza, la tienda pasaba de 1.073 a 2.176,8 kg.
    const balanza = new Map([[346, 463], [360, 432]]);
    const filas = [
      f('01TPS', 0,   346), f('01TPS', 463, 346),
      f('01TPS', 0,   360), f('01TPS', 432, 360),
    ];
    expect(sumarPesosPorTienda(filas, balanza).get('01TPS')).toBe(895);   // NO 1790
  });

  it('una unidad SOLO con filas en 0 no suma — es el hueco que el cruce debe mostrar', () => {
    // Si una unidad pesada pero nunca registrada sumara igual, la tienda cuadraría sola y el
    // registro que falta se volvería invisible. Es para lo que sirve esta planilla.
    const balanza = new Map([[359, 462]]);
    expect(sumarPesosPorTienda([f('13PIE', 0, 359)], balanza).has('13PIE')).toBe(false);
  });

  it('una fila en 0 sin slot tampoco inventa kilos', () => {
    expect(sumarPesosPorTienda([f('05LP', 0, null)]).get('05LP')).toBe(0);
  });
});

describe('pesoCreible — una fuente autoritativa necesita un techo', () => {
  it('EL CASO: el slot 132, el 9.357 de 55ITA del 28/09', () => {
    // Odoo dice que esa tienda recibió 606,28 kg en TODO el día. La fila registrada se corrigió a
    // 335,7 por decisión del coordinador; el slot nunca. Sin techo, 55ITA volvía con 9.594,4 kg.
    expect(pesoCreible(9357.5, 'P', 132)).toBe(0);
  });

  it('un peso normal pasa tal cual', () => {
    expect(pesoCreible(347.8, 'P')).toBe(347.8);
    expect(pesoCreible(17.5, 'B')).toBe(17.5);
  });

  it('el techo es POR CLASE: 500 para bulto y chocolate, 1.000 para pallet', () => {
    expect(pesoCreible(900, 'B')).toBe(0);      // imposible para un bulto
    expect(pesoCreible(900, 'P')).toBe(900);    // alto pero posible para un pallet
  });

  it('justo en el techo pasa; un gramo más, no', () => {
    expect(pesoCreible(TOPE_DURO_KG.pallet, 'P')).toBe(1000);
    expect(pesoCreible(TOPE_DURO_KG.pallet + 0.1, 'P')).toBe(0);
  });

  it('null, 0 y negativo dan 0 sin avisar: no son un peso imposible, es que no hay peso', () => {
    expect(pesoCreible(null, 'P')).toBe(0);
    expect(pesoCreible(0, 'P')).toBe(0);
    expect(pesoCreible(-5, 'P')).toBe(0);
  });

  it('un peso descartado por el techo deja que mande la fila registrada', () => {
    // Es el efecto que importa: 55ITA usa el 335,7 que una persona revisó.
    const balanza = new Map([[132, pesoCreible(9357.5, 'P')]]);
    expect(sumarPesosPorTienda([f('55ITA', 335.7, 132)], balanza).get('55ITA')).toBe(335.7);
  });
});

describe('claseDeTipoCode — la vuelta del mapeo', () => {
  it('traduce las seis letras que guarda picking_pallets', () => {
    expect(claseDeTipoCode('P')).toBe('pallet');
    expect(claseDeTipoCode('B')).toBe('bulto');
    expect(claseDeTipoCode('C')).toBe('contenedor');
    expect(claseDeTipoCode('CH')).toBe('chocolate');
    expect(claseDeTipoCode('A')).toBe('adquisicion');
    expect(claseDeTipoCode('W')).toBe('webretiro');
  });

  it('normaliza espacios y minúsculas', () => {
    expect(claseDeTipoCode(' ch ')).toBe('chocolate');
  });

  it('un código desconocido cae al tope más ALTO, no al más restrictivo', () => {
    // Acá el default que muerde sería el restrictivo: descartaría un peso bueno por un techo que
    // no le corresponde. Al revés que en `tipoCodeSantiago`, donde el default a 'P' sí muerde.
    expect(claseDeTipoCode('ZZ')).toBe('pallet');
    expect(claseDeTipoCode(null)).toBe('pallet');
    expect(claseDeTipoCode(undefined)).toBe('pallet');
  });
});
