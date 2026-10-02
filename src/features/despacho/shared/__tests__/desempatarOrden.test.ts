import { describe, it, expect } from 'vitest';
import {
  numeroDeOrden, desempatarNumeros, desempatarOrdenSantiago, desempatarOrdenNacional,
} from '../numeroCard';

// ── EL CASO: LAS DOS ADQUISICIONES DE 26ALC, 02/10/2026 ────────────────────────────────────────
//
// Creadas a las 16:02 y 16:03, las dos con `orden: "A1"` en el estado de RM/Costa. Sus slots sí
// tenían el número bien (`seq` 1 y 2, canonical `126ALC…` y `226ALC…`): el que se repitió fue la
// etiqueta, porque el segundo guardado no alcanzó a ver al primero.
//
// El id de la fila se arma con el `orden`, así que las dos daban `A126ALC02102026A`. Y el daño es
// doble: `api/sheets-write` compara contra la hoja y no dentro del lote, así que a la hoja le
// agrega LAS DOS; el espejo a la base, con el id como clave, se queda con UNA.

describe('numeroDeOrden', () => {
  it('lee el número de los cuatro formatos que se escriben', () => {
    expect(numeroDeOrden('P3')).toBe(3);        // pallet RM/Costa
    expect(numeroDeOrden('3B')).toBe(3);        // bulto: el número va ADELANTE
    expect(numeroDeOrden('CH2')).toBe(2);       // chocolate
    expect(numeroDeOrden('pallet12')).toBe(12); // Nacional
  });

  it('lee las clases nuevas', () => {
    expect(numeroDeOrden('A1')).toBe(1);
    expect(numeroDeOrden('W2')).toBe(2);
  });

  it('sin número devuelve null, y no se cae', () => {
    expect(numeroDeOrden('')).toBeNull();
    expect(numeroDeOrden('P')).toBeNull();
    expect(numeroDeOrden(undefined)).toBeNull();
    expect(numeroDeOrden(null)).toBeNull();
  });

  it('el 0 no es un número válido de unidad', () => {
    expect(numeroDeOrden('P0')).toBeNull();
  });
});

describe('desempatarNumeros', () => {
  it('EL CASO: dos unidades con el mismo número', () => {
    expect(desempatarNumeros([1, 1])).toEqual([1, 2]);
  });

  it('LA PROPIEDAD QUE IMPORTA: lo que no choca NO se mueve', () => {
    // Es lo que hace que la etiqueta impresa de las unidades buenas no cambie nunca.
    expect(desempatarNumeros([1, 2, 3])).toEqual([1, 2, 3]);
    expect(desempatarNumeros([3, 1, 7])).toEqual([3, 1, 7]);
  });

  it('el primero se queda con su número; el repetido va al menor hueco libre', () => {
    expect(desempatarNumeros([3, 3, 1])).toEqual([3, 2, 1]);
  });

  it('tres veces el mismo número salen los tres distintos', () => {
    expect(desempatarNumeros([2, 2, 2])).toEqual([2, 1, 3]);
  });

  it('sin números, reparte desde el 1', () => {
    expect(desempatarNumeros([null, null, null])).toEqual([1, 2, 3]);
  });

  it('mezcla: respeta los que hay y rellena los huecos', () => {
    expect(desempatarNumeros([2, null, 2, null])).toEqual([2, 1, 3, 4]);
  });

  it('nunca devuelve un repetido, con cualquier entrada', () => {
    for (const entrada of [[1,1,1,1],[5,5,1,2],[null,1,1,null],[9,9],[1,2,2,3,3,3]]) {
      const salida = desempatarNumeros(entrada as number[]);
      expect(new Set(salida).size).toBe(salida.length);
    }
  });
});

describe('desempatarOrdenSantiago', () => {
  it('EL CASO de 26ALC: las dos adquisiciones salen A1 y A2', () => {
    const items = [
      { tipo: 'Chocolate',   orden: 'CH1' },
      { tipo: 'Adquisicion', orden: 'A1'  },
      { tipo: 'Adquisicion', orden: 'A1'  },
      { tipo: 'Pallet',      orden: 'P1'  },
    ];
    expect(desempatarOrdenSantiago(items).map(i => i.orden)).toEqual(['CH1', 'A1', 'A2', 'P1']);
  });

  it('cada clase reparte por separado: el P1 y el CH1 no se estorban', () => {
    const items = [{ tipo: 'Pallet', orden: 'P1' }, { tipo: 'Chocolate', orden: 'CH1' }];
    expect(desempatarOrdenSantiago(items).map(i => i.orden)).toEqual(['P1', 'CH1']);
  });

  it('una tienda sana no se toca — ni un número', () => {
    const items = [
      { tipo: 'Pallet', orden: 'P1' }, { tipo: 'Pallet', orden: 'P2' }, { tipo: 'Pallet', orden: 'P3' },
      { tipo: 'Bulto',  orden: '1B' }, { tipo: 'Bulto',  orden: '2B' },
      { tipo: 'Chocolate', orden: 'CH1' },
    ];
    expect(desempatarOrdenSantiago(items).map(i => i.orden))
      .toEqual(['P1', 'P2', 'P3', '1B', '2B', 'CH1']);
  });

  it('el bulto conserva el número ADELANTE, que es lo que espera el id', () => {
    const items = [{ tipo: 'Bulto', orden: '1B' }, { tipo: 'Bulto', orden: '1B' }];
    expect(desempatarOrdenSantiago(items).map(i => i.orden)).toEqual(['1B', '2B']);
  });

  it('un item sin `orden` recibe uno, sin pisar a nadie', () => {
    const items = [{ tipo: 'Pallet', orden: 'P2' }, { tipo: 'Pallet' as const }];
    expect(desempatarOrdenSantiago(items).map(i => i.orden)).toEqual(['P2', 'P1']);
  });

  it('conserva el resto del item intacto', () => {
    const [a] = desempatarOrdenSantiago([{ tipo: 'Pallet', orden: 'P1', peso: 250.8, extra: 'x' }]);
    expect(a).toMatchObject({ tipo: 'Pallet', orden: 'P1', peso: 250.8, extra: 'x' });
  });

  it('una lista vacía no se cae', () => {
    expect(desempatarOrdenSantiago([])).toEqual([]);
  });
});

describe('desempatarOrdenNacional', () => {
  it('desempata en el vocabulario de Nacional', () => {
    const items = [{ pkg: 'pallet', orden: 'pallet1' }, { pkg: 'pallet', orden: 'pallet1' }];
    expect(desempatarOrdenNacional(items).map(i => i.orden)).toEqual(['pallet1', 'pallet2']);
  });

  it('una tienda sana tampoco se toca', () => {
    const items = [
      { pkg: 'pallet', orden: 'pallet1' }, { pkg: 'box', orden: 'bulto1' },
      { pkg: 'chocolate', orden: 'chocolate1' },
    ];
    expect(desempatarOrdenNacional(items).map(i => i.orden))
      .toEqual(['pallet1', 'bulto1', 'chocolate1']);
  });

  it('los agregados de Nacional también', () => {
    const items = [{ pkg: 'adquisicion', orden: 'adquisicion1' }, { pkg: 'adquisicion', orden: 'adquisicion1' }];
    expect(desempatarOrdenNacional(items).map(i => i.orden)).toEqual(['adquisicion1', 'adquisicion2']);
  });
});
