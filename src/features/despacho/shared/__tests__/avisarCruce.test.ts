import { describe, it, expect } from 'vitest';
import { mensajeDeFalloDelCruce, leerResultadoDelCruce, AVISO_CRUCE } from '../avisarCruce';

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
