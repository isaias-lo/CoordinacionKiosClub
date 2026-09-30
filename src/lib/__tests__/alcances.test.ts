import { describe, it, expect } from 'vitest';
import { alcanceEntrega, alcanceRecepcion } from '../alcances';

describe('alcanceEntrega', () => {
  // Este test fija el formato a propósito. El cliente (EntregaParadaForm) y el servidor
  // (/api/rutas-despacho) construyen este mismo string por separado; si se desalinearan, el
  // comprobante nunca validaría y el síntoma sería idéntico al bug que vino a arreglar: la
  // entrega rechazada, la cola reintentando y nadie enterándose.
  it('identifica la parada y nada más', () => {
    expect(alcanceEntrega(1234)).toBe('ruta_tienda:1234');
  });

  it('paradas distintas dan alcances distintos', () => {
    expect(alcanceEntrega(1)).not.toBe(alcanceEntrega(2));
  });
});

describe('alcanceRecepcion', () => {
  // Mismo motivo que arriba: RecepcionClient y /api/recepcion lo construyen por separado.
  it('identifica la tienda y el despacho concreto', () => {
    expect(alcanceRecepcion('01ABC', 'CANON-9')).toBe('recepcion:01ABC:CANON-9');
  });

  it('llega hasta la tienda cuando el QR no trae el despacho', () => {
    expect(alcanceRecepcion('01ABC')).toBe('recepcion:01ABC');
    expect(alcanceRecepcion('01ABC', null)).toBe('recepcion:01ABC');
    expect(alcanceRecepcion('01ABC', '')).toBe('recepcion:01ABC');
  });

  it('despachos distintos de la misma tienda dan alcances distintos', () => {
    // Si no, un comprobante serviría para confirmar otra recepción de la misma tienda dentro de
    // las 72 horas que dura.
    expect(alcanceRecepcion('01ABC', 'A')).not.toBe(alcanceRecepcion('01ABC', 'B'));
  });

  it('no se cruza con el alcance de una entrega', () => {
    // Un comprobante emitido para que el chofer cierre una parada no puede servir para que
    // alguien confirme una recepción de tienda.
    expect(alcanceRecepcion('01ABC', '1234')).not.toBe(alcanceEntrega(1234));
  });
});
