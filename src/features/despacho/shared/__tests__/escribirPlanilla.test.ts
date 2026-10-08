import { describe, it, expect, vi } from 'vitest';
import { escribirPlanilla, avisoNoRegistrado, motivoDeFalla } from '../escribirPlanilla';

const respuesta = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('escribirPlanilla: un registro que no llegó a la hoja no se da por hecho', () => {
  it('resuelve con los errores de la copia en la base cuando la hoja sí se escribió', async () => {
    const r = await escribirPlanilla({ sheet: 'DESPACHO RM', rows: [[1]] }, respuesta(200, { ok: true, mirrorErrores: ['dup'] }));
    expect(r.mirrorErrores).toEqual(['dup']);
  });

  it('rechaza con la sesión vencida (401), que antes pasaba por registrado', async () => {
    await expect(escribirPlanilla({}, respuesta(401, { error: 'No autorizado' })))
      .rejects.toThrow('la sesión venció');
  });

  it('rechaza con el motivo del servidor en un 500', async () => {
    await expect(escribirPlanilla({}, respuesta(500, { error: 'Quota exceeded' })))
      .rejects.toThrow('Quota exceeded');
  });

  it('rechaza sin red', async () => {
    const sinRed = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const e = await escribirPlanilla({}, sinRed).catch(x => x);
    expect(avisoNoRegistrado(e)).toBe('No se registró (sin conexión). Reintenta');
  });

  it('un error sin cuerpo dice el código', () => {
    expect(motivoDeFalla(502)).toBe('error 502 del servidor');
  });
});
