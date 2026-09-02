import { describe, it, expect, vi, beforeEach } from 'vitest';

// Builder encadenable de Supabase mockeado: captura upsert y la cadena delete().eq().eq().in().
const h = vi.hoisted(() => {
  const inFn   = vi.fn().mockResolvedValue({ error: null });
  const eq2    = vi.fn(() => ({ in: inFn }));
  const eq1    = vi.fn(() => ({ eq: eq2 }));
  const del    = vi.fn(() => ({ eq: eq1 }));
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from   = vi.fn(() => ({ upsert, delete: del }));
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  return { inFn, eq2, eq1, del, upsert, from, getSession };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: h.getSession }, from: h.from },
}));

import { pushCounts } from '../despachoSesion';

beforeEach(() => {
  vi.clearAllMocks();
  h.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  h.upsert.mockResolvedValue({ error: null });
  h.inFn.mockResolvedValue({ error: null });
});

describe('pushCounts', () => {
  it('upserta las tiendas cargadas con su fuente', async () => {
    await pushCounts('regiones', {
      '39PSB': { p: 1, b: 1, c: 0, ch: 0 },
      '53VAL': { p: 1, b: 0, c: 0, ch: 0 },
    });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    const rows = h.upsert.mock.calls[0][0] as Array<{ tienda_cod: string; fuente: string; pallets: number }>;
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.tienda_cod)).toEqual(['39PSB', '53VAL']);
    expect(rows.every(r => r.fuente === 'regiones')).toBe(true);
  });

  it('borra SOLO las tiendas que este cliente conoce y quedaron sin carga', async () => {
    await pushCounts(
      'regiones',
      { '39PSB': { p: 1, b: 1, c: 0, ch: 0 }, '53VAL': { p: 1, b: 0, c: 0, ch: 0 } },
      ['39PSB', '53VAL', '27MCH'], // 27MCH está en pantalla pero ya sin carga
    );
    expect(h.del).toHaveBeenCalledTimes(1);
    expect(h.eq1).toHaveBeenCalledWith('fecha', expect.any(String));
    expect(h.eq2).toHaveBeenCalledWith('fuente', 'regiones');
    expect(h.inFn).toHaveBeenCalledWith('tienda_cod', ['27MCH']);
  });

  // [P5] El bug: un usuario recién entrado (estado parcial) borraba las tiendas de sus compañeros.
  it('sin `conocidas` NO borra nada — solo upserta', async () => {
    await pushCounts('regiones', { '39PSB': { p: 1, b: 0, c: 0, ch: 0 } });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.del).not.toHaveBeenCalled();
  });

  it('no borra tiendas ajenas: las que no están en `conocidas` quedan intactas', async () => {
    await pushCounts('regiones', { '39PSB': { p: 1, b: 0, c: 0, ch: 0 } }, ['39PSB']);
    // 53VAL la cargó otra persona y este cliente ni la vio → no se toca.
    expect(h.del).not.toHaveBeenCalled();
  });

  it('guarda anti-wipe: sin tiendas cargadas NO toca la tabla', async () => {
    await pushCounts('regiones', {});
    expect(h.from).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it('sin sesión no escribe nada', async () => {
    h.getSession.mockResolvedValueOnce({ data: { session: null } });
    await pushCounts('regiones', { '39PSB': { p: 1, b: 0, c: 0, ch: 0 } });
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it('separa por fuente: Santiago solo borra filas santiago', async () => {
    await pushCounts('santiago', { '32BNV': { p: 2, b: 0, c: 0, ch: 0 } }, ['32BNV', '18FLO']);
    expect(h.eq2).toHaveBeenCalledWith('fuente', 'santiago');
    expect(h.inFn).toHaveBeenCalledWith('tienda_cod', ['18FLO']);
  });
});
