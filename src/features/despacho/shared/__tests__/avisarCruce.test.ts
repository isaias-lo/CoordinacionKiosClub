import { describe, it, expect } from 'vitest';
import { mensajeDeFalloDelCruce, leerResultadoDelCruce, AVISO_CRUCE, traerOdooDelDia, escribirCruceDelDia, resumenDeCruce } from '../avisarCruce';

describe('mensajeDeFalloDelCruce — que el fallo deje de ser invisible', () => {
  it('avisa cuando el cruce falló', () => {
    // El 29/09 el registro de RM/Costa quedó bien en la base y la hoja se quedó vacía, sin un
    // aviso en ninguna parte. Un informe que falla en silencio es peor que no tenerlo, porque
    // se confía en él.
    const m = mensajeDeFalloDelCruce({ ok: true, cruce: { ok: false, error: 'Odoo: timeout' } });
    expect(m).not.toBeNull();
    expect(m).toContain('CRUCE PESOS');
  });

  it('el aviso deja claro que el DÍA sí quedó registrado', () => {
    // Lo peor sería que alguien lea "falló" y vuelva a registrar: el día ya está, y registrar dos
    // veces es justo lo que el sistema viene evitando.
    const m = mensajeDeFalloDelCruce({ cruce: { ok: false, error: 'x' } })!;
    expect(m).toContain('registrado');
    expect(m).toContain('no se perdió');
  });

  it('cuando sale bien no molesta', () => {
    expect(mensajeDeFalloDelCruce({ cruce: { ok: true, agregadas: 0, actualizadas: 29 } })).toBeNull();
  });

  it('sin bloque `cruce` no inventa un error', () => {
    // Pasa cuando no se pidió el cruce, o cuando responde una versión anterior del servidor.
    expect(mensajeDeFalloDelCruce({ ok: true })).toBeNull();
    expect(mensajeDeFalloDelCruce(null)).toBeNull();
    expect(mensajeDeFalloDelCruce(undefined)).toBeNull();
  });
});

// ── El silencio del 30/09/2026 ─────────────────────────────────────────────────────────────────
//
// El coordinador apretó REGISTRAR en Bodega Nacional. Los pesos llegaron a la base —5 filas,
// 1.468,5 kg— y la hoja CRUCE PESOS se quedó SIN las 21 filas del día. No apareció ningún aviso.
//
// La causa: `if (!r?.cruce) return null`. Una respuesta sin el bloque `cruce` se leía como
// "no se pidió", cuando en esa cadena SIEMPRE se pide. Todo fallo que no llegara a ejecutar el
// cruce —un 500, un deploy a medias, un fetch caído— caía en ese `null`.

describe('mensajeDeFalloDelCruce — se pidió y no vino', () => {
  it('SE PIDIÓ y la respuesta no trae el cruce: hay que avisar', () => {
    expect(mensajeDeFalloDelCruce({ ok: true }, true)).toBe(AVISO_CRUCE);
    expect(mensajeDeFalloDelCruce({}, true)).toBe(AVISO_CRUCE);
    expect(mensajeDeFalloDelCruce(null, true)).toBe(AVISO_CRUCE);
  });

  it('un 500 del servidor tampoco trae el bloque, y también avisa', () => {
    expect(mensajeDeFalloDelCruce({ ok: false } as never, true)).toBe(AVISO_CRUCE);
  });

  it('NO se pidió: no se inventa un error donde no hay información', () => {
    expect(mensajeDeFalloDelCruce({ ok: true }, false)).toBeNull();
    expect(mensajeDeFalloDelCruce({ ok: true })).toBeNull();
  });

  it('el bloque manda sobre todo lo demás', () => {
    expect(mensajeDeFalloDelCruce({ cruce: { ok: true } }, true)).toBeNull();
    expect(mensajeDeFalloDelCruce({ cruce: { ok: false, error: 'x' } }, false)).toBe(AVISO_CRUCE);
  });
});

