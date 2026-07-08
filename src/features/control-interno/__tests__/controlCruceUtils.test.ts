import { describe, it, expect } from 'vitest';
import { resolveManualFields } from '../utils/controlCruceUtils';

describe('resolveManualFields', () => {
  it('COMPLETADO sin override manual → ACTIVIDAD REALIZADA', () => {
    expect(resolveManualFields('COMPLETADO', undefined)).toEqual({
      correcta_declaracion: 'ACTIVIDAD REALIZADA',
      movimiento_ajuste: '',
    });
  });

  it('COMPLETADO con override PENDIENTE → se ignora, vuelve a ACTIVIDAD REALIZADA', () => {
    const r = resolveManualFields('COMPLETADO', { correcta_declaracion: 'PENDIENTE' });
    expect(r.correcta_declaracion).toBe('ACTIVIDAD REALIZADA');
  });

  it('COMPLETADO con override explícito (ej: EN REVISIÓN) → respeta el override', () => {
    const r = resolveManualFields('COMPLETADO', { correcta_declaracion: 'EN REVISIÓN' });
    expect(r.correcta_declaracion).toBe('EN REVISIÓN');
  });

  it('VENCIDA sin override → PENDIENTE', () => {
    expect(resolveManualFields('VENCIDA', undefined).correcta_declaracion).toBe('PENDIENTE');
  });

  it('PLANIFICADO con override → respeta el override (incluso si es PENDIENTE)', () => {
    const r = resolveManualFields('PLANIFICADO', { correcta_declaracion: 'PENDIENTE' });
    expect(r.correcta_declaracion).toBe('PENDIENTE');
  });

  it('movimiento_ajuste usa el override manual o string vacío', () => {
    expect(resolveManualFields('COMPLETADO', { movimiento_ajuste: '99REC/INT/001' }).movimiento_ajuste)
      .toBe('99REC/INT/001');
    expect(resolveManualFields('COMPLETADO', undefined).movimiento_ajuste).toBe('');
  });
});
