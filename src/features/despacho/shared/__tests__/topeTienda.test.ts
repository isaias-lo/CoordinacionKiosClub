import { describe, it, expect } from 'vitest';
import { pisoOcupado, estadoTope, textoTope, tituloTope } from '../topeTienda';

describe('pisoOcupado', () => {
  it('suma pallets y contenedores', () => {
    expect(pisoOcupado({ pallet: 3, contenedor: 2 })).toBe(5);
  });

  it('un contenedor ocupa piso igual que un pallet', () => {
    // Misma regla que poolDespacho / conteoFlota / backlogSegundaVuelta.
    expect(pisoOcupado({ pallet: 0, contenedor: 4 })).toBe(pisoOcupado({ pallet: 4, contenedor: 0 }));
  });

  it('sin unidades da cero', () => {
    expect(pisoOcupado({ pallet: 0, contenedor: 0 })).toBe(0);
    expect(pisoOcupado(null)).toBe(0);
    expect(pisoOcupado(undefined)).toBe(0);
    expect(pisoOcupado({})).toBe(0);
  });

  it('la basura no suma: NaN, negativos y texto valen cero', () => {
    expect(pisoOcupado({ pallet: NaN, contenedor: 2 })).toBe(2);
    expect(pisoOcupado({ pallet: -3, contenedor: 2 })).toBe(2);
    expect(pisoOcupado({ pallet: Infinity, contenedor: 1 })).toBe(1);
  });
});

describe('estadoTope', () => {
  it('sin tope cargado nunca da aviso, tenga lo que tenga', () => {
    // Nulo es «sin tope», no cero: si fuera cero, las 31 tiendas sin tope quedarían
    // excedidas desde el primer pallet.
    expect(estadoTope(0,  null)).toBe('sin-tope');
    expect(estadoTope(9,  null)).toBe('sin-tope');
    expect(estadoTope(9,  undefined)).toBe('sin-tope');
    expect(estadoTope(9,  NaN)).toBe('sin-tope');
  });

  it('por debajo del tope está dentro', () => {
    expect(estadoTope(2, 3)).toBe('dentro');
    expect(estadoTope(0, 3)).toBe('dentro');
  });

  it('exactamente en el tope no es excederse', () => {
    // Llena no es mal. Se distingue de «dentro» porque el próximo pallet la pasa.
    expect(estadoTope(3, 3)).toBe('al-tope');
    expect(estadoTope(5, 5)).toBe('al-tope');
  });

  it('uno arriba ya es excedido', () => {
    expect(estadoTope(4, 3)).toBe('excedido');
    expect(estadoTope(7, 3)).toBe('excedido');
  });

  it('un tope de cero deja excedida a la tienda con una sola unidad', () => {
    // La UI no permite cargar 0 (el schema exige 1..20), pero la función no miente si llega.
    expect(estadoTope(1, 0)).toBe('excedido');
    expect(estadoTope(0, 0)).toBe('al-tope');
  });
});

describe('el contenedor es lo que hace falta medir', () => {
  it('tres pallets y un contenedor se pasan de un tope de tres', () => {
    // EL caso que justifica todo el módulo: no hay un pallet de más y sin embargo se excedió.
    const piso = pisoOcupado({ pallet: 3, contenedor: 1 });
    expect(piso).toBe(4);
    expect(estadoTope(piso, 3)).toBe('excedido');
    expect(textoTope(piso, 3)).toBe('4 de máx 3');
  });

  it('bultos y chocolates no mueven nada', () => {
    // Van arriba del pallet o al costado: no ocupan una posición propia.
    const piso = pisoOcupado({ pallet: 2, contenedor: 0 });
    expect(estadoTope(piso, 3)).toBe('dentro');
    // Nueve bultos después, sigue siendo lo mismo: no entran a la cuenta.
    expect(estadoTope(pisoOcupado({ pallet: 2, contenedor: 0 }), 3)).toBe('dentro');
  });

  it('un contenedor solo también llena una tienda', () => {
    expect(estadoTope(pisoOcupado({ pallet: 0, contenedor: 3 }), 3)).toBe('al-tope');
  });
});

describe('textoTope', () => {
  it('dentro del tope no repite el conteo: solo el máximo', () => {
    // El «3» ya está en el conteo por tipo de la misma fila.
    expect(textoTope(3, 5)).toBe('máx 5');
    expect(textoTope(0, 4)).toBe('máx 4');
  });

  it('al tope y excedido sí muestran los dos números', () => {
    expect(textoTope(5, 5)).toBe('5 de máx 5');
    expect(textoTope(4, 3)).toBe('4 de máx 3');
  });

  it('sin tope no dice nada', () => {
    expect(textoTope(4, null)).toBe('');
    expect(textoTope(4, undefined)).toBe('');
  });

  it('nunca ordena nada: el texto es el hecho y nada más', () => {
    // Pedido explícito del coordinador. Si alguien agrega «hay que unificar», esto lo atrapa.
    for (const [piso, tope] of [[2, 3], [3, 3], [6, 3]] as const) {
      expect(textoTope(piso, tope)).toMatch(/^(máx \d+|\d+ de máx \d+)$/);
    }
  });
});

describe('tituloTope', () => {
  it('describe el estado en palabras para el title y el lector de pantalla', () => {
    expect(tituloTope(4, 3)).toBe('Se pasó del tope de recepción de la tienda');
    expect(tituloTope(3, 3)).toBe('Justo en el tope de recepción de la tienda');
    expect(tituloTope(1, 3)).toBe('Tope de recepción de la tienda');
    expect(tituloTope(1, null)).toBe('');
  });
});

describe('los casos reales del 11/11/2026', () => {
  // Medidos en picking_pallets; los topes son los de la lista del coordinador.
  const dia = [
    { cod: '16PQA', pallet: 5, contenedor: 0, tope: 5,    espera: 'al-tope'  },
    { cod: '20CTC', pallet: 4, contenedor: 0, tope: 3,    espera: 'excedido' },
    { cod: '22LGN', pallet: 4, contenedor: 0, tope: 5,    espera: 'dentro'   },
    { cod: '12LAS', pallet: 2, contenedor: 0, tope: 4,    espera: 'dentro'   },
    { cod: '35BN2', pallet: 1, contenedor: 0, tope: null, espera: 'sin-tope' },
  ] as const;

  it.each(dia)('$cod queda $espera', ({ pallet, contenedor, tope, espera }) => {
    expect(estadoTope(pisoOcupado({ pallet, contenedor }), tope)).toBe(espera);
  });

  it('solo una tienda del día habría avisado', () => {
    const excedidas = dia.filter(t => estadoTope(pisoOcupado(t), t.tope) === 'excedido');
    expect(excedidas.map(t => t.cod)).toEqual(['20CTC']);
  });
});
