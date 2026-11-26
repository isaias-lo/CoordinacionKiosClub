import { describe, it, expect } from 'vitest';
import {
  extrasDesdeOdoo, extrasConCorrecciones, etiquetaAgregado, etiquetaSolicitud, seccionDeCorreccion,
  DESTINOS_NO_TIENDA, type ExtraPlanilla,
} from '../extrasPlanilla';
import type { MovimientoOdoo } from '../desdeOdoo';
import type { FilaGuardada } from '../conCorrecciones';

// Orígenes reales de Odoo, de noviembre de 2026.
let n = 0;
const mov = (origin: string, over: Partial<MovimientoOdoo> = {}): MovimientoOdoo => ({
  ref: `99REC/DT/${151000 + ++n}`, origin, estado: 'done', registros: 3, responsable: 'Pickers 15',
  asignadoEn: '2026-11-13 11:35:00', validadoEn: '2026-11-13 13:07:00', dia: '2026-11-13',
  toLocation: '', partner: '', backorderDe: null, enTanda: true, ...over,
});
const NOMBRES = { 'Pickers 15': 'Cristobal Labra', 'Pickers 9': 'Ignacio Poblete', 'Pickers 11': 'Diego Farr' };
const DEL_DIA = new Map([['27MCH', '2026-11-13'], ['22LGN', '2026-11-13'], ['29CFL', '2026-11-13'], ['23PEÑ', '2026-11-13']]);
const CATALOGO = new Set(['27MCH', '22LGN', '29CFL', '02SCL', '23PEÑ', '62PLD']);
const correr = (ms: MovimientoOdoo[]) => extrasDesdeOdoo(ms, NOMBRES, DEL_DIA, '2026-11-13', c => CATALOGO.has(c));
const de = (r: ReturnType<typeof correr>, cod: string) => r.porTienda.get(cod) ?? [];

describe('extrasDesdeOdoo: qué es cada movimiento', () => {
  it('un Agregado Cheaf va bajo su tienda, con la persona de la cuenta', () => {
    const [x] = de(correr([mov('Agregado Cheaf 27MCH 13/11/2026')]), '27MCH');
    expect(x).toMatchObject({ tipo: 'Agregado', etiqueta: 'Cheaf', seccion: null, especialidad: 'Seco',
                              picker: 'Cristobal Labra', cuenta: 'Pickers 15' });
  });
  it('si el origen no dice la tienda, la toma del destino de Odoo', () => {
    const r = correr([mov('Agregado cheaf 06/11/2026', { toLocation: '27MCH/Stock' })]);
    expect(de(r, '27MCH').map(x => x.etiqueta)).toEqual(['Cheaf']);
  });
  it('los Agregados de chocolates suman en Chocolates', () => {
    const r = correr([
      mov('Agregado Merry Candy Box 04/11/2026 (Chocolates)', { toLocation: '22LGN/Stock' }),
      mov('Agregado Chocolates 22LGN 09/11/2026'),
      mov('Agregado Calendario Adviento (Chocolates)', { toLocation: '22LGN/Stock' }),
    ]);
    expect(de(r, '22LGN').map(x => [x.etiqueta, x.especialidad])).toEqual([
      ['Merry Candy Box', 'Chocolates'], ['Chocolates', 'Chocolates'], ['Calendario de Adviento', 'Chocolates']]);
  });
  it('un Extra lleva su sección, y el de chocolates suma en Chocolates', () => {
    const r = correr([mov('Abastecimiento Extra Comida 27MCH 13/11/2026'),
                      mov('Abastecimiento Extra Chocolates 27MCH 13/11/2026', { responsable: 'Pickers 11' })]);
    expect(de(r, '27MCH').map(x => [x.etiqueta, x.seccion, x.especialidad])).toEqual([
      ['Extra · Comida', 'Comida', 'Seco'], ['Extra · Chocolates', 'Chocolates', 'Chocolates']]);
  });
  it('las solicitudes se nombran por lo que son', () => {
    const r = correr([
      mov('Solicitud de tienda 22LGN 09/11/2026'),
      mov('Solicitud de cliente LGN 16/11/2026', { toLocation: '22LGN/Stock' }),
      mov('Solicitud de bolsas 22LGN 05/11/2026'),
    ]);
    expect(de(r, '22LGN').map(x => [x.tipo, x.etiqueta])).toEqual([
      ['Solicitud', 'Solicitud de tienda'], ['Solicitud', 'Pedido de cliente'], ['Solicitud', 'Solicitud']]);
  });
  it('la Ñ del código no corta la tienda', () => {
    expect(de(correr([mov('Solicitud de tienda 23PEÑ 13/11/2026')]), '23PEÑ')).toHaveLength(1);
  });
});

