import { describe, it, expect } from 'vitest';
import { tipoTienda, grupoTienda, esMall } from '../tipoTienda';

describe('grupoTienda', () => {
  it('Costa / Región / RM según la zona (sin campo region)', () => {
    expect(grupoTienda('Costa Valparaíso')).toBe('costa');
    expect(grupoTienda('Región')).toBe('fal');
    expect(grupoTienda('Providencia')).toBe('rm');
    expect(grupoTienda('')).toBe('rm');
    expect(grupoTienda(null)).toBe('rm');
  });
  it('usa el campo `region` como fuente canónica cuando existe', () => {
    // Nacional: la zona NO dice "region" (es un corredor/comuna), pero region sí distingue.
    expect(grupoTienda('Corredor Norte', 'Antofagasta')).toBe('fal');
    expect(grupoTienda('Concepción', 'Biobío')).toBe('fal');
    expect(grupoTienda('Puerto Montt', 'Los Lagos')).toBe('fal');
    // Costa = Valparaíso (nombre o código).
    expect(grupoTienda('Viña', 'Valparaíso')).toBe('costa');
    expect(grupoTienda('X', 'V')).toBe('costa');
    expect(grupoTienda('X', 'VR')).toBe('costa');
    // RM.
    expect(grupoTienda('Corredor Oriente', 'RM')).toBe('rm');
    expect(grupoTienda('X', 'Metropolitana')).toBe('rm');
  });
  it('el `region` manda por sobre la heurística de zona', () => {
    // zona "Corredor Norte" sola daría 'rm', pero la region Nacional corrige a 'fal'.
    expect(grupoTienda('Corredor Norte', 'Coquimbo')).toBe('fal');
  });
});

