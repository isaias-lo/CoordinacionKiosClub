import { describe, it, expect } from 'vitest';
import { faseEnrutador } from '../faseEnrutador';

const base = { poolCount: 0, asignadasCount: 0, camionesConAsig: 0, cerradasCount: 0, diaCerrado: false };

describe('faseEnrutador', () => {
  it('sin pool → Esperando Bodega (step 1)', () => {
    expect(faseEnrutador(base)).toMatchObject({ step: 1, titulo: 'Esperando Bodega' });
  });
  it('pool sin asignar → Pool listo (step 1)', () => {
    expect(faseEnrutador({ ...base, poolCount: 10 })).toMatchObject({ step: 1, titulo: 'Pool listo' });
  });
  it('asignación parcial → Asignando (step 2)', () => {
    expect(faseEnrutador({ ...base, poolCount: 10, asignadasCount: 6, camionesConAsig: 2 }))
      .toMatchObject({ step: 2, titulo: 'Asignando' });
  });
  it('todo asignado, sin cerrar → Listo para registrar (step 3)', () => {
    expect(faseEnrutador({ ...base, poolCount: 10, asignadasCount: 10, camionesConAsig: 3 }))
      .toMatchObject({ step: 3, titulo: 'Listo para registrar' });
  });
  it('algunos camiones cerrados → Registrando (step 4)', () => {
    expect(faseEnrutador({ ...base, poolCount: 10, asignadasCount: 10, camionesConAsig: 3, cerradasCount: 1 }))
      .toMatchObject({ step: 4, titulo: 'Registrando', detalle: '1/3 camiones cerrados' });
  });
  it('todos los camiones cerrados → Registrado (step 5)', () => {
    expect(faseEnrutador({ ...base, poolCount: 10, asignadasCount: 10, camionesConAsig: 3, cerradasCount: 3 }))
      .toMatchObject({ step: 5, titulo: 'Registrado' });
  });
  it('día cerrado → Día terminado (step 5), prioritario', () => {
    expect(faseEnrutador({ ...base, poolCount: 10, asignadasCount: 10, camionesConAsig: 3, diaCerrado: true }))
      .toMatchObject({ step: 5, titulo: 'Día terminado' });
  });
});
