import { describe, it, expect } from 'vitest';
import {
  juntadoTrasUnir, juntadoTrasSumar, juntadoMasCompleto, cuantoJuntado, textoSumados, textoPartes, lineaJuntado,
  juntadoDeTienda, textoJuntadoTienda,
  textoPieza, firmaPieza, verboPieza, horaCorta, pesoDePiezas,
} from '../juntados';
import { tipoQueManda } from '../contenidoCarga';
import type { Juntado } from '../juntados';
import { fusionarConPrevio } from '../itemPorUnidad';

describe('juntadoTrasUnir', () => {
  it('guarda de qué tipo era cada pallet, el que sobrevive primero', () => {
    expect(juntadoTrasUnir({ tipo: 'Comida' }, { tipo: 'aseo' })).toEqual({ partes: ['comida', 'aseo'] });
  });

  it('arrastra lo que ya traían los dos: partes en orden y conteos sumados', () => {
    const p1 = { juntado: { partes: ['comida', 'hogar'] as const, CH: 1 }, tipo: 'Mixto' };
    const p2 = { juntado: { CH: 2, B: 1 }, tipo: 'aseo' };
    expect(juntadoTrasUnir({ ...p1, juntado: { ...p1.juntado, partes: [...p1.juntado.partes] } }, p2))
      .toEqual({ partes: ['comida', 'hogar', 'aseo'], CH: 3, B: 1 });
  });

  it('lee las dos escrituras: RM «Mixto» y Nacional «comida-hogar» son lo mismo', () => {
    expect(juntadoTrasUnir({ tipo: 'Mixto' }, { tipo: 'comida-hogar' }).partes).toEqual(['comida-hogar', 'comida-hogar']);
  });
});

describe('juntadoTrasSumar', () => {
  it('cuenta los CH y los B sumados (LAS BRUJAS: P1 con un CH adentro)', () => {
    expect(juntadoTrasSumar(undefined, ['CH'])).toEqual({ CH: 1 });
    expect(juntadoTrasSumar({ CH: 1 }, ['CH', 'B', 'CH'])).toEqual({ CH: 3, B: 1 });
  });

  it('no pierde las partes de un pallet ya unificado', () => {
    expect(juntadoTrasSumar({ partes: ['comida', 'aseo'] }, ['CH'])).toEqual({ partes: ['comida', 'aseo'], CH: 1 });
  });

  it('ignora lo que no es B ni CH', () => {
    expect(juntadoTrasSumar(null, ['P', 'C', ''])).toEqual({});
  });
});

describe('juntadoMasCompleto', () => {
  it('re-guardar no deshace lo juntado', () => {
    expect(juntadoMasCompleto({ CH: 2 }, undefined)).toEqual({ CH: 2 });
    expect(juntadoMasCompleto({ CH: 2 }, { CH: 1 })).toEqual({ CH: 2 });
  });
  it('gana lo nuevo si trae más', () => {
    expect(juntadoMasCompleto({ CH: 1 }, { CH: 1, B: 1 })).toEqual({ CH: 1, B: 1 });
  });
  it('nada si ninguno lleva nada', () => {
    expect(juntadoMasCompleto(undefined, {})).toBeUndefined();
    expect(cuantoJuntado(null)).toBe(0);
  });
});

describe('textos', () => {
  it('chip de lo sumado: el chocolate primero', () => {
    expect(textoSumados({ B: 1, CH: 2 })).toBe('+2 CH · +1 B');
    expect(textoSumados({ partes: ['comida', 'aseo'] })).toBeNull();
    expect(textoSumados(undefined)).toBeNull();
  });

  it('tipos unidos: «Comida + Aseo», y los repetidos se cuentan', () => {
    expect(textoPartes({ partes: ['comida', 'aseo'] })).toBe('Comida + Aseo');
    expect(textoPartes({ partes: ['comida', 'aseo', 'comida'] })).toBe('Comida ×2 + Aseo');
    expect(textoPartes({ partes: ['comida-hogar', 'aseo'] })).toBe('Comida · Hogar + Aseo');
    expect(textoPartes({ partes: ['comida'] })).toBeNull();
  });

  it('línea de detalle', () => {
    expect(lineaJuntado({ partes: ['comida', 'aseo'], CH: 2 })).toBe('Se unió Comida + Aseo · se le sumaron 2 CH');
    expect(lineaJuntado({ CH: 1 })).toBe('Se le sumó 1 CH');
    expect(lineaJuntado({ CH: 1, B: 2 })).toBe('Se le sumaron 1 CH y 2 B');
    expect(lineaJuntado({})).toBeNull();
  });
});

describe('juntadoDeTienda', () => {
  it('suma unificados y lo que quedó dentro de los pallets', () => {
    const t = juntadoDeTienda([
      { unidos: 1, juntado: { partes: ['comida', 'aseo'], CH: 1 } },
      { juntado: { CH: 2, B: 1 } },
      { unidos: 2 },   // unificado antes del 22/10, sin partes
      {},
    ]);
    expect(t).toEqual({ unificadas: 2, CH: 3, B: 1 });
    expect(textoJuntadoTienda(t)).toBe('2 unificados · 3 CH dentro · 1 B dentro');
  });

  it('nada que contar', () => {
    expect(textoJuntadoTienda(juntadoDeTienda([{}, { juntado: {} }]))).toBeNull();
    expect(textoJuntadoTienda({ unificadas: 1, CH: 0, B: 0 })).toBe('1 unificado');
  });
});

