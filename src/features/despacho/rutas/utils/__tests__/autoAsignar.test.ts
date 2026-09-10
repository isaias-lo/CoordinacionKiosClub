import { describe, it, expect } from 'vitest';
import {
  leerFlagAuto, escribirFlagAuto, puedeCambiarAuto, motivoBloqueoAuto, CLAVE_AUTO,
} from '../autoAsignar';

describe('leerFlagAuto', () => {
  it('sin fila todavía queda ON — el día del deploy nada cambia solo', () => {
    expect(leerFlagAuto(undefined)).toBe(true);
    expect(leerFlagAuto(null)).toBe(true);
    expect(leerFlagAuto({})).toBe(true);
    expect(leerFlagAuto({ odoo_activo: 'false' })).toBe(true); // otra clave no lo apaga
  });

  it("solo 'false' apaga", () => {
    expect(leerFlagAuto({ [CLAVE_AUTO]: 'false' })).toBe(false);
    expect(leerFlagAuto({ [CLAVE_AUTO]: 'FALSE' })).toBe(false);
    expect(leerFlagAuto({ [CLAVE_AUTO]: '  false  ' })).toBe(false);
  });

  it('true y cualquier basura caen en ON, que es el lado seguro', () => {
    // Peor caso: el sistema sigue ayudando, que es lo que hacía ayer.
    for (const v of ['true', '', '1', '0', 'sí', 'off', 'undefined']) {
      expect(leerFlagAuto({ [CLAVE_AUTO]: v })).toBe(true);
    }
  });

  it('ida y vuelta con escribirFlagAuto', () => {
    for (const v of [true, false]) {
      expect(leerFlagAuto({ [CLAVE_AUTO]: escribirFlagAuto(v) })).toBe(v);
    }
  });
});

describe('puedeCambiarAuto', () => {
  it('admin sí', () => {
    expect(puedeCambiarAuto('admin')).toBe(true);
    expect(puedeCambiarAuto('  ADMIN  ')).toBe(true);
  });

  // Los roles reales de la base hoy: admin(5), auditor(3), despachador(1), pending(6).
  it('el resto no, incluido despachador', () => {
    for (const rol of ['despachador', 'auditor', 'pending', 'admin-auditoria', '', null, undefined]) {
      expect(puedeCambiarAuto(rol)).toBe(false);
    }
  });
});

describe('motivoBloqueoAuto', () => {
  it('a un admin no le da motivo, porque no está bloqueado', () => {
    expect(motivoBloqueoAuto('admin')).toBeNull();
  });

  it('a los demás les explica por qué, no solo que no pueden', () => {
    const m = motivoBloqueoAuto('despachador');
    expect(m).toBeTruthy();
    expect(m).toContain('administrador');
    // Que diga que es compartido: sin eso parece un permiso arbitrario.
    expect(m).toContain('compartido');
  });
});
