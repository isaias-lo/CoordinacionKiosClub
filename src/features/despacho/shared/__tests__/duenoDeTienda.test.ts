import { describe, it, expect } from 'vitest';
import { espejoDeTienda, esDeOtroEspejo, avisoDeOtroEspejo, NOMBRE_ESPEJO } from '../duenoDeTienda';

// El test que importa: las 7 tiendas que el 01/10/2026 quedaron registradas en los DOS espejos.
const DE_REGIONES = new Set(['28TEM', '47PTV', '50PTM', '53VAL', '57CAS', '75PUC', '76PAN', '60PBL']);
const esDeRegiones = (cod: string) => DE_REGIONES.has(cod);

describe('espejoDeTienda', () => {
  it('una tienda de Regiones es de Nacional', () => {
    expect(espejoDeTienda('47PTV', esDeRegiones)).toBe('nacional');
  });

  it('cualquier otra es de RM/Costa', () => {
    expect(espejoDeTienda('12LAS', esDeRegiones)).toBe('rmcosta');
  });

  it('normaliza el código antes de preguntar', () => {
    expect(espejoDeTienda('  47ptv  ', esDeRegiones)).toBe('nacional');
  });
});

describe('esDeOtroEspejo', () => {
  it('RM/Costa NO puede abrir una tienda de Nacional — el bug del 01/10', () => {
    for (const cod of ['28TEM', '47PTV', '50PTM', '53VAL', '57CAS', '75PUC', '76PAN']) {
      expect(esDeOtroEspejo(cod, 'rmcosta', esDeRegiones)).toBe(true);
    }
  });

  it('60PBL también: es de Regiones aunque no esté en el catálogo curado', () => {
    expect(esDeOtroEspejo('60PBL', 'rmcosta', esDeRegiones)).toBe(true);
  });

  it('Nacional NO puede abrir una tienda de RM/Costa', () => {
    expect(esDeOtroEspejo('12LAS', 'nacional', esDeRegiones)).toBe(true);
  });

  it('cada espejo SÍ puede abrir las suyas', () => {
    expect(esDeOtroEspejo('12LAS', 'rmcosta',  esDeRegiones)).toBe(false);
    expect(esDeOtroEspejo('47PTV', 'nacional', esDeRegiones)).toBe(false);
  });

  it('sin código no bloquea: no hay con qué decidir y trabar el salto sería peor', () => {
    expect(esDeOtroEspejo('',    'rmcosta', esDeRegiones)).toBe(false);
    expect(esDeOtroEspejo('   ', 'rmcosta', esDeRegiones)).toBe(false);
  });

  it('con el catálogo SIN hidratar, una tienda de Config pasa — por eso hay que hidratarlo', () => {
    const soloCurado = (cod: string) => cod === '47PTV';
    expect(esDeOtroEspejo('60PBL', 'rmcosta', soloCurado)).toBe(false);
  });
});

describe('avisoDeOtroEspejo', () => {
  it('dice DÓNDE se pesa, no solo que acá no', () => {
    expect(avisoDeOtroEspejo('47PTV', 'nacional')).toContain('47PTV');
    expect(avisoDeOtroEspejo('47PTV', 'nacional')).toContain(NOMBRE_ESPEJO.nacional);
  });

  it('normaliza el código que muestra', () => {
    expect(avisoDeOtroEspejo(' 47ptv ', 'nacional')).toContain('47PTV');
  });
});
