import { describe, it, expect } from 'vitest';
import {
  clampMapPct, mapaColapsado, anchoCortina, alTocarCortina, ANCHO_TIENDAS_PX,
  MAP_PCT_DEFAULT, MAP_PCT_MIN, MAP_PCT_MAX,
} from '../mapLayout';

describe('anchoCortina — el test que protege la factura', () => {
  // Si esto devuelve algo falsy, el siguiente que toque InputSection va a escribir
  // `{ancho && <panel/>}`, el panel se va a desmontar, `lastDrawnRef` se va a perder y cada
  // mostrar/esconder va a re-llamar a Google Directions, que se factura por llamada.
  it('colapsado devuelve un ancho de verdad, NO null ni undefined ni cadena vacía', () => {
    const v = anchoCortina({ colapsada: true, completa: false, pct: 37 });
    expect(v).toBe('0%');
    expect(v).toBeTruthy();
  });

  it('visible devuelve el porcentaje pedido', () => {
    expect(anchoCortina({ colapsada: false, completa: false, pct: 37 })).toBe('37%');
    expect(anchoCortina({ colapsada: false, completa: false, pct: 55 })).toBe('55%');
  });

  it('sanea el porcentaje también al construir el ancho', () => {
    expect(anchoCortina({ colapsada: false, completa: false, pct: 999 })).toBe(`${MAP_PCT_DEFAULT}%`);
  });
});

describe('mapaColapsado', () => {
  it('FLOTA colapsa aunque nadie lo haya escondido — ese tab no usa mapa', () => {
    expect(mapaColapsado({ modo: 'flota', oculto: false })).toBe(true);
  });

  it('el coordinador lo escondió a mano', () => {
    expect(mapaColapsado({ modo: 'drag', oculto: true })).toBe(true);
  });

  it('en los demás tabs, visible por defecto', () => {
    for (const modo of ['drag', 'plan', 'cal', 'cong', 'v2', 'man']) {
      expect(mapaColapsado({ modo, oculto: false })).toBe(false);
    }
  });
});

describe('clampMapPct', () => {
  it('deja pasar lo que está en rango', () => {
    expect(clampMapPct(37)).toBe(37);
    expect(clampMapPct(MAP_PCT_MIN)).toBe(MAP_PCT_MIN);
    expect(clampMapPct(MAP_PCT_MAX)).toBe(MAP_PCT_MAX);
  });

  it('basura en localStorage vuelve al valor por defecto', () => {
    for (const basura of ['', '   ', 'abc', null, undefined, NaN, {}, [], '12px']) {
      expect(clampMapPct(basura)).toBe(MAP_PCT_DEFAULT);
    }
  });

  it('fuera de rango vuelve al valor por defecto, no se recorta al borde', () => {
    // Recortar a 20 o a 60 escondería que el valor guardado era inservible.
    expect(clampMapPct(5)).toBe(MAP_PCT_DEFAULT);
    expect(clampMapPct(95)).toBe(MAP_PCT_DEFAULT);
    expect(clampMapPct(-10)).toBe(MAP_PCT_DEFAULT);
  });

  it('acepta el string que devuelve localStorage', () => {
    expect(clampMapPct('45')).toBe(45);
  });
});

describe('anchoCortina — el mapa TAPA la columna, no la empuja', () => {
  it('abierta mide el porcentaje elegido', () => {
    expect(anchoCortina({ colapsada: false, completa: false, pct: 37 })).toBe('37%');
    expect(anchoCortina({ colapsada: false, completa: false, pct: 55 })).toBe('55%');
  });

  it('colapsada mide 0% — y sigue montada', () => {
    // Devolver 0% y no algo falsy es el punto del módulo: un valor falsy invita al `{cond && ...}`
    // que desmonta el panel y vuelve a facturar Directions.
    expect(anchoCortina({ colapsada: true, completa: false, pct: 37 })).toBe('0%');
  });

  it('sanea un porcentaje fuera de rango en vez de romper el layout', () => {
    expect(anchoCortina({ colapsada: false, completa: false, pct: 999 })).toBe('37%');
    expect(anchoCortina({ colapsada: false, completa: false, pct: Number.NaN })).toBe('37%');
  });
});
describe('restaurar devuelve el ancho guardado, no el default', () => {
  it('esconder y mostrar conserva el % que tenía el usuario', () => {
    const guardado = 52;
    expect(anchoCortina({ colapsada: true, completa: false, pct: guardado })).toBe('0%');   // escondido
    expect(anchoCortina({ colapsada: false, completa: false, pct: guardado })).toBe('52%'); // restaurado
  });
});

describe('la cortina entera — lo que pedía el boceto', () => {
  it('entera tapa todo MENOS la columna de tiendas', () => {
    // No es 100%: se deja la columna de tiendas a la vista para poder seguir arrastrando desde ahí
    // mientras se mira el mapa.
    expect(anchoCortina({ colapsada: false, completa: true, pct: 37 }))
      .toBe(`calc(100% - ${ANCHO_TIENDAS_PX}px)`);
  });

  it('entera le gana al porcentaje arrastrado', () => {
    expect(anchoCortina({ colapsada: false, completa: true, pct: 20 }))
      .toBe(anchoCortina({ colapsada: false, completa: true, pct: 80 }));
  });

  it('cerrada manda sobre todo lo demás', () => {
    expect(anchoCortina({ colapsada: true, completa: true, pct: 80 })).toBe('0%');
  });
});

describe('alTocarCortina — un toque empuja al extremo', () => {
  it('cerrada → entera', () => {
    expect(alTocarCortina({ colapsada: true, completa: false }))
      .toEqual({ colapsada: false, completa: true });
  });

  it('entera → cerrada', () => {
    expect(alTocarCortina({ colapsada: false, completa: true }))
      .toEqual({ colapsada: true, completa: false });
  });

  it('a medias (arrastrada) → entera, no cerrada', () => {
    // El modo de falla que evita: tener la cortina al 40%, tocar para agrandarla y que se cierre.
    expect(alTocarCortina({ colapsada: false, completa: false }))
      .toEqual({ colapsada: false, completa: true });
  });

  it('tocar dos veces desde cerrada vuelve a cerrada', () => {
    const a = alTocarCortina({ colapsada: true, completa: false });
    expect(alTocarCortina(a)).toEqual({ colapsada: true, completa: false });
  });
});
