import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/offline/resumen', () => ({ resumenOffline: async () => ({ pendientes: 0, bloqueadas: 0 }) }));

import { cookiesDeSesion } from '../cerrarSesion';

describe('cookiesDeSesion', () => {
  it('encuentra la cookie de sesión y todos sus pedazos', () => {
    const c = 'sb-abc-auth-token.0=xxx; tema=dark; sb-abc-auth-token.1=yyy; _ga=1';
    expect(cookiesDeSesion(c)).toEqual(['sb-abc-auth-token.0', 'sb-abc-auth-token.1']);
  });

  it('encuentra la cookie sin partir', () => {
    expect(cookiesDeSesion('sb-abc-auth-token=base64-xyz')).toEqual(['sb-abc-auth-token']);
  });

  it('no toca otras cookies ni falla con el texto vacío', () => {
    expect(cookiesDeSesion('tema=dark; usb-x=1')).toEqual([]);
    expect(cookiesDeSesion('')).toEqual([]);
  });
});
