import { describe, it, expect } from 'vitest';
import { alcanceEntrega } from '../alcanceEntrega';

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
