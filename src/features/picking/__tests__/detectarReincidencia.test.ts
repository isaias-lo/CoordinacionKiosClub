import { describe, it, expect } from 'vitest';
import { detectarReincidencia, type PickingEvento } from '../picking-utils';

let nextId = 1;
function ev(p: Partial<PickingEvento> & { event_type: 'crear' | 'eliminar'; pallet_id: number; created_at: string }): PickingEvento {
  return {
    id:           nextId++,
    date:         '2026-06-16',
    state_key:    '02SC__picker 5',
    store_cod:    '02SC',
    tipo:         'P',
    picker_label: 'Picker 5',
    actor_name:   'Supervisor A',
    ...p,
  };
}

describe('detectarReincidencia', () => {
  it('empareja crear + eliminar del mismo pallet dentro de la ventana', () => {
    const eventos = [
      ev({ event_type: 'crear',    pallet_id: 42, created_at: '2026-06-16T10:00:00Z' }),
      ev({ event_type: 'eliminar', pallet_id: 42, created_at: '2026-06-16T10:05:00Z' }),
    ];
    const { pares, porSupervisor } = detectarReincidencia(eventos);
    expect(pares).toHaveLength(1);
    expect(pares[0].pallet_id).toBe(42);
    expect(porSupervisor['Supervisor A']).toBe(1);
  });

  it('NO empareja si la eliminación ocurre fuera de la ventana', () => {
    const eventos = [
      ev({ event_type: 'crear',    pallet_id: 7, created_at: '2026-06-16T10:00:00Z' }),
      ev({ event_type: 'eliminar', pallet_id: 7, created_at: '2026-06-16T11:00:00Z' }), // +60 min
    ];
    expect(detectarReincidencia(eventos, 30).pares).toHaveLength(0);
  });

  it('cuenta varias reincidencias por supervisor', () => {
    const eventos = [
      ev({ event_type: 'crear',    pallet_id: 1, created_at: '2026-06-16T10:00:00Z' }),
      ev({ event_type: 'eliminar', pallet_id: 1, created_at: '2026-06-16T10:02:00Z' }),
      ev({ event_type: 'crear',    pallet_id: 2, created_at: '2026-06-16T10:10:00Z' }),
      ev({ event_type: 'eliminar', pallet_id: 2, created_at: '2026-06-16T10:11:00Z' }),
    ];
    expect(detectarReincidencia(eventos).porSupervisor['Supervisor A']).toBe(2);
  });

  it('ignora pallets que solo se crearon (sin borrar)', () => {
    const eventos = [ev({ event_type: 'crear', pallet_id: 99, created_at: '2026-06-16T10:00:00Z' })];
    expect(detectarReincidencia(eventos).pares).toHaveLength(0);
  });

  it('registra quién borró aunque sea distinto de quién creó', () => {
    const eventos = [
      ev({ event_type: 'crear',    pallet_id: 5, created_at: '2026-06-16T10:00:00Z', actor_name: 'Supervisor A' }),
      ev({ event_type: 'eliminar', pallet_id: 5, created_at: '2026-06-16T10:03:00Z', actor_name: 'Supervisor B' }),
    ];
    const { pares, porSupervisor } = detectarReincidencia(eventos);
    expect(pares[0].actor_name).toBe('Supervisor A');   // atribuido a quien creó
    expect(pares[0].borrado_por).toBe('Supervisor B');
    expect(porSupervisor['Supervisor A']).toBe(1);
  });

  it('ignora eventos sin pallet_id', () => {
    const eventos = [
      { ...ev({ event_type: 'crear', pallet_id: 0, created_at: '2026-06-16T10:00:00Z' }), pallet_id: null },
    ];
    expect(detectarReincidencia(eventos).pares).toHaveLength(0);
  });
});
