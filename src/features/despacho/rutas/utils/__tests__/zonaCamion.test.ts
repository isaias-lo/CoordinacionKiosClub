import { describe, it, expect } from 'vitest';
import { zonaDeCamion, zonasDeCamion, etiquetaCamion, avisosCamionNoHabilitado } from '../zonaCamion';
import type { ConfigZonas } from '../zonasTransporte';
import type { TiendaInfo } from '../../data/tiendas';

// CD en Santiago; norte = latitud >= latCD, sur = más al sur. `cd` = [lat, lon].
const cd: number[] = [-33.412581, -70.632438];

// Con sector cargado.
const T = (sector: string): TiendaInfo => ({ n: '', z: '', v: '', sector } as unknown as TiendaInfo);
// EXACTAMENTE como arma RutasScreen desde /api/tiendas: sin `sector` (el bug de producción).
const SIN = (z: string): TiendaInfo => ({ n: '', z, v: '' } as unknown as TiendaInfo);

const tiendas: Record<string, TiendaInfo> = {
  '51SER': T('Región'),          // La Serena — norte (por lat)
  '41ANA': T('Región'),          // Antofagasta — norte
  '40LIL': T('Región'),          // sur
  '01TPS': T('Corredor Oriente'),// santiago
  'COSTA': T('Costa'),           // costa
};
const gps: Record<string, number[]> = {
  '51SER': [-29.9,  -71.25],
  '41ANA': [-23.65, -70.40],
  '40LIL': [-38.0,  -72.3],
  '01TPS': [-33.40, -70.55],
  'COSTA': [-33.02, -71.55],
};

const cfg: ConfigZonas = {
  santiago: { zona: 'santiago', modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 4, activo: true },
  costa:    { zona: 'costa',    modo: 'ruta',          empresas: ['Luis Fica'],              orden: 3, activo: true },
  sur:      { zona: 'sur',      modo: 'consolidacion', empresas: ['Luis Fica'],              orden: 1, activo: true },
  norte:    { zona: 'norte',    modo: 'consolidacion', empresas: ['Falabella'],              orden: 2, activo: true },
};

describe('zonaDeCamion — regiones norte por latitud (con sector)', () => {
  it("'Región' del NORTE (51SER, 41ANA) → norte; del SUR → sur", () => {
    expect(zonaDeCamion([{ c: '51SER' }, { c: '41ANA' }], tiendas, gps, cd)).toBe('norte');
    expect(zonaDeCamion([{ c: '40LIL' }], tiendas, gps, cd)).toBe('sur');
  });
  it('Santiago y Costa por sector', () => {
    expect(zonaDeCamion([{ c: '01TPS' }], tiendas, gps, cd)).toBe('santiago');
    expect(zonaDeCamion([{ c: 'COSTA' }], tiendas, gps, cd)).toBe('costa');
  });
});

