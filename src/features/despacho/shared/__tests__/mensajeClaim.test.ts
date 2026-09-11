import { describe, it, expect } from 'vitest';
import { mensajeClaim, type MotivoClaim } from '../mensajeClaim';

// 10/09/2026 15:30 en Chile (UTC-3 en septiembre).
const AHORA = new Date('2026-09-10T18:30:00Z');

describe('cada motivo da un texto distinto y accionable', () => {
  const motivos: MotivoClaim[] = ['eliminado', 'otra_tienda', 'ya_en_carga', 'no_encontrado', 'desconocido'];

  it('los 5 motivos producen mensajes distintos entre sí', () => {
    const textos = motivos.map(m => mensajeClaim(m, {
      ref: '1050', storeCod: '23PEÑ', eliminadoEn: AHORA.toISOString(), boton: '+ Choc.', ahora: AHORA,
    }));
    expect(new Set(textos).size).toBe(motivos.length);
  });

  it('ninguno deja pasar undefined ni null al texto', () => {
    for (const m of motivos) {
      const t = mensajeClaim(m, { ref: '1050', ahora: AHORA });
      expect(t).not.toMatch(/undefined|null|NaN/);
      expect(t.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('eliminado — el caso que antes mentía', () => {
  it('incluye hora y actor cuando el actor está', () => {
    const t = mensajeClaim('eliminado', {
      ref: '1050', eliminadoPor: 'Juan', eliminadoEn: '2026-09-10T13:42:00Z',
      boton: '+ Choc.', ahora: AHORA,
    });
    expect(t).toContain('#1050');
    expect(t).toContain('Juan');
    expect(t).toContain('hoy a las 10:42');
    expect(t).toContain('“+ Choc.”');
  });

  // El actor falta en el 80-94% de los borrados reales, así que este es el camino NORMAL.
  it('sin actor no escribe el hueco: pasa a voz pasiva', () => {
    const t = mensajeClaim('eliminado', {
      ref: '1050', eliminadoEn: '2026-09-10T13:42:00Z', boton: '+ Choc.', ahora: AHORA,
    });
    expect(t).toContain('fue eliminado hoy a las 10:42');
    expect(t).not.toMatch(/undefined|lo eliminó\s*\./);
  });

  it('un actor en blanco cuenta como ausente', () => {
    const t = mensajeClaim('eliminado', {
      ref: '1050', eliminadoPor: '   ', eliminadoEn: '2026-09-10T13:42:00Z', ahora: AHORA,
    });
    expect(t).toContain('fue eliminado');
  });

  it('distingue hoy, ayer y una fecha anterior', () => {
    const base = { ref: '1050', ahora: AHORA };
    expect(mensajeClaim('eliminado', { ...base, eliminadoEn: '2026-09-10T13:42:00Z' })).toContain('hoy a las 10:42');
    expect(mensajeClaim('eliminado', { ...base, eliminadoEn: '2026-09-09T20:05:00Z' })).toContain('ayer a las 17:05');
  });

  // Chile cambia a horario de verano el 06/09/2026: antes es UTC-4, después UTC-3. Un formateo
  // con offset fijo se equivoca en una hora al cruzar esa fecha; `Intl` con la zona real, no.
  it('respeta el cambio de horario chileno', () => {
    const base = { ref: '1050', ahora: AHORA };
    // 03/09 — todavía UTC-4
    expect(mensajeClaim('eliminado', { ...base, eliminadoEn: '2026-09-03T11:15:00Z' })).toContain('el 03/09 a las 07:15');
    // 08/09 — ya UTC-3, el mismo instante UTC da una hora más
    expect(mensajeClaim('eliminado', { ...base, eliminadoEn: '2026-09-08T11:15:00Z' })).toContain('el 08/09 a las 08:15');
  });

  it('sin fecha de borrado sigue siendo una frase legible', () => {
    const t = mensajeClaim('eliminado', { ref: '1050', boton: '+ Pallet', ahora: AHORA });
    expect(t).toBe('El pallet #1050 fue eliminado. Vuelve a crearlo con “+ Pallet” y reimprime la etiqueta.');
  });

  it('una fecha basura no rompe el mensaje', () => {
    const t = mensajeClaim('eliminado', { ref: '1050', eliminadoEn: 'no-es-fecha', ahora: AHORA });
    expect(t).not.toMatch(/Invalid|NaN/);
    expect(t).toContain('#1050');
  });

  it('sin tipo omite el botón en vez de inventarlo', () => {
    const t = mensajeClaim('eliminado', { ref: '1050', ahora: AHORA });
    expect(t).toContain('Vuelve a crearlo y reimprime');
    expect(t).not.toContain('+ ');
  });
});

describe('los otros motivos', () => {
  it('otra_tienda nombra la tienda dueña', () => {
    expect(mensajeClaim('otra_tienda', { ref: '1050', storeCod: '23PEÑ', ahora: AHORA }))
      .toContain('es de la tienda 23PEÑ');
  });

  it('otra_tienda sin código sigue siendo útil', () => {
    const t = mensajeClaim('otra_tienda', { ref: '1050', ahora: AHORA });
    expect(t).toContain('es de otra tienda');
    expect(t).not.toMatch(/undefined|tienda\s*,/);
  });

  it('ya_en_carga manda a buscarlo, no a recrearlo', () => {
    const t = mensajeClaim('ya_en_carga', { ref: '1050', ahora: AHORA });
    expect(t).toContain('ya está en la carga de hoy');
    expect(t).not.toContain('Vuelve a crearlo');
  });

  it('no_encontrado es el ÚNICO que manda a revisar el número', () => {
    const t = mensajeClaim('no_encontrado', { ref: '1050', ahora: AHORA });
    expect(t).toContain('Revisa el número');
    // Ese texto era el que aparecía siempre; ahora solo cuando de verdad no existe.
    for (const m of ['eliminado', 'otra_tienda', 'ya_en_carga'] as MotivoClaim[]) {
      expect(mensajeClaim(m, { ref: '1050', eliminadoEn: AHORA.toISOString(), ahora: AHORA }))
        .not.toContain('Revisa el número de la etiqueta');
    }
  });

  it('un motivo desconocido cae al genérico sin romperse', () => {
    const t = mensajeClaim('vino_de_marte' as MotivoClaim, { ref: '1050', ahora: AHORA });
    expect(t).toContain('No se pudo agregar');
  });
});

describe('normalización de la referencia', () => {
  it('acepta el # que a veces viene del escáner o del tipeo', () => {
    expect(mensajeClaim('no_encontrado', { ref: '#1050', ahora: AHORA })).toContain('#1050');
    expect(mensajeClaim('no_encontrado', { ref: '#1050', ahora: AHORA })).not.toContain('##');
  });

  it('sin referencia no escribe "#"', () => {
    const t = mensajeClaim('no_encontrado', { ref: '  ', ahora: AHORA });
    expect(t).toContain('ese pallet');
    expect(t).not.toContain('#');
  });
});

describe('mensajeClaim · restaurable', () => {
  const ahora = new Date('2026-09-11T15:00:00Z');

  it('si se puede restaurar, NO manda a recrearlo ni a reimprimir: su etiqueta vuelve a servir', () => {
    const m = mensajeClaim('eliminado', { ref: '12345', eliminadoEn: '2026-09-11T13:00:00Z', restaurable: true, boton: '+ Choc.', ahora });
    expect(m).toContain('restaurarlo');
    expect(m).not.toContain('Vuelve a crearlo');
    expect(m).not.toContain('reimprime');
  });

  it('sin copia (borrado anterior al 11/09) sigue diciendo cómo recrearlo', () => {
    const m = mensajeClaim('eliminado', { ref: '12345', restaurable: false, boton: '+ Choc.', ahora });
    expect(m).toContain('Vuelve a crearlo con “+ Choc.”');
  });
});
