import { describe, it, expect } from 'vitest';
import { esLecturaDeLector, Rafaga, ConfirmacionDoble, siguienteCampo } from '../lectorBodega';

// Caracteres de `texto` separados por `paso` ms, desde `t0`.
function tecleo(texto: string, paso: number, t0 = 1000) {
  return [...texto].map((c, i) => ({ texto: c, t: t0 + i * paso }));
}

describe('esLecturaDeLector', () => {
  it('el lector escribe una etiqueta completa en pocos milisegundos', () => {
    expect(esLecturaDeLector(tecleo('1B28TEM22092026B', 8))).toBe(true);
  });

  it('una persona tecleando un número de pallet no es el lector', () => {
    expect(esLecturaDeLector(tecleo('14449', 110))).toBe(false);
  });

  it('una persona muy rápida tampoco', () => {
    expect(esLecturaDeLector(tecleo('14449', 70))).toBe(false);
  });

  it('el modo pegar (todo en un evento) es el lector', () => {
    expect(esLecturaDeLector([{ texto: 'P1228TEM22092026P', t: 5 }])).toBe(true);
  });

  it('tres caracteres rápidos no alcanzan para ser una etiqueta', () => {
    expect(esLecturaDeLector(tecleo('123', 5))).toBe(false);
  });

  it('una pausa larga en medio corta la lectura', () => {
    const tramos = [...tecleo('1B28', 8, 0), ...tecleo('TEM2', 8, 500)];
    expect(esLecturaDeLector(tramos)).toBe(false);
  });
});

describe('Rafaga', () => {
  it('devuelve el código y la marca tomada al primer carácter', () => {
    const r = new Rafaga<string>();
    let marcas = 0;
    for (const { texto, t } of tecleo('1B28TEM22092026B', 8)) r.agregar(texto, t, () => `m${++marcas}`);
    expect(r.cerrar()).toEqual({ codigo: '1B28TEM22092026B', marca: 'm1' });
    expect(r.pendiente).toBe(false);
  });

  it('lo que teclea una persona se descarta al cerrar', () => {
    const r = new Rafaga<string>();
    for (const { texto, t } of tecleo('35,5', 150)) r.agregar(texto, t, () => 'm');
    expect(r.cerrar()).toBeNull();
  });

  it('tras una pausa larga empieza otra lectura con su propia marca', () => {
    const r = new Rafaga<number>();
    let n = 0;
    r.agregar('3', 0, () => ++n);            // una persona tecleó un 3 en Peso
    for (const { texto, t } of tecleo('14449', 6, 900)) r.agregar(texto, t, () => ++n);
    expect(r.cerrar()).toEqual({ codigo: '14449', marca: 2 });
  });

  it('ignora los saltos de línea que algunos lectores meten en el valor', () => {
    const r = new Rafaga<string>();
    r.agregar('14449\n', 0, () => 'm');
    expect(r.cerrar()).toEqual({ codigo: '14449', marca: 'm' });
  });
});

describe('ConfirmacionDoble', () => {
  it('la primera lectura pide confirmar y la misma etiqueta otra vez pasa', () => {
    const c = new ConfirmacionDoble(6000);
    expect(c.confirmar('A1', 0)).toBe(false);
    expect(c.confirmar('A1', 2000)).toBe(true);
  });

  it('otra etiqueta vuelve a pedir confirmación', () => {
    const c = new ConfirmacionDoble(6000);
    c.confirmar('A1', 0);
    expect(c.confirmar('B2', 1000)).toBe(false);
  });

  it('fuera de la ventana vuelve a pedirla', () => {
    const c = new ConfirmacionDoble(6000);
    c.confirmar('A1', 0);
    expect(c.confirmar('A1', 7000)).toBe(false);
  });
});

describe('siguienteCampo', () => {
  it('peso pasa a alto y alto guarda', () => {
    expect(siguienteCampo(['peso', 'alto'], 'peso')).toBe('alto');
    expect(siguienteCampo(['peso', 'alto'], 'alto')).toBe('guardar');
  });

  it('sin alto (chocolate, contenedor) Enter en peso guarda', () => {
    expect(siguienteCampo(['peso'], 'peso')).toBe('guardar');
  });

  it('un bulto sigue por ancho y largo antes de guardar', () => {
    expect(siguienteCampo(['peso', 'alto', 'ancho', 'largo'], 'alto')).toBe('ancho');
    expect(siguienteCampo(['peso', 'alto', 'ancho', 'largo'], 'largo')).toBe('guardar');
  });

  it('un campo fuera de la cadena no hace nada', () => {
    expect(siguienteCampo(['peso', 'alto'], 'cajas')).toBeNull();
  });
});
