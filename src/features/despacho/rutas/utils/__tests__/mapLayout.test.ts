import { describe, it, expect } from 'vitest';
import {
  clampMapPct, mapaColapsado, anchoMapa, anchoContenido,
  MAP_PCT_DEFAULT, MAP_PCT_MIN, MAP_PCT_MAX,
} from '../mapLayout';

describe('anchoMapa — el test que protege la factura', () => {
  // Si esto devuelve algo falsy, el siguiente que toque InputSection va a escribir
  // `{ancho && <panel/>}`, el panel se va a desmontar, `lastDrawnRef` se va a perder y cada
  // mostrar/esconder va a re-llamar a Google Directions, que se factura por llamada.
  it('colapsado devuelve un ancho de verdad, NO null ni undefined ni cadena vacía', () => {
    const v = anchoMapa(true, 37);
    expect(v).toBe('0 0 0px');
    expect(v).toBeTruthy();
  });

  it('visible devuelve el porcentaje pedido', () => {
    expect(anchoMapa(false, 37)).toBe('0 0 37%');
    expect(anchoMapa(false, 55)).toBe('0 0 55%');
  });

  it('sanea el porcentaje también al construir el ancho', () => {
    expect(anchoMapa(false, 999)).toBe(`0 0 ${MAP_PCT_DEFAULT}%`);
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

describe('anchoContenido — el contenido se queda con lo que el mapa no ocupa', () => {
  it('con el mapa visible reparten el ancho', () => {
    expect(anchoContenido(false, 37, true)).toBe('1 1 63%');
  });

  it('con el mapa colapsado el contenido toma todo', () => {
    expect(anchoContenido(true, 37, true)).toBe('1 1 100%');
  });

  it('sin mapa el contenido toma todo', () => {
    expect(anchoContenido(false, 37, false)).toBe('1 1 100%');
  });
});

describe('restaurar devuelve el ancho guardado, no el default', () => {
  it('esconder y mostrar conserva el % que tenía el usuario', () => {
    const guardado = 52;
    expect(anchoMapa(true, guardado)).toBe('0 0 0px');       // escondido
    expect(anchoMapa(false, guardado)).toBe('0 0 52%');      // restaurado → su ancho, no 37
  });
});