describe('tipoQueManda', () => {
  const dePicking = { picker_label: 'Kamila', contenido: 'comida' };
  it('sin unir, manda la etiqueta de Picking', () => {
    expect(tipoQueManda(dePicking, 'Mixto', false)).toBe('comida');
  });
  it('unificado, manda la mezcla guardada: el Hogar no se pierde al re-guardar', () => {
    expect(tipoQueManda(dePicking, 'Mixto', true)).toBe('Mixto');
  });
  it('un slot de Bodega o sin slot: el propio', () => {
    expect(tipoQueManda({ picker_label: 'Bodega', contenido: 'comida' }, 'aseo', false)).toBe('aseo');
    expect(tipoQueManda(undefined, 'aseo', false)).toBe('aseo');
  });
});

describe('fusionarConPrevio conserva lo juntado', () => {
  type Item = { pickingSlotId: number; peso: number; id: string; orden: string; juntado?: Juntado };
  const base: Item = { pickingSlotId: 9, peso: 300, id: 'x', orden: 'P1' };
  it('volver a pesar el pallet no borra los CH sumados', () => {
    const out = fusionarConPrevio({ ...base, juntado: { CH: 2 } }, { ...base, peso: 310 });
    expect(out.juntado).toEqual({ CH: 2 });
    expect(out.peso).toBe(310);
  });
  it('si lo nuevo trae más, queda lo nuevo', () => {
    const out = fusionarConPrevio({ ...base, juntado: { CH: 1 } }, { ...base, juntado: { CH: 2 } });
    expect(out.juntado).toEqual({ CH: 2 });
  });
});

describe('desglose de lo juntado (5/11/2026)', () => {
  const P1 = { etiqueta: 'P1', clase: 'P' as const, tipo: 'Comida', peso: 210.44 };
  const P2 = { etiqueta: 'P2', clase: 'P' as const, tipo: 'Aseo', peso: 120 };
  const CH3 = { etiqueta: 'CH3', clase: 'CH' as const, peso: 8.2 };
  const quien = { por: 'Steven', en: '2026-11-05T17:07:00Z' };

  it('al unir deja la base sin firma y el unido firmado', () => {
    const j = juntadoTrasUnir({ tipo: 'Comida', datos: P1 }, { tipo: 'Aseo', datos: P2 }, quien);
    expect(j.piezas).toEqual([
      { etiqueta: 'P1', clase: 'P', tipo: 'comida', peso: 210.4 },
      { etiqueta: 'P2', clase: 'P', tipo: 'aseo', peso: 120, por: 'Steven', en: '2026-11-05T17:07:00Z' },
    ]);
    expect(j.partes).toEqual(['comida', 'aseo']);
  });

  it('sin los datos de las dos no inventa un desglose', () => {
    const j = juntadoTrasUnir({ tipo: 'Comida', datos: P1 }, { tipo: 'Aseo' }, quien);
    expect(j.piezas).toBeUndefined();
  });

  it('al sumar agrega cada CH con su peso, y el CH no lleva tipo', () => {
    const j = juntadoTrasSumar(null, ['CH'], { destino: P1, sumadas: [CH3], ...quien });
    expect(j.CH).toBe(1);
    expect(j.piezas?.map(p => p.etiqueta)).toEqual(['P1', 'CH3']);
    expect(j.piezas?.[1].tipo).toBeUndefined();
    expect(j.piezas?.[1].por).toBe('Steven');
  });

  it('unir dos que ya traían cosas arrastra todo, con su firma original', () => {
    const p2ConCh = juntadoTrasSumar(null, ['CH'], { destino: P2, sumadas: [CH3], por: 'Ana', en: '2026-11-05T16:00:00Z' });
    const j = juntadoTrasUnir({ tipo: 'Comida', datos: P1 }, { juntado: p2ConCh, tipo: 'Aseo', datos: { ...P2, peso: 128.2 } }, quien);
    expect(j.piezas?.map(p => [p.etiqueta, p.peso, p.por])).toEqual([
      ['P1', 210.4, undefined], ['P2', 120, 'Steven'], ['CH3', 8.2, 'Ana'],
    ]);
    expect(pesoDePiezas(j.piezas!)).toBe(338.6);
  });

  it('una base con uniones de antes del desglose queda marcada', () => {
    const viejo = { partes: ['comida', 'hogar'] as const, CH: 1 };
    const j = juntadoTrasSumar({ ...viejo, partes: [...viejo.partes] }, ['B'],
      { destino: { ...P1, peso: 300 }, sumadas: [{ etiqueta: 'B2', clase: 'B', peso: 12 }], ...quien });
    expect(j.piezas?.[0].conAnterior).toBe(true);
    expect(j.partes).toEqual(['comida', 'hogar']);
  });

  it('sumar sin datos conserva el desglose que ya había', () => {
    const antes = juntadoTrasSumar(null, ['CH'], { destino: P1, sumadas: [CH3], ...quien });
    expect(juntadoTrasSumar(antes, ['B']).piezas).toEqual(antes.piezas);
  });

  it('textos de la pieza', () => {
    const j = juntadoTrasUnir({ tipo: 'Comida', datos: P1 }, { tipo: 'Aseo', datos: P2 }, quien);
    const [base, unido] = j.piezas!;
    expect(textoPieza(unido)).toBe('P2 · Aseo · 120 kg');
    expect(textoPieza(base)).toBe('P1 · Comida · 210,4 kg');
    expect(firmaPieza(base, 'unió')).toBeNull();
    expect(firmaPieza(unido, verboPieza(unido))).toBe('unió Steven, 14:07');
    expect(verboPieza({ etiqueta: 'CH1', clase: 'CH', peso: 1 })).toBe('sumó');
    expect(horaCorta('no es fecha')).toBe('');
  });
});
