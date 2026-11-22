import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// La tienda nunca clasifica ni descarta: se corta en la API aunque su pantalla no tenga los botones.

let persona: { id: string; role: string; name: string } | null = null;
let tocoLaBase = false;

vi.mock('@/lib/apiAuth', () => ({ verifyPersona: async () => persona }));
vi.mock('@/lib/supabaseServer', () => ({
  supabaseServer: () => { tocoLaBase = true; throw new Error('no debería consultar'); },
}));

const { PATCH } = await import('../solicitudes/[id]/route');
const ID = '11111111-1111-4111-8111-111111111111';
const pedir = (id: string, cuerpo: unknown) => PATCH(
  new NextRequest(`http://x/api/mantencion/solicitudes/${id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) }),
  { params: Promise.resolve({ id }) },
);

beforeEach(() => { tocoLaBase = false; });

describe('PATCH /api/mantencion/solicitudes/:id', () => {
  it('sin sesión, 401', async () => {
    persona = null;
    expect((await pedir(ID, { accion: 'descartar' })).status).toBe(401);
  });

  it('el supervisor de tienda no puede clasificar: 403 sin tocar la base', async () => {
    persona = { id: 'u', role: 'supervisor-tienda', name: 'Ingri' };
    expect((await pedir(ID, { accion: 'clasificar', urgencia: 'urgente' })).status).toBe(403);
    expect(tocoLaBase).toBe(false);
  });

  it('una acción mal formada es 400 y un id que no es uuid es 404, sin consultar', async () => {
    persona = { id: 'u', role: 'encargado-mantencion', name: 'Jesús' };
    expect((await pedir(ID, { accion: 'cerrar' })).status).toBe(400);
    expect((await pedir('abc', { accion: 'descartar' })).status).toBe(404);
    expect(tocoLaBase).toBe(false);
  });
});
