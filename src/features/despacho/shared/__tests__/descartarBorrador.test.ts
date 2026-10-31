import { describe, it, expect } from 'vitest';
import { contarPesadoSinRegistrar, pedidoDescartarBorrador, enKilos } from '../descartarBorrador';

const slot = (id: number, peso: number | null) => ({ id, peso });

describe('contarPesadoSinRegistrar', () => {
  it('cuenta lo pesado que no está registrado', () => {
    const r = contarPesadoSinRegistrar([slot(1, 100), slot(2, 50.5)], new Set());
    expect(r).toEqual({ unidades: 2, kg: 150.5 });
  });

  it('no cuenta lo que ya está registrado', () => {
    const r = contarPesadoSinRegistrar([slot(1, 100), slot(2, 50)], new Set([1]));
    expect(r).toEqual({ unidades: 1, kg: 50 });
  });

  it('una unidad SIN pesar no es una pérdida: todavía no hay nada', () => {
    const r = contarPesadoSinRegistrar([slot(1, null), slot(2, 0), slot(3, 20)], new Set());
    expect(r).toEqual({ unidades: 1, kg: 20 });
  });

  it('todo registrado → cero', () => {
    expect(contarPesadoSinRegistrar([slot(1, 100)], new Set([1]))).toEqual({ unidades: 0, kg: 0 });
  });

  it('sin slots → cero', () => {
    expect(contarPesadoSinRegistrar([], new Set())).toEqual({ unidades: 0, kg: 0 });
  });

  it('redondea a un decimal: sumar flotantes deja colas que parecen un error', () => {
    const r = contarPesadoSinRegistrar([slot(1, 0.1), slot(2, 0.2)], new Set());
    expect(r.kg).toBe(0.3);
  });

  it('EL CASO DEL 22/10: 46 unidades y 8.557,9 kg', () => {
    // Las 46 unidades reales de ese día, con su peso repartido. Lo que importa es que el total
    // que la pregunta va a mostrar sea el que se midió contra la balanza.
    const slots = Array.from({ length: 46 }, (_, i) => slot(i + 1, 186.041304347826));
    const r = contarPesadoSinRegistrar(slots, new Set());
    expect(r.unidades).toBe(46);
    expect(r.kg).toBe(8557.9);
  });
});

describe('enKilos', () => {
  it('escribe el peso como en Chile', () => {
    expect(enKilos(8557.9)).toBe('8.557,9');
    expect(enKilos(196.5)).toBe('196,5');
    expect(enKilos(20)).toBe('20,0');
  });
});

describe('pedidoDescartarBorrador', () => {
  const FECHA = 'jueves 22 de octubre';

  it('sin nada pesado, es la pregunta de siempre', () => {
    const p = pedidoDescartarBorrador(FECHA, { unidades: 0, kg: 0 });
    expect(p.titulo).toBe(`¿Descartar el borrador del ${FECHA}?`);
    expect(p.detalle).toBe('No se puede deshacer.');
    expect(p.aceptar).toBe('Descartar');
    expect(p.tono).toBe('peligro');
  });

  it('si no se pudo averiguar, tampoco inventa nada', () => {
    // Las consultas pueden fallar. Un aviso que no se puede calcular no bloquea una acción que
    // hoy funciona: la pregunta vuelve a ser la de antes.
    expect(pedidoDescartarBorrador(FECHA, null).detalle).toBe('No se puede deshacer.');
    expect(pedidoDescartarBorrador(FECHA, null).aceptar).toBe('Descartar');
  });

  it('LO QUE FALTABA EL 22: dice cuánto trabajo se está tirando', () => {
    const p = pedidoDescartarBorrador(FECHA, { unidades: 46, kg: 8557.9 });
    expect(p.detalle).toContain('46 unidades pesadas');
    expect(p.detalle).toContain('8.557,9 kg');
    expect(p.detalle).toContain('nunca se registraron');
  });

  it('y manda a la salida que SÍ conserva el trabajo', () => {
    const p = pedidoDescartarBorrador(FECHA, { unidades: 46, kg: 8557.9 });
    expect(p.detalle).toContain('Registrar ahora');
  });

  it('el botón deja de decir «Descartar» a secas', () => {
    // «Descartar» solo suena a limpiar una pantalla. «igual» avisa que se pasa por encima de lo
    // que la pregunta acaba de nombrar.
    expect(pedidoDescartarBorrador(FECHA, { unidades: 46, kg: 8557.9 }).aceptar).toBe('Descartar igual');
  });

  it('una sola unidad se dice en singular', () => {
    const p = pedidoDescartarBorrador(FECHA, { unidades: 1, kg: 196.5 });
    expect(p.detalle).toContain('1 unidad pesada y 196,5 kg');
  });

  it('siempre en tono de peligro: borra', () => {
    for (const p of [null, { unidades: 0, kg: 0 }, { unidades: 3, kg: 10 }]) {
      expect(pedidoDescartarBorrador(FECHA, p).tono).toBe('peligro');
    }
  });
});
