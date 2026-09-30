import { describe, it, expect } from 'vitest';
import { mensajeDeFalloDelCruce } from '../avisarCruce';

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
