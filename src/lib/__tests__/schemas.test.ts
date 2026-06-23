import { describe, it, expect } from 'vitest';
import { CreatePickingPalletSchema, CreateUserSchema } from '../schemas';

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