describe('tipoTienda', () => {
  it('reconoce Mall / Strip / Street desde el tipo de la BD', () => {
    expect(tipoTienda('Mall').key).toBe('mall');
    expect(tipoTienda('MALL PLAZA').key).toBe('mall');
    expect(tipoTienda('Strip Center').key).toBe('strip');
    expect(tipoTienda('stripcenter').key).toBe('strip');
    expect(tipoTienda('Street').key).toBe('street');
  });
  it('reconoce Costa / Región desde el tipo', () => {
    expect(tipoTienda('Costa').key).toBe('costa');
    expect(tipoTienda('Región').key).toBe('region');
    expect(tipoTienda('region').key).toBe('region');
  });
  it('tipo vacío → deriva de zona (Costa/Región)', () => {
    expect(tipoTienda('', '', 'Costa Valparaíso').key).toBe('costa');
    expect(tipoTienda(null, null, 'Región').key).toBe('region');
  });
  it('tipo vacío → deriva Mall si la dirección dice "local"', () => {
    expect(tipoTienda('', 'Local 123, Mall Plaza', '').key).toBe('mall');
  });
  it('tipo vacío y sin señales → Street (default)', () => {
    expect(tipoTienda('', 'Av. Siempre Viva 742', 'Providencia').key).toBe('street');
    expect(tipoTienda(undefined).key).toBe('street');
  });
  it('tipo desconocido → "otro" mostrando el texto tal cual', () => {
    const r = tipoTienda('Bodega Externa');
    expect(r.key).toBe('otro');
    expect(r.label).toBe('Bodega Externa');
  });
  it('cada tipo trae label + color', () => {
    const r = tipoTienda('Mall');
    expect(r.label).toBe('Mall');
    expect(r.color).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

// ── esMall — el color del calendario ────────────────────────────────────────
// Casos REALES del catálogo. Antes el calendario decidía "mall" con un regex sobre la dirección
// (`/local/i`) y la hoja CALENDARIO con una lista de 7 códigos escrita a mano; las dos se
// equivocaban en las dos direcciones, sobre 17 tiendas de RM.
describe('esMall', () => {
  it('26ALC Alto Las Condes es mall aunque su dirección no diga "local"', () => {
    // El caso reportado: "Av. Pdte. Kennedy Lateral 9001" no contiene "local" → salía street.
    expect(esMall('MALL', 'Av. Pdte. Kennedy Lateral 9001, Las Condes', 'Las Condes')).toBe(true);
  });

  it('52MUT El MUT y 32BNV Buenaventura son malls sin "local" en la dirección', () => {
    expect(esMall('MALL', 'Roger de Flor 2725, Las Condes', 'Corredor Oriente')).toBe(true);
    expect(esMall('MALL', 'San Ignacio 500, Quilicura', 'Corredor Poniente')).toBe(true);
  });

  it('un strip center NO es mall aunque su dirección diga "Local N"', () => {
    // 45EST Estoril y 49PTA Los Toros: la lista vieja los marcaba como mall.
    expect(esMall('STRIPCENTER', 'Estoril 585 Local 3, Las Condes', 'Corredor Oriente')).toBe(false);
    expect(esMall('STRIPCENTER', 'Los Toros 297 Local 1009, Puente Alto', 'Corredor Sur')).toBe(false);
  });

  it('sin `tipo` en el catálogo cae a la heurística de la dirección (último recurso)', () => {
    expect(esMall('', 'Av. Kennedy 5413 Local 537, Las Condes', 'Corredor Oriente')).toBe(true);
    expect(esMall('', 'Av. Los Leones 2572, Providencia', 'Corredor Providencia')).toBe(false);
  });

  it('tolera nulos', () => {
    expect(esMall(null, null, null)).toBe(false);
    expect(esMall(undefined, undefined, undefined)).toBe(false);
  });
});

// Las 17 tiendas de RM que el calendario pintaba mal, con su `tipo` y dirección REALES del
// catálogo. La heurística vieja (`/local/i` sobre la dirección) daba lo contrario en cada una.
describe('esMall — las 17 tiendas de RM que salían con el color equivocado', () => {
  const CASOS: [string, string, string, string, boolean][] = [
    // cod,   nombre,             tipo BD,        dirección,                                              ¿mall?
    ['26ALC', 'Alto las Condes',  'MALL',        'Av. Pdte. Kennedy Lateral 9001, Las Condes',            true],
    ['19SUB', 'Subcentro',        'MALL',        'Av. Apoquindo 4400 Loc.110-112, Las Condes',            true],
    ['32BNV', 'Buenaventura',     'MALL',        'San Ignacio 500, Quilicura',                            true],
    ['35BN2', 'Buenaventura 2',   'MALL',        'San Ignacio 500, Quilicura',                            true],
    ['52MUT', 'El MUT',           'MALL',        'Roger de Flor 2725, Las Condes',                        true],
    ['59EGN', 'Plaza Egaña',      'MALL',        'Av. Larraín 5862 LC B-2128 Y B-2132',                   true],
    ['01TPS', 'Trapenses',        'STRIPCENTER', 'Camino Los Trapenses 3023 Local 5, Lo Barnechea',       false],
    ['07CCR', 'Chicureo',         'STRIPCENTER', 'Avenida Chicureo 3100 Local 10, Colina',                false],
    ['10TRQ', 'El Tranque',       'STRIPCENTER', 'Manquehue Oriente 2030 Local 3, Lo Barnechea',          false],
    ['13PIE', 'Pie Andino',       'STRIPCENTER', 'Av. Paseo Pie Andino 5855 Local 3A, Lo Barnechea',      false],
    ['21NUC', 'Nueva Costanera',  'STRIPCENTER', 'Av. Nueva Costanera 3889 Local 2, Vitacura',            false],
    ['22LGN', 'Laguna',           'STRIPCENTER', 'Av. Padre Sergio Correa 14500 Local 160, Colina',       false],
    ['23PEÑ', 'Peñalolén',        'STRIPCENTER', 'Altos del Parque Sur 5800 Local 6, Peñalolén',          false],
    ['45EST', 'Estoril',          'STRIPCENTER', 'Estoril 585 Local 3, Las Condes',                       false],
    ['48BRU', 'Las Brujas',       'STRIPCENTER', 'Carlos Silva Vildosola 9073 Local 64, La Reina',        false],
    ['49PTA', 'Los Toros',        'STRIPCENTER', 'Los Toros 297 Local 1009, Puente Alto',                 false],
    ['58TAM', 'El Tamarugo',      'STRIPCENTER', 'Av Vitacura 4607  Local 12-a',                          false],
  ];

  it.each(CASOS)('%s %s (%s) → mall=%s', (_cod, _nombre, tipo, direccion, esperado) => {
    expect(esMall(tipo, direccion, 'Corredor Oriente')).toBe(esperado);
  });

  it('la heurística vieja se equivocaba en LAS 17 (por eso el cambio)', () => {
    const heuristicaVieja = (d: string) => /local/i.test(d);
    for (const [, , , direccion, esperado] of CASOS) {
      expect(heuristicaVieja(direccion)).toBe(!esperado);
    }
  });
});
