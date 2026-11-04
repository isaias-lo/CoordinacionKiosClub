import { describe, it, expect } from 'vitest';
import { fotosACapturar, type PickingParaFoto } from '../fotoAsignacion';

const AHORA = new Date('2026-11-04T14:00:00Z');
const HOY = '2026-11-04';

function pick(p: Partial<PickingParaFoto> = {}): PickingParaFoto {
  return {
    name: '99REC/DT/146059', origin: 'Abastecimiento Comida 27MCH 04/11/2026',
    state: 'assigned', toLocation: '', partner: '',
    lineTotal: 134, responsible: 'Pickers 1',
    assignedAt: '2026-11-04 11:51:12', dateDone: null, ...p,
  };
}
const nada = new Set<string>();

describe('fotosACapturar: qué se guarda', () => {
  it('guarda un movimiento asignado con su número y su picker', () => {
    const [f] = fotosACapturar([pick()], HOY, nada, AHORA);
    expect(f.ref).toBe('99REC/DT/146059');
    expect(f.cod).toBe('27MCH');
    expect(f.seccion).toBe('Comida');
    expect(f.registros_odoo).toBe(134);
    expect(f.picker_odoo).toBe('Pickers 1');
    expect(f.asignado_en).toBe('2026-11-04 11:51:12');
    expect(f.fecha).toBe(HOY);
  });

  it('canoniza la Ñ, como todo lo demás de la planilla', () => {
    const [f] = fotosACapturar(
      [pick({ origin: 'Abastecimiento Aseo 23PEN 04/11/2026' })], HOY, nada, AHORA);
    expect(f.cod).toBe('23PEÑ');
  });
});

describe('fotosACapturar: qué NO se guarda', () => {
  it('un movimiento ya validado no se fotografía: su número ya bajó', () => {
    // Guardarlo bajo una columna que dice «al asignar» sería escribir algo que no es cierto.
    expect(fotosACapturar([pick({ state: 'done' })], HOY, nada, AHORA)).toHaveLength(0);
  });

  it('un anulado tampoco', () => {
    expect(fotosACapturar([pick({ state: 'cancel' })], HOY, nada, AHORA)).toHaveLength(0);
  });

  it('sin hora de asignación no hay nada que capturar', () => {
    expect(fotosACapturar([pick({ assignedAt: null })], HOY, nada, AHORA)).toHaveLength(0);
  });

  it('no vuelve a fotografiar lo que ya tiene fila: la foto es de la primera vez', () => {
    const ya = new Set(['99REC/DT/146059']);
    expect(fotosACapturar([pick()], HOY, ya, AHORA)).toHaveLength(0);
  });

  it('Congelados tiene su propia pestaña y no entra en esta hoja', () => {
    expect(fotosACapturar(
      [pick({ origin: 'Abastecimiento Congelados 01TPS 04/11/2026' })], HOY, nada, AHORA),
    ).toHaveLength(0);
  });

  it('un origin que no se puede leer se descarta en vez de inventar', () => {
    expect(fotosACapturar(
      [pick({ origin: 'Merma Abastecimiento 14PF/INT/02745' })], HOY, nada, AHORA),
    ).toHaveLength(0);
  });
});

describe('fotosACapturar: la tanda', () => {
  it('captura solo los asignados de una mezcla', () => {
    const out = fotosACapturar([
      pick({ name: 'A', state: 'assigned' }),
      pick({ name: 'B', state: 'done' }),
      pick({ name: 'C', state: 'assigned', assignedAt: null }),
      pick({ name: 'D', state: 'assigned' }),
    ], HOY, nada, AHORA);
    expect(out.map(f => f.ref)).toEqual(['A', 'D']);
  });

  it('todas las de una tanda llevan el mismo instante de captura', () => {
    const out = fotosACapturar(
      [pick({ name: 'A' }), pick({ name: 'B' })], HOY, nada, AHORA);
    expect(out[0].capturado_en).toBe(out[1].capturado_en);
    expect(out[0].capturado_en).toBe('2026-11-04T14:00:00.000Z');
  });
});
