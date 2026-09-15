import { describe, it, expect } from 'vitest';
import { CreatePickingPalletSchema, CreateUserSchema, CreateTiendaSchema } from '../schemas';

// ─── CreatePickingPalletSchema ────────────────────────────────────────────────

describe('CreatePickingPalletSchema', () => {
  const valid = {
    date: '2025-06-12',
    store_cod: 'LAS',
    state_key: 'LAS__Picker 1',
    picker_label: 'Picker 1',
    tipo: 'P' as const,
  };

  it('accepts a minimal valid payload', () => {
    const result = CreatePickingPalletSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('accepts all valid tipo values', () => {
    for (const tipo of ['P', 'B', 'C', 'CH', 'otro'] as const) {
      const r = CreatePickingPalletSchema.safeParse({ ...valid, tipo });
      expect(r.success, `tipo=${tipo} should be valid`).toBe(true);
    }
  });

  it('rejects invalid tipo', () => {
    const result = CreatePickingPalletSchema.safeParse({ ...valid, tipo: 'X' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed date', () => {
    const result = CreatePickingPalletSchema.safeParse({ ...valid, date: '12-06-2025' });
    expect(result.success).toBe(false);
  });

  it('rejects non-date string', () => {
    const result = CreatePickingPalletSchema.safeParse({ ...valid, date: 'today' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid store_cod (lowercase)', () => {
    const result = CreatePickingPalletSchema.safeParse({ ...valid, store_cod: 'las' });
    expect(result.success).toBe(false);
  });

  it('rejects empty state_key', () => {
    const result = CreatePickingPalletSchema.safeParse({ ...valid, state_key: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty picker_label', () => {
    const result = CreatePickingPalletSchema.safeParse({ ...valid, picker_label: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid client_op_id (uuid) and actor_name', () => {
    const r = CreatePickingPalletSchema.safeParse({
      ...valid, client_op_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', actor_name: 'Luis Cortez',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a malformed client_op_id', () => {
    const r = CreatePickingPalletSchema.safeParse({ ...valid, client_op_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('client_op_id and actor_name are optional', () => {
    expect(CreatePickingPalletSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional contenido and refs', () => {
    const result = CreatePickingPalletSchema.safeParse({
      ...valid,
      contenido: 'comida',
      refs: 'OP/2025/0001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts explicit null for contenido/section/refs/actor_name (no solo ausentes)', () => {
    // El caller real (addPalletSlot en PickingScreen) manda `section: null` cuando el grupo
    // es mixto ("Todas") — .optional() por sí solo rechaza null (solo tolera el campo
    // ausente), así que esto daba 400 antes de este fix.
    const result = CreatePickingPalletSchema.safeParse({
      ...valid, contenido: null, section: null, refs: null, actor_name: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects contenido longer than 50 chars', () => {
    const result = CreatePickingPalletSchema.safeParse({
      ...valid,
      contenido: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('accepts numeric-prefixed store codes like 29CFL or 01VIT', () => {
    for (const cod of ['29CFL', '01VIT', 'LAS', 'LAS1']) {
      const r = CreatePickingPalletSchema.safeParse({ ...valid, store_cod: cod });
      expect(r.success, `store_cod=${cod} should be valid`).toBe(true);
    }
  });

  it('accepts store codes with Ñ (canónico, ej. 23PEÑ)', () => {
    const r = CreatePickingPalletSchema.safeParse({ ...valid, store_cod: '23PEÑ' });
    expect(r.success).toBe(true);
  });
});

// ─── CreateUserSchema ─────────────────────────────────────────────────────────

describe('CreateUserSchema', () => {
  const valid = {
    email: 'user@example.com',
    password: 'securepass123',
    full_name: 'Test User',
    role: 'despachador',
  };

  it('accepts valid user data', () => {
    expect(CreateUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = CreateUserSchema.safeParse({ ...valid, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = CreateUserSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects role with uppercase (format: lowercase, numbers, dashes only)', () => {
    const result = CreateUserSchema.safeParse({ ...valid, role: 'Admin' });
    expect(result.success).toBe(false);
  });

  it('accepts custom role ids with dashes', () => {
    const result = CreateUserSchema.safeParse({ ...valid, role: 'admin-auditoria' });
    expect(result.success).toBe(true);
  });
});

describe('CreateTiendaSchema — los campos vacíos llegan como null, no undefined', () => {
  const base = { codigo: 'GD', nombre: 'Golden' };

  it('el caso real de GD: los 5 campos de Sendu en null ya no rompen el guardado', () => {
    // "region_sendu: Invalid input; comuna: Invalid input; calle: Invalid input…" sin haber
    // tocado esos campos: la fila los tenía NULL y `.optional()` solo acepta undefined.
    const r = CreateTiendaSchema.safeParse({
      ...base, region_sendu: null, comuna: null, calle: null, numero: null, complemento: null,
    });
    expect(r.success).toBe(true);
  });

  it('acepta null en cualquier campo de texto opcional', () => {
    const r = CreateTiendaSchema.safeParse({
      ...base, direccion: null, region: null, sector_comuna: null, corredor: null,
      tipo: null, ventana: null, frecuencia: null, correos: null, transportista: null,
    });
    expect(r.success).toBe(true);
  });

  it('sigue aceptando undefined y texto', () => {
    expect(CreateTiendaSchema.safeParse(base).success).toBe(true);
    expect(CreateTiendaSchema.safeParse({ ...base, ventana: '11:00 - 12:00' }).success).toBe(true);
  });

  it('lo que YA era inválido lo sigue siendo: null no es una excusa para no validar', () => {
    expect(CreateTiendaSchema.safeParse({ ...base, ventana: 'x'.repeat(51) }).success).toBe(false);
    expect(CreateTiendaSchema.safeParse({ codigo: 'GD' }).success).toBe(false);          // sin nombre
    expect(CreateTiendaSchema.safeParse({ ...base, nombre: null }).success).toBe(false); // nombre es obligatorio
  });

  it('"GD" es un código válido: 2 letras entran en el patrón', () => {
    expect(CreateTiendaSchema.safeParse(base).success).toBe(true);
  });
});
