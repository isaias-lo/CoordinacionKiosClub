import { describe, it, expect } from 'vitest';
import { indiceDestino, esMovimientoReal, ladoDeLinea } from '../reordenarTactil';

describe('indiceDestino — a qué parada corresponde soltar', () => {
  it('lee el índice de la fila bajo el dedo', () => {
    expect(indiceDestino('0', 7)).toBe(0);
    expect(indiceDestino('6', 7)).toBe(6);
  });

  it('fuera de la lista no hay dónde soltar', () => {
    expect(indiceDestino('7', 7)).toBeNull();
    expect(indiceDestino('-1', 7)).toBeNull();
  });

  it('soltar sobre algo que no es una fila no hace nada', () => {
    // `null` es "no pasó nada", nunca "soltar en 0": soltar donde la persona no eligió es peor
    // que no soltar.
    for (const v of [null, undefined, '', 'abc', '1.5']) expect(indiceDestino(v, 7)).toBeNull();
  });

  it('una lista vacía no acepta ningún destino', () => {
    expect(indiceDestino('0', 0)).toBeNull();
  });
});

describe('esMovimientoReal — no marcar orden manual por un toque que no movió nada', () => {
  it('mover a otra posición sí cuenta', () => {
    expect(esMovimientoReal(2, 0)).toBe(true);
  });

  it('soltar sobre sí misma no', () => {
    expect(esMovimientoReal(3, 3)).toBe(false);
  });

  it('sin origen o sin destino, no', () => {
    expect(esMovimientoReal(null, 2)).toBe(false);
    expect(esMovimientoReal(2, null)).toBe(false);
    expect(esMovimientoReal(null, null)).toBe(false);
  });

  it('el índice 0 no se confunde con ausencia', () => {
    expect(esMovimientoReal(0, 3)).toBe(true);
    expect(esMovimientoReal(3, 0)).toBe(true);
  });
});

describe('ladoDeLinea — dónde se anuncia que va a caer la parada', () => {
  it('bajando, la línea va DEBAJO de la fila de destino', () => {
    // 0 → 3: la parada sale de la lista y se inserta en 3, o sea después de la que ahí estaba.
    expect(ladoDeLinea(0, 3)).toBe('abajo');
  });

  it('subiendo, la línea va ENCIMA', () => {
    expect(ladoDeLinea(4, 1)).toBe('arriba');
  });

  it('sin movimiento real no se dibuja nada', () => {
    expect(ladoDeLinea(2, 2)).toBeNull();
    expect(ladoDeLinea(null, 2)).toBeNull();
    expect(ladoDeLinea(2, null)).toBeNull();
  });
});
