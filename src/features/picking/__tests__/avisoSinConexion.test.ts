import { describe, it, expect } from 'vitest';
import { textoSinConexion } from '../avisoSinConexion';

describe('textoSinConexion', () => {
  it('no dice que se pierde lo que sí queda en la cola', () => {
    expect(textoSinConexion(0)).not.toMatch(/no se están guardando/);
    expect(textoSinConexion(0)).toMatch(/se envían al volver la señal/);
  });

  it('cuenta lo que espera señal', () => {
    expect(textoSinConexion(1)).toMatch(/· 1 pendiente$/);
    expect(textoSinConexion(3)).toMatch(/· 3 pendientes$/);
  });
});
