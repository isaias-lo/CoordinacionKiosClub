import { describe, it, expect } from 'vitest';
import { agruparConsultasPorDia, esUnSoloDia } from '../consultasPorDia';

const HOY = '2026-10-31';
const VIERNES = '2026-10-30';

describe('agruparConsultasPorDia · el día normal no cambia', () => {
  it('sin aperturas, UNA sola consulta con todas', () => {
    const r = agruparConsultasPorDia(['26ALC', '05LP', '33CON'], null, HOY);
    expect(r).toEqual([{ dia: HOY, cods: ['26ALC', '05LP', '33CON'] }]);
    expect(esUnSoloDia(r)).toBe(true);
  });

  it('un mapa vacío es lo mismo que ninguno', () => {
    expect(agruparConsultasPorDia(['26ALC'], new Map(), HOY)).toEqual([{ dia: HOY, cods: ['26ALC'] }]);
  });

  it('sin tiendas, nada', () => {
    expect(agruparConsultasPorDia([], new Map(), HOY)).toEqual([]);
  });
});

describe('agruparConsultasPorDia · el caso de 62PLD', () => {
  const aperturas = new Map([['62PLD', VIERNES]]);

  it('separa la apertura del resto, y hoy va primero', () => {
    const r = agruparConsultasPorDia(['26ALC', '62PLD', '05LP'], aperturas, HOY);
    expect(r).toEqual([
      { dia: HOY, cods: ['26ALC', '05LP'] },
      { dia: VIERNES, cods: ['62PLD'] },
    ]);
    expect(esUnSoloDia(r)).toBe(false);
  });

  it('las otras tiendas NO se enteran: siguen pidiendo hoy', () => {
    const r = agruparConsultasPorDia(['26ALC', '62PLD'], aperturas, HOY);
    expect(r.find(c => c.dia === HOY)?.cods).toEqual(['26ALC']);
  });

  it('una apertura sola es una sola consulta, y no la de hoy', () => {
    const r = agruparConsultasPorDia(['62PLD'], aperturas, HOY);
    expect(r).toEqual([{ dia: VIERNES, cods: ['62PLD'] }]);
  });
});

describe('agruparConsultasPorDia · dos aperturas de días distintos', () => {
  it('62PLD del 30 y 63CAL del 28 son DOS consultas, nunca una', () => {
    // Es la misma regla que en `aperturaOdoo`: los días no se mezclan.
    const aperturas = new Map([['62PLD', VIERNES], ['63CAL', '2026-10-28']]);
    const r = agruparConsultasPorDia(['26ALC', '62PLD', '63CAL'], aperturas, HOY);
    expect(r).toEqual([
      { dia: HOY,          cods: ['26ALC'] },
      { dia: VIERNES,      cods: ['62PLD'] },
      { dia: '2026-10-28', cods: ['63CAL'] },
    ]);
  });

  it('dos tiendas del MISMO día viajan juntas', () => {
    const aperturas = new Map([['62PLD', VIERNES], ['63CAL', VIERNES]]);
    const r = agruparConsultasPorDia(['62PLD', '63CAL'], aperturas, HOY);
    expect(r).toEqual([{ dia: VIERNES, cods: ['62PLD', '63CAL'] }]);
  });
});

describe('agruparConsultasPorDia · nada deja de pedirse', () => {
  it('un día mal formado cae en hoy en vez de perderse', () => {
    for (const malo of ['basura', '30/10/2026', '', '   ']) {
      const r = agruparConsultasPorDia(['62PLD'], new Map([['62PLD', malo]]), HOY);
      expect(r).toEqual([{ dia: HOY, cods: ['62PLD'] }]);
    }
  });

  it('normaliza el código y no lo duplica', () => {
    const r = agruparConsultasPorDia([' 26alc ', '26ALC'], null, HOY);
    expect(r).toEqual([{ dia: HOY, cods: ['26ALC'] }]);
  });

  it('códigos vacíos se descartan sin romper', () => {
    expect(agruparConsultasPorDia(['', '  ', '26ALC'], null, HOY)).toEqual([{ dia: HOY, cods: ['26ALC'] }]);
  });

  it('una apertura fechada HOY no abre una consulta aparte', () => {
    const r = agruparConsultasPorDia(['62PLD', '26ALC'], new Map([['62PLD', HOY]]), HOY);
    expect(r).toEqual([{ dia: HOY, cods: ['62PLD', '26ALC'] }]);
  });
});
