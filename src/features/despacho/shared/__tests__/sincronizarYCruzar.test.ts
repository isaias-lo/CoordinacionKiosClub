import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sincronizarYCruzar } from '../avisarCruce';

// ── LO QUE PASÓ EL 05/10/2026 ──────────────────────────────────────────────────────────────────
//
// Nacional registró a las 16:04. RM/Costa no alcanzó, y al otro día a las 06:53 el coordinador
// apretó el botón de la advertencia «no registraste el 05/10». Las 157 filas de RM entraron bien a
// la base —142 con peso, 32 tiendas— y la hoja CRUCE PESOS siguió mostrando las 8 tiendas de
// Nacional con su peso y TODAS las de RM/Costa en blanco.
//
// El dato estaba. Nadie volvió a mirarlo: registrar son TRES pasos —escribir la planilla, volcar la
// hoja a la base y rehacer el cruce— y ese botón hacía solo el primero.
//
// La cadena de los otros dos estaba copiada CUATRO veces. Ahora vive en `sincronizarYCruzar`.
//
// Se prueba por la FRONTERA DE RED, no mockeando el propio módulo: las dos peticiones que salen
// son el contrato observable, y así el test no se cae si alguien reordena por dentro.

const fetchMock = vi.fn();
const llamada = (ruta: string) =>
  fetchMock.mock.calls.find(c => String(c[0]).includes(ruta)) as [string, RequestInit] | undefined;

const okCruce = { ok: true, status: 200, json: async () => ({ ok: true, agregadas: 0, actualizadas: 28 }) };

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(okCruce);
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('sincronizarYCruzar', () => {
  it('EL CASO: rehace el cruce DEL DÍA QUE SE REGISTRA, no el de hoy', async () => {
    // Es la diferencia que hacía falta para el banner: registra un día PASADO. Con hoy dejaría el
    // 05/10 igual de vacío y de paso tocaría el 06/10 sin motivo.
    await sincronizarYCruzar('2026-10-05');
    const cruce = llamada('/api/cruce-pesos');
    expect(cruce).toBeDefined();
    expect(JSON.parse(String(cruce![1].body))).toEqual({ fecha: '2026-10-05' });
  });

  it('vuelca la hoja a la base con ESE mismo día', async () => {
    await sincronizarYCruzar('2026-10-05');
    const sync = llamada('/api/sync-despacho');
    expect(sync).toBeDefined();
    expect(JSON.parse(String(sync![1].body))).toEqual({ dia: '2026-10-05' });
  });

  it('salen las DOS, una sola vez cada una', async () => {
    await sincronizarYCruzar('2026-10-05');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('usa keepalive: el registro no se pierde si la persona navega enseguida', async () => {
    await sincronizarYCruzar('2026-10-05');
    expect(llamada('/api/sync-despacho')![1].keepalive).toBe(true);
    expect(llamada('/api/cruce-pesos')![1].keepalive).toBe(true);
  });

  it('el cruce NO espera al sync: arranca con él, no detrás', async () => {
    // El cruce lee `despacho_*`, donde el espejo de `sheets-write` ya dejó los pesos. Si esperara
    // al sync, una caída del sync dejaría la hoja sin actualizar por nada.
    let syncResuelto = false;
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('sync-despacho')) {
        return new Promise(r => setTimeout(() => { syncResuelto = true; r(okCruce); }, 20));
      }
      expect(syncResuelto).toBe(false);   // el cruce ya salió y el sync sigue en vuelo
      return Promise.resolve(okCruce);
    });
    await sincronizarYCruzar('2026-10-05');
    expect(llamada('/api/cruce-pesos')).toBeDefined();
  });

  it('si el SYNC falla, el cruce igual se hace y no se propaga el error', async () => {
    // El sync alimenta el panel de Inicio; el cruce es lo que mira Jefatura. Que caiga uno no
    // puede llevarse al otro.
    fetchMock.mockImplementation((url: string) =>
      String(url).includes('sync-despacho') ? Promise.reject(new Error('red caída')) : Promise.resolve(okCruce));
    await expect(sincronizarYCruzar('2026-10-05')).resolves.toBeNull();
    expect(llamada('/api/cruce-pesos')).toBeDefined();
  });

  it('si el CRUCE falla, devuelve el aviso — el registro no se deshace', async () => {
    fetchMock.mockImplementation((url: string) =>
      String(url).includes('cruce-pesos')
        ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        : Promise.resolve(okCruce));
    const aviso = await sincronizarYCruzar('2026-10-05');
    expect(aviso).toBeTruthy();
    expect(String(aviso)).toContain('CRUCE');
  });

  it('sin fallos devuelve null: el silencio es la respuesta correcta', async () => {
    await expect(sincronizarYCruzar('2026-10-05')).resolves.toBeNull();
  });
});