describe('extrasDesdeOdoo: lo que no se muestra', () => {
  it('Seremi no se muestra aunque vaya a una tienda', () => {
    const r = correr([mov('Agregado Seremi a Tiendas 29CFL 17/11/2026 (Con Fecha corta)', { responsable: 'Pickers 7' })]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('Meli Full, Walmart Full y la Web no se muestran', () => {
    const r = correr([
      mov('Abastecimiento Meli Full 64XX/Stock Food 13/11/2026', { toLocation: '88ML/Stock' }),
      mov('Abastecimiento Walmart Full 13/11/2026', { toLocation: '88WLT/Stock' }),
      mov('Traspaso Seremi a Web 12/11/2026', { toLocation: '99WEB/Seremi - 1' }),
    ]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('manda el destino: un origen que nombra una tienda pero va a Meli no se muestra', () => {
    // «Abastecimiento Prioritarios» nombra una tienda y su destino real es 88ML (Meli Full).
    const r = correr([mov('Abastecimiento Prioritarios 27MCH 13/11/2026', { toLocation: '88ML/Stock' })]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('congelados no es de esta planilla', () => {
    const r = correr([
      mov('Abastecimiento Congelados 27MCH 13/11/2026', { responsable: 'Mario Patiño' }),
      mov('Agregado de bolsas con congelados 22LGN 03/11/2026'),
      mov('Sampling HOTPOCKET CONGELADOS 13/11/2026 27MCH'),
    ]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('una auditoría no es trabajo de picking', () => {
    const r = correr([mov('AUDITORIA Abastecimiento Comida 27MCH 13/11/2026')]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('lo normal de una tienda del día queda para la planilla de siempre', () => {
    const r = correr([mov('Abastecimiento Comida 27MCH 13/11/2026')]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('lo que no pasó por una tanda no se muestra', () => {
    // Medido del 02 al 19/11: sin tanda vienen ajustes, devoluciones y agregados de otras áreas.
    const r = correr([
      mov('AGREGADO INVENTARIO 27MCH 13/11/2026', { enTanda: false, responsable: 'Inventario' }),
      mov('', { enTanda: false, toLocation: '27MCH/Stock' }),
      mov('Agregado Calendario Adviento Chocolates 22LGN 13/11/2026', { enTanda: false, responsable: '' }),
      mov('Ajuste por cuadre', { enTanda: false, toLocation: '27MCH/Stock' }),
    ]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('sin el dato de la tanda no se muestra nada: mejor nada que algo dudoso', () => {
    const r = correr([mov('Agregado Cheaf 27MCH 13/11/2026', { enTanda: undefined })]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('sin catálogo de tiendas, igual se dejan fuera los destinos que no son tiendas', () => {
    expect([...DESTINOS_NO_TIENDA].sort()).toEqual(['88ML', '88WLT', '99REC', '99WEB']);
  });
});

describe('extrasDesdeOdoo: tiendas que hoy no despachan', () => {
  it('un Extra de una tienda que hoy no despacha va al bloque de abajo', () => {
    const r = correr([mov('Abastecimiento Extra Aseo 02SCL 13/11/2026')]);
    expect(r.porTienda.size).toBe(0);
    expect(r.fueraDelDia.map(x => [x.cod, x.tipo, x.etiqueta])).toEqual([['02SCL', 'Extra', 'Extra · Aseo']]);
  });
  it('lo normal de una tienda que hoy no despacha también va abajo', () => {
    const r = correr([mov('Abastecimiento Apertura Hogar 62PLD 13/11/2026')]);
    expect(r.fueraDelDia.map(x => [x.cod, x.tipo, x.seccion])).toEqual([['62PLD', 'Abastecimiento', 'Hogar']]);
  });
  it('lo de otro día traído por una apertura no es de esta hoja', () => {
    const r = correr([mov('Abastecimiento Extra Aseo 02SCL 12/11/2026', { dia: '2026-11-12' })]);
    expect(r.porTienda.size + r.fueraDelDia.length).toBe(0);
  });
  it('un movimiento que llegó en dos días se muestra una sola vez', () => {
    const m = mov('Agregado Cheaf 27MCH 13/11/2026');
    expect(de(correr([m, { ...m }]), '27MCH')).toHaveLength(1);
  });
});

describe('extrasDesdeOdoo: orden', () => {
  it('bajo una tienda: Extra, Agregados y después Solicitudes', () => {
    const r = correr([mov('Solicitud de tienda 27MCH 13/11/2026'), mov('Agregado Cheaf 27MCH 13/11/2026'),
                      mov('Abastecimiento Extra Hogar 27MCH 13/11/2026')]);
    expect(de(r, '27MCH').map(x => x.tipo)).toEqual(['Extra', 'Agregado', 'Solicitud']);
  });
});

describe('etiquetas', () => {
  it('un Agregado nuevo muestra lo que dice su origen, sin tienda ni fecha', () => {
    expect(etiquetaAgregado('Agregado Navidad 27MCH 20/12/2026')).toBe('Navidad');
    expect(etiquetaAgregado('Agregado exhibidores 03/11/2026')).toBe('Exhibidores');
    expect(etiquetaAgregado('Agregado para activación LP 12/11/2026')).toBe('Activación');
    expect(etiquetaAgregado('Agregado')).toBe('Agregado');
  });
  it('solicitudes', () => {
    expect(etiquetaSolicitud('Solicitud de tienda 76PAN HOGR 17/11/2026')).toBe('Solicitud de tienda');
    expect(etiquetaSolicitud('venta de catalogo 61RIO 03/11/2026')).toBe('Pedido de cliente');
    expect(etiquetaSolicitud('Cinta para Regalo Azul - Roja 22LGN 02/11/2026')).toBe('Solicitud');
  });
});

describe('extrasConCorrecciones y seccionDeCorreccion', () => {
  const guardada = (ref: string, picker: string | null, pickerOdoo: string | null = 'Cristobal Labra'): FilaGuardada =>
    ({ id: 1, ref, cod: '27MCH', seccion: 'Agregado', registrosOdoo: null, pickerOdoo, asignadoEn: null, registros: null, picker });
  it('una corrección cambia el nombre y deja lo que decía Odoo a la vista', () => {
    const r = correr([mov('Agregado Cheaf 27MCH 13/11/2026', { ref: 'R1' })]);
    const [x] = de(extrasConCorrecciones(r, [guardada('R1', 'Ignacio Poblete')]), '27MCH');
    expect(x).toMatchObject({ picker: 'Ignacio Poblete', origen: 'corregido', pickerOdoo: 'Cristobal Labra' });
  });
  it('sin corrección, o con el mismo nombre, no cambia nada', () => {
    const r = correr([mov('Agregado Cheaf 27MCH 13/11/2026', { ref: 'R2' }), mov('Solicitud de tienda 27MCH 13/11/2026', { ref: 'R3' })]);
    const c = extrasConCorrecciones(r, [guardada('R2', null), guardada('R3', 'Cristobal Labra')]);
    expect(de(c, '27MCH').every(x => x.origen === undefined)).toBe(true);
  });
  it('también corrige lo de tiendas que hoy no despachan', () => {
    const r = correr([mov('Abastecimiento Extra Aseo 02SCL 13/11/2026', { ref: 'R4' })]);
    expect(extrasConCorrecciones(r, [guardada('R4', 'Ignacio Poblete')]).fueraDelDia[0].picker).toBe('Ignacio Poblete');
  });
  it('la corrección se guarda con la sección del movimiento, o con su tipo si no tiene', () => {
    const x = (over: Partial<ExtraPlanilla>): ExtraPlanilla => ({
      ref: 'R', cod: '27MCH', tipo: 'Agregado', etiqueta: '', seccion: null, especialidad: 'Seco', origin: '',
      registros: 1, picker: '', cuenta: '', estado: 'done', asignadoEn: null, validadoEn: null, ...over });
    expect(seccionDeCorreccion(x({ tipo: 'Extra', seccion: 'Aseo' }))).toBe('Aseo');
    expect(seccionDeCorreccion(x({ tipo: 'Agregado' }))).toBe('Agregado');
    expect(seccionDeCorreccion(x({ tipo: 'Solicitud' }))).toBe('Solicitud');
    expect(seccionDeCorreccion(x({ tipo: 'Abastecimiento', seccion: 'Hogar' }))).toBe('Hogar');
  });
});
