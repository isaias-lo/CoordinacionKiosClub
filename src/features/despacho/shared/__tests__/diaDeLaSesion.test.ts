import { describe, it, expect } from 'vitest';
import { laSesionQuedoEnOtroDia, avisoDeDiaViejo, diaCorto } from '../diaDeLaSesion';

// ── EL CASO DEL LUNES 12/10/2026 ──────────────────────────────────────────────────────────────
//
// En Manual/Cal de Bodega, filtrando Regiones, aparecieron 14 tiendas. Ocho eran reales —19P + 1B,
// exactamente los «PESADOS: 20 de 20» de la pantalla— y SEIS no tenían una sola unidad en la
// balanza ese día: 24SPP 1P · 27MCH 4P·2B · 31TLC 3P · 36CHL 3P·2B · 38SP2 3P · 46TRE 5P·2B.
//
// 19 pallets y 6 bultos fantasma, que calzan tienda por tienda con la carga del VIERNES 9. Una
// pestaña abierta desde el viernes escribía los ítems del viernes con la fecha del lunes.

describe('laSesionQuedoEnOtroDia', () => {
  it('EL CASO: la pantalla se abrió el viernes y hoy es lunes', () => {
    expect(laSesionQuedoEnOtroDia('2026-10-09', '2026-10-12')).toBe(true);
  });

  it('el mismo día no avisa nada', () => {
    expect(laSesionQuedoEnOtroDia('2026-10-12', '2026-10-12')).toBe(false);
  });

  it('también atrapa el cruce de una sola medianoche', () => {
    // El caso más común no es el fin de semana: es la pantalla que queda abierta toda la noche.
    expect(laSesionQuedoEnOtroDia('2026-10-11', '2026-10-12')).toBe(true);
  });

  it('SIN UNA FECHA VÁLIDA NO SE AVISA: inventar un aviso es peor que no darlo', () => {
    expect(laSesionQuedoEnOtroDia('', '2026-10-12')).toBe(false);
    expect(laSesionQuedoEnOtroDia(null, '2026-10-12')).toBe(false);
    expect(laSesionQuedoEnOtroDia(undefined, '2026-10-12')).toBe(false);
    expect(laSesionQuedoEnOtroDia('12/10/2026', '2026-10-12')).toBe(false);
    expect(laSesionQuedoEnOtroDia('2026-10-09', 'no-es-fecha')).toBe(false);
  });
});

describe('avisoDeDiaViejo', () => {
  it('dice LAS DOS fechas, no solo «recargá»', () => {
    // Quien lleva horas trabajando no tiene cómo saber que lo que ve es de otro día. Sin las dos
    // fechas, «recargá» no explica por qué.
    expect(avisoDeDiaViejo('2026-10-09', '2026-10-12'))
      .toBe('Esta pantalla se abrió el 09/10 y hoy es 12/10. Lo que cargues acá se guarda en el día que se abrió. Recargá para trabajar el de hoy.');
  });

  it('el mismo día, sin aviso', () => {
    expect(avisoDeDiaViejo('2026-10-12', '2026-10-12')).toBeNull();
  });

  it('sin fecha válida, sin aviso', () => {
    expect(avisoDeDiaViejo(null, '2026-10-12')).toBeNull();
  });
});

describe('diaCorto', () => {
  it('DD/MM, como lo dice la gente', () => {
    expect(diaCorto('2026-10-09')).toBe('09/10');
    expect(diaCorto('2026-01-02')).toBe('02/01');
  });

  it('sin fecha, vacío', () => {
    expect(diaCorto('')).toBe('');
    expect(diaCorto('09/10/2026')).toBe('');
  });
});
