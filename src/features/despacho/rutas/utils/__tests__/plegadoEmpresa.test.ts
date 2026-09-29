import { describe, it, expect } from 'vitest';
import {
  resumenEmpresa, empiezaPlegada, alternarEmpresa, textoResumen, type ResumenEmpresa,
} from '../plegadoEmpresa';

const tablero = {
  PTFZ21: [{ p: 3, b: 2, ch: 0 }, { p: 1, b: 0, ch: 4 }],
  RZBL80: [{ p: 2, b: 1, ch: 0 }],
  TDCV15: [],            // activo, sin carga
};

describe('resumenEmpresa', () => {
  it('suma tiendas, pallets y bultos de las patentes de esa empresa', () => {
    const r = resumenEmpresa(['PTFZ21', 'RZBL80'], tablero);
    expect(r).toEqual({ camiones: 2, cargados: 2, tiendas: 3, pallets: 6, bultos: 7 });
  });

  it('los chocolates suman como BULTO', () => {
    // Es la regla del sistema: lo que vale es lo que quedó registrado en Bodega. PTFZ21 lleva
    // 2 bultos + 4 chocolates = 6.
    expect(resumenEmpresa(['PTFZ21'], tablero).bultos).toBe(6);
  });

  it('distingue camiones de camiones CARGADOS', () => {
    // Un camión encendido sin tiendas no va a salir; decir "3 camiones" escondería eso.
    const r = resumenEmpresa(['PTFZ21', 'TDCV15'], tablero);
    expect(r.camiones).toBe(2);
    expect(r.cargados).toBe(1);
  });

  it('una patente que no está en el tablero cuenta como sin carga', () => {
    const r = resumenEmpresa(['VRYL52'], tablero);
    expect(r).toEqual({ camiones: 1, cargados: 0, tiendas: 0, pallets: 0, bultos: 0 });
  });

  it('tolera cantidades ausentes o basura sin romper la suma', () => {
    const raro = { XX: [{ p: undefined, b: 2 }, {}] } as Record<string, { p?: number; b?: number }[]>;
    expect(resumenEmpresa(['XX'], raro)).toMatchObject({ tiendas: 2, pallets: 0, bultos: 2 });
  });
});

describe('empiezaPlegada', () => {
  const conCarga: ResumenEmpresa  = { camiones: 2, cargados: 2, tiendas: 3, pallets: 6, bultos: 7 };
  const sinCarga: ResumenEmpresa  = { camiones: 2, cargados: 0, tiendas: 0, pallets: 0, bultos: 0 };

  it('sin carga arranca plegada; con carga, abierta', () => {
    expect(empiezaPlegada('Luis Fica', sinCarga, undefined)).toBe(true);
    expect(empiezaPlegada('Luis Fica', conCarga, undefined)).toBe(false);
  });

  it('lo que la persona eligió MANDA sobre la regla', () => {
    // El modo de falla que evita: plegar una empresa a mano y que la pantalla la vuelva a abrir
    // sola apenas le caiga una tienda. El gesto de la persona no se deshace.
    expect(empiezaPlegada('Luis Fica', conCarga, { 'Luis Fica': true })).toBe(true);
    expect(empiezaPlegada('Luis Fica', sinCarga, { 'Luis Fica': false })).toBe(false);
  });

  it('lo elegido para OTRA empresa no la afecta', () => {
    expect(empiezaPlegada('Kios Club', conCarga, { 'Luis Fica': true })).toBe(false);
  });
});

describe('alternarEmpresa', () => {
  it('guarda la decisión sin tocar las demás', () => {
    expect(alternarEmpresa({ A: true }, 'B', false)).toEqual({ A: true, B: false });
  });

  it('no muta lo que recibe', () => {
    const previo = { A: true };
    alternarEmpresa(previo, 'B', true);
    expect(previo).toEqual({ A: true });
  });

  it('parte de cero si no había nada guardado', () => {
    expect(alternarEmpresa(undefined, 'A', true)).toEqual({ A: true });
  });
});

describe('textoResumen', () => {
  it('una empresa vacía se lee por lo que NO dice', () => {
    expect(textoResumen({ camiones: 3, cargados: 0, tiendas: 0, pallets: 0, bultos: 0 }))
      .toBe('3 sin carga');
  });

  it('con carga: cuántos van, tiendas y cantidades', () => {
    expect(textoResumen({ camiones: 5, cargados: 3, tiendas: 12, pallets: 28, bultos: 40 }))
      .toBe('3 de 5 · 12 tiendas · 28P · 40B');
  });

  it('omite las cantidades en cero en vez de escribir 0P', () => {
    expect(textoResumen({ camiones: 1, cargados: 1, tiendas: 1, pallets: 0, bultos: 4 }))
      .toBe('1 de 1 · 1 tienda · 4B');
  });
});
