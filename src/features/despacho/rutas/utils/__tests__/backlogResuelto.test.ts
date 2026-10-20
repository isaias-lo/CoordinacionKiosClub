import { describe, it, expect } from 'vitest';
import { sinResueltas, claveDeResuelta, type PendienteBacklog } from '../backlogSegundaVuelta';

const p = (c: string, fechaOrigen: string, pal = 2): PendienteBacklog =>
  ({ c, p: pal, b: 0, ch: 0, fechaOrigen });

const LUNES = '2026-10-12';
const JUEVES = '2026-10-15';

describe('claveDeResuelta', () => {
  it('normaliza el código y recorta', () => {
    expect(claveDeResuelta(LUNES, ' 36chl ')).toBe(`${LUNES}::36CHL`);
  });

  it('la Ñ sobrevive', () => {
    expect(claveDeResuelta(LUNES, '23peñ')).toBe(`${LUNES}::23PEÑ`);
  });
});

describe('sinResueltas', () => {
  const backlog = [p('24SPP', LUNES), p('36CHL', LUNES), p('36CHL', JUEVES)];

  it('sin marcas, devuelve el mismo backlog', () => {
    expect(sinResueltas(backlog, [])).toEqual(backlog);
  });

  it('saca la tienda marcada', () => {
    const r = sinResueltas(backlog, [{ fechaOrigen: LUNES, cod: '24SPP' }]);
    expect(r.map(x => `${x.fechaOrigen}::${x.c}`)).toEqual([`${LUNES}::36CHL`, `${JUEVES}::36CHL`]);
  });

  it('LA REGLA QUE IMPORTA: la marca es por tienda Y DÍA, no por tienda', () => {
    // 36CHL quedó pendiente el lunes y otra vez el jueves. Resolver el lunes no dice nada del
    // jueves: son dos cargas distintas. Cruzando solo por código, el jueves desaparecería sin
    // que nadie lo hubiera decidido.
    const r = sinResueltas(backlog, [{ fechaOrigen: LUNES, cod: '36CHL' }]);
    expect(r.map(x => `${x.fechaOrigen}::${x.c}`)).toEqual([`${LUNES}::24SPP`, `${JUEVES}::36CHL`]);
  });

  it('el día completo saca todas las de ese día y deja los otros', () => {
    const delLunes = backlog.filter(x => x.fechaOrigen === LUNES)
      .map(x => ({ fechaOrigen: x.fechaOrigen, cod: x.c }));
    const r = sinResueltas(backlog, delLunes);
    expect(r).toEqual([p('36CHL', JUEVES)]);
  });

  it('una marca de una tienda que ya no está pendiente no molesta', () => {
    const r = sinResueltas(backlog, [{ fechaOrigen: LUNES, cod: '99XXX' }]);
    expect(r).toEqual(backlog);
  });

  it('cruza aunque el código venga en minúsculas o con espacios', () => {
    const r = sinResueltas(backlog, [{ fechaOrigen: LUNES, cod: ' 24spp ' }]);
    expect(r.some(x => x.c === '24SPP' && x.fechaOrigen === LUNES)).toBe(false);
  });

  it('marcarlo todo deja la lista vacía', () => {
    const todas = backlog.map(x => ({ fechaOrigen: x.fechaOrigen, cod: x.c }));
    expect(sinResueltas(backlog, todas)).toEqual([]);
  });

  it('no muta el arreglo que recibe', () => {
    const copia = [...backlog];
    sinResueltas(backlog, [{ fechaOrigen: LUNES, cod: '24SPP' }]);
    expect(backlog).toEqual(copia);
  });
});
