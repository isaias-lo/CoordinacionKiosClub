import { describe, it, expect } from 'vitest';
import {
  combinarFilas, recordarFila, filaCombinada, combinadasPorTienda, cargaDeFila,
  type MemoriaSesion,
} from '../conteosPorFuente';
import type { SesionRow } from '@/lib/despachoSesion';

const fila = (fuente: string, p: number, b: number, c = 0, ch = 0): SesionRow => ({
  fecha: '2026-09-29', fuente, tienda_cod: '36CHL',
  pallets: p, bultos: b, contenedores: c, chocolates: ch,
});

describe('combinarFilas — el caso real del 29/09', () => {
  it('36CHL: 4P·8B y 2P·0B dan 4P·8B, no 2P·0B', () => {
    // Lo que se veía en pantalla era 2P·0B porque ganaba la última fila que llegaba. Los slots
    // reales de `picking_pallets` ese día eran 4P·8B.
    const r = combinarFilas([fila('regiones', 4, 8), fila('santiago', 2, 0)])!;
    expect(r.pallets).toBe(4);
    expect(r.bultos).toBe(8);
  });

  it('NO suma: las unidades de los dos espejos se solapan', () => {
    // Es la razón de que esto sea un módulo con tests y no dos líneas. RM/Costa tenía los slots
    // 216 y 247 de 36CHL; Nacional tenía 4 pallets que INCLUÍAN esos dos. Sumar habría dado 6
    // pallets en una tienda que tiene 4.
    const r = combinarFilas([fila('regiones', 4, 8), fila('santiago', 2, 0)])!;
    expect(r.pallets).not.toBe(6);
    expect(r.pallets).toBe(4);
  });

  it('las ocho tiendas que estaban mal, contra sus slots reales', () => {
    const casos: [string, [number, number], [number, number], [number, number]][] = [
      // tienda, regiones, santiago, slots reales
      ['36CHL', [4, 8], [2, 0], [4, 8]],
      ['46TRE', [4, 5], [1, 0], [4, 5]],
      ['31TLC', [2, 2], [1, 0], [2, 2]],
      ['27MCH', [3, 1], [2, 0], [3, 1]],
      ['75PUC', [2, 1], [1, 0], [2, 1]],
      ['24SPP', [2, 0], [2, 0], [2, 0]],
      ['38SP2', [2, 0], [1, 0], [2, 0]],
      ['60PBL', [2, 0], [1, 0], [2, 0]],
    ];
    for (const [cod, reg, san, real] of casos) {
      const r = combinarFilas([fila('regiones', ...reg), fila('santiago', ...san)])!;
      expect([r.pallets, r.bultos], cod).toEqual(real);
    }
  });

  it('el orden de llegada no cambia el resultado', () => {
    // `fetchCounts` no garantiza orden, y el bug era exactamente depender de él.
    const a = combinarFilas([fila('regiones', 4, 8), fila('santiago', 2, 0)])!;
    const b = combinarFilas([fila('santiago', 2, 0), fila('regiones', 4, 8)])!;
    expect([a.pallets, a.bultos]).toEqual([b.pallets, b.bultos]);
    expect(a.fuente).toBe(b.fuente);
  });

  it('con una sola fila devuelve esa misma', () => {
    const r = combinarFilas([fila('santiago', 3, 1)])!;
    expect([r.pallets, r.bultos, r.fuente]).toEqual([3, 1, 'santiago']);
  });

  it('sin filas devuelve null, que es distinto de cero', () => {
    // Cero diría "esta tienda no trae carga"; null dice "de esta tienda no sé nada". El Enrutador
    // trata esas dos cosas distinto: el cero por ignorancia es el bug que arregló el #576.
    expect(combinarFilas([])).toBeNull();
  });

  it('combina las cuatro clases, no solo pallets y bultos', () => {
    const r = combinarFilas([fila('regiones', 1, 0, 3, 0), fila('santiago', 0, 2, 0, 5)])!;
    expect([r.pallets, r.bultos, r.contenedores, r.chocolates]).toEqual([1, 2, 3, 5]);
  });

  it('un negativo o un nulo cuentan como cero, no como menos', () => {
    const rara = { ...fila('santiago', 0, 0), pallets: -3 as number, bultos: null as unknown as number };
    const r = combinarFilas([fila('regiones', 2, 1), rara])!;
    expect([r.pallets, r.bultos]).toEqual([2, 1]);
  });
});

describe('la fuente que manda decide el GRUPO donde se dibuja la tienda', () => {
  it('gana la fuente del espejo que trajo más carga', () => {
    // De `fuente` sale el grupo (`grupoArmada`). Si mandara la fila menor, una tienda de Región
    // podría aparecer entre las de Santiago.
    expect(combinarFilas([fila('santiago', 2, 0), fila('regiones', 4, 8)])!.fuente).toBe('regiones');
    expect(combinarFilas([fila('regiones', 1, 0), fila('santiago', 5, 2)])!.fuente).toBe('santiago');
  });

  it('ante un empate manda la primera, para no depender del orden', () => {
    expect(combinarFilas([fila('regiones', 2, 0), fila('santiago', 2, 0)])!.fuente).toBe('regiones');
  });
});

describe('cargaDeFila', () => {
  it('suma las cuatro clases', () => {
    expect(cargaDeFila(fila('regiones', 4, 8, 1, 2))).toBe(15);
  });
  it('ignora los negativos en vez de restar', () => {
    expect(cargaDeFila({ ...fila('regiones', 4, 0), bultos: -9 })).toBe(4);
  });
});

describe('la memoria por tienda y fuente', () => {
  it('una fila nueva de la MISMA fuente reemplaza a la anterior', () => {
    // Es un estado, no un histórico: el espejo dice cuánto tiene AHORA.
    const mem: MemoriaSesion = new Map();
    recordarFila(mem, '36CHL', fila('santiago', 2, 0));
    recordarFila(mem, '36CHL', fila('santiago', 3, 1));
    expect([filaCombinada(mem, '36CHL')!.pallets, filaCombinada(mem, '36CHL')!.bultos]).toEqual([3, 1]);
  });

  it('una fila de OTRA fuente convive, no reemplaza — que es todo el arreglo', () => {
    const mem: MemoriaSesion = new Map();
    recordarFila(mem, '36CHL', fila('regiones', 4, 8));
    recordarFila(mem, '36CHL', fila('santiago', 2, 0));
    expect(mem.get('36CHL')!.size).toBe(2);
    expect(filaCombinada(mem, '36CHL')!.bultos).toBe(8);
  });

  it('bajar a cero SÍ se aplica: es lo que dice ese espejo ahora', () => {
    const mem: MemoriaSesion = new Map();
    recordarFila(mem, '36CHL', fila('regiones', 4, 8));
    recordarFila(mem, '36CHL', fila('regiones', 0, 0));
    expect(filaCombinada(mem, '36CHL')!.bultos).toBe(0);
  });

  it('de una tienda que nadie reportó no se sabe nada', () => {
    expect(filaCombinada(new Map(), '99XXX')).toBeNull();
  });

  it('combinadasPorTienda devuelve una fila por tienda, ya resuelta', () => {
    const mem: MemoriaSesion = new Map();
    recordarFila(mem, '36CHL', fila('regiones', 4, 8));
    recordarFila(mem, '36CHL', fila('santiago', 2, 0));
    recordarFila(mem, '01TPS', fila('santiago', 3, 1));
    const out = combinadasPorTienda(mem);
    expect(out.size).toBe(2);
    expect(out.get('36CHL')!.bultos).toBe(8);
    expect(out.get('01TPS')!.pallets).toBe(3);
  });
});