// ── Bug de producción: `sector` nunca se escribía → E8 quedaba inerte ─────────────────────────
// El catálogo se arma SIN `sector` (como RutasScreen); antes zonaCamion daba null y no había
// etiquetas ni exclusión de km. Con la defensa por distancia, se clasifica igual.
describe('defensa por DISTANCIA cuando falta el sector (bug de producción)', () => {
  // Camión real del 28/08: todas de Regiones, lejos del CD.
  const sinSector: Record<string, TiendaInfo> = {
    '47PTV': SIN('Región'), '53VAL': SIN('Región'), '50PTM': SIN('Región'),
    '39PSB': SIN('Región'), '57CAS': SIN('Región'),
  };
  const gpsReg: Record<string, number[]> = {
    '47PTV': [-38.74, -72.60],  // Villarrica-ish — sur
    '53VAL': [-39.81, -73.24],  // Valdivia — sur
    '50PTM': [-41.47, -72.94],  // Puerto Montt — sur
    '39PSB': [-27.37, -70.33],  // norte
    '57CAS': [-42.48, -73.76],  // Castro — sur
  };
  const stores = Object.keys(sinSector).map(c => ({ c }));

  it('el camión del 28/08 (47PTV,53VAL,50PTM,39PSB,57CAS) SIN sector se detecta como consolidación', () => {
    const et = etiquetaCamion(stores, sinSector, gpsReg, cd); // sin cfg → default geográfico
    expect(et).not.toBeNull();
    expect(et!.modo).toBe('consolidacion');           // antes daba null → no consolidación
    expect(zonaDeCamion(stores, sinSector, gpsReg, cd)).toBe('sur'); // 4 sur + 1 norte → dominante sur
  });

  it('sin sector: una tienda cercana → santiago (ruta), una intermedia → costa', () => {
    const t = { STG: SIN(''), CST: SIN('') };
    const g = { STG: [-33.45, -70.66], CST: [-33.03, -71.55] }; // STG dentro RM; CST costa (~110 km)
    expect(zonaDeCamion([{ c: 'STG' }], t, g, cd)).toBe('santiago');
    expect(zonaDeCamion([{ c: 'CST' }], t, g, cd)).toBe('costa');
  });

  it('sin sector y sin GPS → null (no se puede clasificar)', () => {
    expect(zonaDeCamion([{ c: 'X' }], { X: SIN('') }, {}, cd)).toBeNull();
  });
});

describe('zonaDeCamion — desempate ESTABLE por orden', () => {
  it('empate da el mismo resultado sin importar el orden de llegada', () => {
    const a = zonaDeCamion([{ c: '01TPS' }, { c: 'COSTA' }], tiendas, gps, cd, cfg);
    const b = zonaDeCamion([{ c: 'COSTA' }, { c: '01TPS' }], tiendas, gps, cd, cfg);
    expect(a).toBe(b);
    expect(a).toBe('costa'); // costa.orden(3) < santiago.orden(4)
  });
});

describe('etiquetaCamion', () => {
  it('norte → "Norte · consolidación"; sin config cae al default', () => {
    expect(etiquetaCamion([{ c: '51SER' }], tiendas, gps, cd, cfg)?.label).toBe('Norte · consolidación');
    expect(etiquetaCamion([{ c: '40LIL' }], tiendas, gps, cd)?.modo).toBe('consolidacion');
    expect(etiquetaCamion([{ c: '01TPS' }], tiendas, gps, cd)?.modo).toBe('ruta');
  });
});

describe('avisosCamionNoHabilitado', () => {
  it('Falabella con La Serena (norte) NO da aviso; al sur SÍ', () => {
    expect(avisosCamionNoHabilitado('AB1234', 'Falabella', [{ c: '51SER' }], tiendas, gps, cd, cfg)).toEqual([]);
    expect(avisosCamionNoHabilitado('AB1234', 'Falabella', [{ c: '40LIL' }], tiendas, gps, cd, cfg))
      .toEqual(['AB1234 (Falabella) no está habilitado para Sur']);
  });
  it('camión con sur Y norte avisa por CADA zona no habilitada', () => {
    expect(avisosCamionNoHabilitado('AB1234', 'Ortiz', [{ c: '40LIL' }, { c: '51SER' }], tiendas, gps, cd, cfg))
      .toEqual([
        'AB1234 (Ortiz) no está habilitado para Sur',
        'AB1234 (Ortiz) no está habilitado para Norte',
      ]);
  });
  it('sin config → sin avisos', () => {
    expect(avisosCamionNoHabilitado('AB1234', 'X', [{ c: '40LIL' }], tiendas, gps, cd, undefined)).toEqual([]);
  });
});

describe('zonasDeCamion', () => {
  it('lista las zonas distintas ordenadas por orden', () => {
    expect(zonasDeCamion([{ c: '01TPS' }, { c: '40LIL' }, { c: '51SER' }], tiendas, gps, cd, cfg))
      .toEqual(['sur', 'norte', 'santiago']);
  });
});
