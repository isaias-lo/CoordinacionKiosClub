import { describe, it, expect } from 'vitest';
import { subtipoDeOrigin } from '../origenAuditoria';

describe('subtipoDeOrigin · lo que ya funcionaba', () => {
  it('un abastecimiento normal', () => {
    expect(subtipoDeOrigin('Abastecimiento Comida 05LP 30/10/2026')).toBe('comida');
    expect(subtipoDeOrigin('Abastecimiento Aseo 26ALC 30/10/2026')).toBe('aseo');
    expect(subtipoDeOrigin('Abastecimiento Hogar 07CCR 30/10/2026')).toBe('hogar');
  });

  it('lo que la auditoría NO cubre sigue sin cubrirse', () => {
    // Chocolates y congelados no se auditan por acá: no tienen casilla que rellenar.
    expect(subtipoDeOrigin('Abastecimiento Chocolates 38SP2 30/10/2026')).toBeNull();
    expect(subtipoDeOrigin('Abastecimiento Congelados 33CON 30/10/2026')).toBeNull();
  });
});

describe('subtipoDeOrigin · EL TERCER SITIO del mismo agujero', () => {
  it('una apertura también se reconoce', () => {
    // Se buscaba 'Abastecimiento Comida' con las dos palabras pegadas; una apertura tiene
    // «Apertura» en medio y el formulario quedaba sin su código de operación.
    expect(subtipoDeOrigin('Abastecimiento Apertura Comida 7 - 62PLD 30/10/2026')).toBe('comida');
    expect(subtipoDeOrigin('Abastecimiento Apertura Aseo 2 - 62PLD 30/10/2026')).toBe('aseo');
    expect(subtipoDeOrigin('Abastecimiento Apertura Hogar 1 - 62PLD 30/10/2026')).toBe('hogar');
  });

  it('y una apertura de chocolates sigue sin auditarse, igual que la normal', () => {
    expect(subtipoDeOrigin('Abastecimiento Apertura Chocolates 2 - 62PLD 30/10/2026')).toBeNull();
  });
});

describe('subtipoDeOrigin · no se cae con nada', () => {
  it('vacío, nulo o cualquier cosa', () => {
    for (const x of [null, undefined, '', '   ', 'cualquier cosa', 'AUDITORIA 39PSB']) {
      expect(subtipoDeOrigin(x)).toBeNull();
    }
  });
});
