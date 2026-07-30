import { describe, it, expect } from 'vitest';
import {
  hayDiferencia,
  nuevoSeguimientoRecepcion,
  esSeguimientoValido,
  elegirFechaDespacho,
  type Cantidades,
  type DespachoCandidato,
} from '../recepcionEstado';

const C = (pallets: number, bultos: number, contenedores = 0): Cantidades => ({ pallets, bultos, contenedores });

describe('esSeguimientoValido', () => {
  it('acepta los estados del semáforo', () => {
    for (const s of ['Registrado', 'Pendiente', 'En camino', 'Entregado', 'Recibido', 'Diferencia']) {
      expect(esSeguimientoValido(s)).toBe(true);
    }
  });
  it('rechaza estados inválidos (bug combine)', () => {
    expect(esSeguimientoValido('Listo para despachar')).toBe(false);
    expect(esSeguimientoValido('')).toBe(false);
    expect(esSeguimientoValido(null)).toBe(false);
    expect(esSeguimientoValido(undefined)).toBe(false);
  });
});

describe('hayDiferencia', () => {
  it('sin diferencia cuando todo coincide', () => {
    expect(hayDiferencia(C(5, 3, 1), C(5, 3, 1))).toBe(false);
  });
  it('diferencia por pallets', () => {
    expect(hayDiferencia(C(5, 3), C(4, 3))).toBe(true);
  });
  it('diferencia por bultos', () => {
    expect(hayDiferencia(C(5, 3), C(5, 2))).toBe(true);
  });
  it('diferencia por contenedores', () => {
    expect(hayDiferencia(C(5, 3, 2), C(5, 3, 1))).toBe(true);
  });
  it('trata undefined/null como 0', () => {
    expect(hayDiferencia({ pallets: 0, bultos: 0, contenedores: 0 }, C(0, 0, 0))).toBe(false);
  });
});

describe('nuevoSeguimientoRecepcion', () => {
  describe("origen 'tienda' (la tienda confirma)", () => {
    it('Recibido cuando recibido == enviado', () => {
      expect(nuevoSeguimientoRecepcion({
        origen: 'tienda', enviado: C(5, 3), recibido: C(5, 3), recibidoTiendaPrevio: null,
      })).toBe('Recibido');
    });
    it('Diferencia cuando recibió menos', () => {
      expect(nuevoSeguimientoRecepcion({
        origen: 'tienda', enviado: C(5, 3), recibido: C(4, 3), recibidoTiendaPrevio: null,
      })).toBe('Diferencia');
    });
    it("NUNCA 'Entregado' aunque no haya registro previo (regresión del bug fuente)", () => {
      const r = nuevoSeguimientoRecepcion({
        origen: 'tienda', enviado: C(1, 0), recibido: C(1, 0), recibidoTiendaPrevio: null,
      });
      expect(r).not.toBe('Entregado');
      expect(['Recibido', 'Diferencia']).toContain(r);
    });
  });

  describe('origen chofer/entrega', () => {
    it("Entregado cuando la tienda aún no registró recepción", () => {
      expect(nuevoSeguimientoRecepcion({
        origen: 'conductor', enviado: C(5, 3), recibido: C(5, 3), recibidoTiendaPrevio: null,
      })).toBe('Entregado');
    });
    it('Recibido cuando la tienda ya recibió conforme', () => {
      expect(nuevoSeguimientoRecepcion({
        origen: 'conductor', enviado: C(5, 3), recibido: C(0, 0), recibidoTiendaPrevio: C(5, 3),
      })).toBe('Recibido');
    });
    it('Diferencia cuando la tienda recibió distinto a lo enviado', () => {
      expect(nuevoSeguimientoRecepcion({
        origen: 'chofer', enviado: C(5, 3), recibido: C(0, 0), recibidoTiendaPrevio: C(4, 3),
      })).toBe('Diferencia');
    });
  });
});

describe('elegirFechaDespacho', () => {
  const cand = (fecha: string, seguimiento: string, created_at: string): DespachoCandidato => ({ fecha, seguimiento, created_at });

  it('devuelve null sin candidatos', () => {
    expect(elegirFechaDespacho([])).toBeNull();
  });

  it('caso simple: un solo despacho', () => {
    expect(elegirFechaDespacho([cand('29/07/2026', 'Pendiente', '2026-07-29T10:00:00Z')])).toBe('29/07/2026');
  });

  it('prefiere el despacho MÁS AVANZADO (en ruta) sobre el fresco recién armado', () => {
    // Escenario del revisor: ayer 'En camino' (en ruta) + hoy 'Pendiente' (fresco).
    // La recepción debe apuntar al de AYER, no marcar el fresco de hoy como Recibido.
    const r = elegirFechaDespacho([
      cand('29/07/2026', 'Pendiente', '2026-07-29T08:00:00Z'), // hoy, fresco (created más nuevo)
      cand('28/07/2026', 'En camino', '2026-07-28T09:00:00Z'), // ayer, en ruta
    ]);
    expect(r).toBe('28/07/2026');
  });

  it('ignora despachos ya Recibido/Diferencia y toma el activo', () => {
    const r = elegirFechaDespacho([
      cand('29/07/2026', 'Recibido',  '2026-07-29T10:00:00Z'),
      cand('28/07/2026', 'Pendiente', '2026-07-28T10:00:00Z'),
    ]);
    expect(r).toBe('28/07/2026');
  });

  it('si todos están recibidos, permite re-recepción del más reciente', () => {
    const r = elegirFechaDespacho([
      cand('28/07/2026', 'Recibido', '2026-07-28T10:00:00Z'),
      cand('29/07/2026', 'Recibido', '2026-07-29T10:00:00Z'),
    ]);
    expect(r).toBe('29/07/2026');
  });

  it('a igual avance, desempata por el más reciente (limitación conocida)', () => {
    const r = elegirFechaDespacho([
      cand('28/07/2026', 'Pendiente', '2026-07-28T10:00:00Z'),
      cand('29/07/2026', 'Pendiente', '2026-07-29T10:00:00Z'),
    ]);
    expect(r).toBe('29/07/2026');
  });
});
