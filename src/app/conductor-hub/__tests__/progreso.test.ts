import { describe, it, expect } from 'vitest';
import { progresoRuta, proximaParadaPendiente, type ParadaProgreso } from '../progreso';

function parada(id: number, orden: number, estado_entrega: string): ParadaProgreso {
  return { id, orden, estado_entrega };
}

describe('progresoRuta', () => {
  it('cuenta 0/0 sin paradas', () => {
    expect(progresoRuta([])).toEqual({ entregadas: 0, total: 0 });
  });

  it('cuenta solo estado_entrega === "entregado" como entregada', () => {
    const paradas = [
      parada(1, 1, 'entregado'),
      parada(2, 2, 'pendiente'),
      parada(3, 3, 'en_camino'),
      parada(4, 4, 'entregado'),
    ];
    expect(progresoRuta(paradas)).toEqual({ entregadas: 2, total: 4 });
  });

  it('reporta ruta completa cuando todas están entregadas', () => {
    const paradas = [parada(1, 1, 'entregado'), parada(2, 2, 'entregado')];
    expect(progresoRuta(paradas)).toEqual({ entregadas: 2, total: 2 });
  });
});

describe('proximaParadaPendiente', () => {
  it('devuelve null sin paradas', () => {
    expect(proximaParadaPendiente([])).toBeNull();
  });

  it('devuelve null cuando ya se entregaron todas', () => {
    const paradas = [parada(1, 1, 'entregado'), parada(2, 2, 'entregado')];
    expect(proximaParadaPendiente(paradas)).toBeNull();
  });

  it('devuelve la primera pendiente en orden, no en orden de llegada del array', () => {
    // Llegan del server en orden 2, 1, 3 — la "próxima" debe ser por `orden`, no por posición.
    const paradas = [
      parada(20, 2, 'pendiente'),
      parada(10, 1, 'entregado'),
      parada(30, 3, 'pendiente'),
    ];
    expect(proximaParadaPendiente(paradas)?.id).toBe(20);
  });

  it('salta las ya entregadas aunque estén primero en el orden', () => {
    const paradas = [
      parada(10, 1, 'entregado'),
      parada(20, 2, 'entregado'),
      parada(30, 3, 'pendiente'),
    ];
    expect(proximaParadaPendiente(paradas)?.id).toBe(30);
  });

  it('no muta el arreglo original', () => {
    const paradas = [parada(20, 2, 'pendiente'), parada(10, 1, 'pendiente')];
    const copia = [...paradas];
    proximaParadaPendiente(paradas);
    expect(paradas).toEqual(copia);
  });
});