describe('leerResultadoDelCruce — se llama SIEMPRE después de pedirlo', () => {
  const resp = (json: unknown) => ({ json: async () => json }) as unknown as Response;

  it('el fetch se cayó (no hay respuesta): avisa', async () => {
    expect(await leerResultadoDelCruce(undefined)).toBe(AVISO_CRUCE);
  });

  it('respuesta ilegible: avisa', async () => {
    const rota = { json: async () => { throw new Error('no es json'); } } as unknown as Response;
    expect(await leerResultadoDelCruce(rota)).toBe(AVISO_CRUCE);
  });

  it('respuesta sin el bloque cruce: avisa', async () => {
    expect(await leerResultadoDelCruce(resp({ ok: true, rm: 10 }))).toBe(AVISO_CRUCE);
  });

  it('el cruce se escribió: en silencio, que es lo correcto', async () => {
    expect(await leerResultadoDelCruce(resp({ cruce: { ok: true, agregadas: 21 } }))).toBeNull();
  });

  it('el cruce falló del lado del servidor: avisa', async () => {
    expect(await leerResultadoDelCruce(resp({ cruce: { ok: false, error: 'timeout' } }))).toBe(AVISO_CRUCE);
  });
});

// ── El botón «Traer Odoo del día» ──────────────────────────────────────────────────────────────
//
// «Ya es la tarde y no veo nada, al menos la parte del total de Odoo, la tienda y demás, ¿o debo
// dar clic en registrar para que esto pase?» — sí, debía. El lado de Odoo no depende de Bodega:
// existe desde temprano y no había cómo traerlo sin cerrar el día.

describe('resumenDeCruce — qué dice el botón cuando terminó', () => {
  it('cuenta las dos cosas por separado', () => {
    expect(resumenDeCruce({ aviso: null, agregadas: 21, actualizadas: 0 })).toContain('21 nuevas');
    expect(resumenDeCruce({ aviso: null, agregadas: 0, actualizadas: 30 })).toContain('30 actualizadas');
    const mixto = resumenDeCruce({ aviso: null, agregadas: 1, actualizadas: 29 });
    expect(mixto).toContain('1 nueva');
    expect(mixto).toContain('29 actualizadas');
  });

  it('singular y plural', () => {
    expect(resumenDeCruce({ aviso: null, agregadas: 1 })).toContain('1 nueva');
    expect(resumenDeCruce({ aviso: null, actualizadas: 1 })).toContain('1 actualizada');
  });

  it('cero filas NO se anuncia como éxito vacío', () => {
    // Apretar y que no pase nada es una pregunta sin responder. Si Odoo todavía no despachó, eso
    // es lo que hay que decir — no un «✓ listo» que haga pensar que la hoja quedó al día.
    expect(resumenDeCruce({ aviso: null })).toBe('Odoo no tiene movimientos para este día todavía');
    expect(resumenDeCruce({ aviso: null, agregadas: 0, actualizadas: 0 }))
      .toBe('Odoo no tiene movimientos para este día todavía');
  });
});

describe('traerOdooDelDia y escribirCruceDelDia comparten el camino', () => {
  const resp = (json: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => json }) as unknown as Response;
  const conFetch = (r: Response | Error) => {
    globalThis.fetch = (() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r))) as typeof fetch;
  };

  it('devuelve los conteos cuando salió bien', async () => {
    conFetch(resp({ ok: true, agregadas: 21, actualizadas: 0 }));
    expect(await traerOdooDelDia('2026-10-01')).toEqual({ aviso: null, agregadas: 21, actualizadas: 0 });
  });

  it('un fallo devuelve el aviso y NINGÚN conteo', async () => {
    // El fallo manda: si no se escribió, no se dice cuántas filas se tocaron.
    conFetch(resp({ error: 'timeout' }, false));
    const r = await traerOdooDelDia('2026-10-01');
    expect(r.aviso).toBe(AVISO_CRUCE);
    expect(r.agregadas).toBeUndefined();
  });

  it('el fetch caído también avisa', async () => {
    conFetch(new Error('offline'));
    expect((await traerOdooDelDia('2026-10-01')).aviso).toBe(AVISO_CRUCE);
  });

  it('el registro automático se queda solo con el aviso', async () => {
    conFetch(resp({ ok: true, agregadas: 21 }));
    expect(await escribirCruceDelDia('2026-10-01')).toBeNull();
  });
});
