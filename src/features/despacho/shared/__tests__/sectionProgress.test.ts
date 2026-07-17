import { describe, it, expect } from 'vitest';
import { sectionProgress } from '../sectionProgress';

type Tienda = { cod: string; done: boolean };
const isDone = (t: Tienda) => t.done;

describe('sectionProgress', () => {
  it('cuenta terminadas y total (15/26)', () => {
    const tiendas: Tienda[] = Array.from({ length: 26 }, (_, i) => ({ cod: `T${i}`, done: i < 15 }));
    expect(sectionProgress(tiendas, isDone)).toEqual({ done: 15, total: 26 });
  });

  it('ninguna terminada → 0/N', () => {
    const tiendas: Tienda[] = [{ cod: 'A', done: false }, { cod: 'B', done: false }];
    expect(sectionProgress(tiendas, isDone)).toEqual({ done: 0, total: 2 });
  });

  it('todas terminadas → N/N', () => {
    const tiendas: Tienda[] = [{ cod: 'A', done: true }, { cod: 'B', done: true }];
    expect(sectionProgress(tiendas, isDone)).toEqual({ done: 2, total: 2 });
  });

  it('lista vacía → 0/0', () => {
    expect(sectionProgress([] as Tienda[], isDone)).toEqual({ done: 0, total: 0 });
  });

  it('el predicado decide qué cuenta como terminada', () => {
    const items = [{ n: 3 }, { n: 0 }, { n: 5 }, { n: 0 }];
    expect(sectionProgress(items, x => x.n > 0)).toEqual({ done: 2, total: 4 });
  });
});
