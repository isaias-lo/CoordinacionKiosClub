import { describe, it, expect } from 'vitest';
import { combinarEnLista } from '../combinarEnLista';

const L = ['a', 'b', 'c', 'd', 'e'];

describe('el fusionado queda en la posición del primero de los dos', () => {
  it('combinar el 2.º con el 4.º lo deja en el lugar del 2.º', () => {
    expect(combinarEnLista(L, 1, 3, 'B+D')).toEqual(['a', 'B+D', 'c', 'e']);
  });

  it('da lo mismo el orden en que se eligieron', () => {
    expect(combinarEnLista(L, 3, 1, 'B+D')).toEqual(combinarEnLista(L, 1, 3, 'B+D'));
  });

  it('dos contiguos', () => {
    expect(combinarEnLista(L, 1, 2, 'B+C')).toEqual(['a', 'B+C', 'd', 'e']);
  });

  it('el primero con el último queda al principio', () => {
    expect(combinarEnLista(L, 0, 4, 'A+E')).toEqual(['A+E', 'b', 'c', 'd']);
  });

  it('los dos últimos quedan al final', () => {
    expect(combinarEnLista(L, 3, 4, 'D+E')).toEqual(['a', 'b', 'c', 'D+E']);
  });
});

describe('el bug que corrige: empujar al final movía la carga de lugar', () => {
  it('NO termina al final cuando los combinados estaban al principio', () => {
    const r = combinarEnLista(L, 0, 1, 'A+B');
    expect(r[0]).toBe('A+B');
    expect(r.at(-1)).not.toBe('A+B');
  });
});

describe('la lista no pierde ni gana elementos', () => {
  it('dos entran, uno sale', () => {
    expect(combinarEnLista(L, 1, 3, 'X')).toHaveLength(L.length - 1);
  });

  it('no muta la lista original', () => {
    const orig = [...L];
    combinarEnLista(L, 1, 3, 'X');
    expect(L).toEqual(orig);
  });

  it('con solo dos elementos queda uno', () => {
    expect(combinarEnLista(['a', 'b'], 0, 1, 'A+B')).toEqual(['A+B']);
  });
});

describe('conserva la identidad del objeto fusionado', () => {
  it('devuelve el objeto tal cual se le pasó, sin copiarlo', () => {
    const fus = { pickingSlotId: 42, id: 'x' };
    const objs = [{ pickingSlotId: 1 }, { pickingSlotId: 2 }, { pickingSlotId: 3 }];
    expect(combinarEnLista(objs, 0, 1, fus)[0]).toBe(fus);
  });
});
