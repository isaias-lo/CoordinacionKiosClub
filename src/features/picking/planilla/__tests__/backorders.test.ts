import { describe, it, expect } from 'vitest';
import {
  indiceRegistros, marcaBackorder, resolverOrigen, textoBackorder, tituloBackorder,
} from '../backorders';

// El caso real medido el 05/11/2026 en Odoo:
//   99REC/DT/148618  done       4 registros
//   99REC/DT/148785  assigned   1 registro   backorder_de = 148618
const CRUDOS = [
  { ref: '99REC/DT/148618', registros: 4 },
  { ref: '99REC/DT/148785', registros: 1 },
  { ref: '99REC/DT/148611', registros: 6 },
];

describe('indiceRegistros', () => {
  it('indexa cada movimiento por su referencia', () => {
    const i = indiceRegistros(CRUDOS);
    expect(i.get('99REC/DT/148618')).toBe(4);
    expect(i.get('99REC/DT/148785')).toBe(1);
    expect(i.size).toBe(3);
  });

  it('un movimiento sin referencia no entra', () => {
    // Una línea agregada a mano no tiene ref: indexarla con '' haría que cualquier backorder
    // sin original resolviera contra ella.
    const i = indiceRegistros([...CRUDOS, { ref: '', registros: 99 }]);
    expect(i.has('')).toBe(false);
    expect(i.size).toBe(3);
  });

  it('un cero es un cero y se indexa', () => {
    const i = indiceRegistros([{ ref: 'A', registros: 0 }]);
    expect(i.get('A')).toBe(0);
  });
});

describe('resolverOrigen', () => {
  const indice = indiceRegistros(CRUDOS);

  it('lo que no es backorder da null', () => {
    expect(resolverOrigen(null, indice)).toBeNull();
    expect(resolverOrigen(undefined, indice)).toBeNull();
    expect(resolverOrigen('', indice)).toBeNull();
  });

  it('resuelve el número del original', () => {
    expect(resolverOrigen('99REC/DT/148618', indice))
      .toEqual({ ref: '99REC/DT/148618', registros: 4 });
  });

  it('si el original no vino, sigue siendo backorder pero sin número', () => {
    // Callarlo sería volver al problema que esto arregla: la línea se leería como trabajo
    // que nadie empezó.
    expect(resolverOrigen('99REC/DT/000000', indice))
      .toEqual({ ref: '99REC/DT/000000', registros: null });
  });

  it('un original con cero registros no se confunde con «no vino»', () => {
    // Con `||` en vez de `??` un 0 se volvería null y la etiqueta diría «resto de otro».
    const i = indiceRegistros([{ ref: 'A', registros: 0 }]);
    expect(resolverOrigen('A', i)).toEqual({ ref: 'A', registros: 0 });
  });
});

describe('textoBackorder', () => {
  it('dice de cuántos quedó', () => {
    expect(textoBackorder({ ref: 'X', registros: 4 })).toBe('resto de 4');
    expect(textoBackorder({ ref: 'X', registros: 145 })).toBe('resto de 145');
  });

  it('sin el número, igual dice que es un resto', () => {
    expect(textoBackorder({ ref: 'X', registros: null })).toBe('resto de otro');
  });

  it('cero es un número, no un dato faltante', () => {
    expect(textoBackorder({ ref: 'X', registros: 0 })).toBe('resto de 0');
  });
});

describe('tituloBackorder', () => {
  it('nombra el movimiento original y su número', () => {
    const t = tituloBackorder({ ref: '99REC/DT/148618', registros: 4 });
    expect(t).toContain('99REC/DT/148618');
    expect(t).toContain('4 registros');
    expect(t).toContain('No es un movimiento nuevo sin empezar');
  });

  it('un solo registro va en singular', () => {
    expect(tituloBackorder({ ref: 'X', registros: 1 })).toContain('1 registro.');
    expect(tituloBackorder({ ref: 'X', registros: 1 })).not.toContain('1 registros');
  });

  it('sin el número no inventa uno', () => {
    const t = tituloBackorder({ ref: 'X', registros: null });
    expect(t).toContain('ya se validó.');
    expect(t).not.toMatch(/\d+ registros?/);
  });

  it('no dice «sin stock»: un backorder assigned tiene stock reservado', () => {
    // `assigned` en Odoo es reservado. El que espera stock es `confirmed`, y ese no entra a la
    // hoja. Afirmar «sin stock» sería inventar un motivo que el dato no dice.
    expect(tituloBackorder({ ref: 'X', registros: 4 })).not.toMatch(/sin stock/i);
  });
});

describe('marcaBackorder', () => {
  it('es compacta, para el papel', () => {
    expect(marcaBackorder({ ref: 'X', registros: 4 })).toBe('↳4');
    expect(marcaBackorder({ ref: 'X', registros: null })).toBe('↳');
  });
});
