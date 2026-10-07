import { describe, it, expect } from 'vitest';
import { canonicalDeSlot, stampDesdeISO } from '../canonicalSlot';
import { pkgCodeNacional } from '@/features/despacho/shared/tipoCode';

// ── EL CHOQUE DEL 02/10/2026 ──────────────────────────────────────────────────────────────────
//
// Tienda 23PEÑ: el slot 961 (A1) y el slot 1009 (W1) quedaron los dos con `123PEÑ02102026`. Dos
// etiquetas distintas con el MISMO código de barras.

describe('la adquisición y el web/retiro llevan su letra', () => {
  it('EL CHOQUE: A1 y W1 de la misma tienda y el mismo día YA NO son el mismo id', () => {
    const a = canonicalDeSlot('A', 1, '23PEÑ', '02102026');
    const w = canonicalDeSlot('W', 1, '23PEÑ', '02102026');
    expect(a).toBe('A123PEÑ02102026A');
    expect(w).toBe('W123PEÑ02102026W');
    expect(a).not.toBe(w);
  });

  it('el caso de hoy: la adquisición de 01TPS deja de ser `101TPS06102026`', () => {
    expect(canonicalDeSlot('A', 1, '01TPS', '06102026')).toBe('A101TPS06102026A');
  });
});

describe('los formatos que YA están impresos no se tocan', () => {
  it('el pallet', () => {
    expect(canonicalDeSlot('P', 1, '01TPS', '06102026')).toBe('P101TPS06102026P');
    expect(canonicalDeSlot('P', 5, '60PBL', '07102026')).toBe('P560PBL07102026P');
  });

  it('EL BULTO ESCRIBE AL REVÉS: `1B…B` y no `B1…B`', () => {
    // Está impreso así desde el primer día. "Ordenarlo" rompería etiquetas vivas.
    expect(canonicalDeSlot('B', 1, '28TEM', '22092026')).toBe('1B28TEM22092026B');
    expect(canonicalDeSlot('B', 3, '01TPS', '06102026')).toBe('3B01TPS06102026B');
  });

  it('el chocolate y el contenedor', () => {
    expect(canonicalDeSlot('CH', 2, '01TPS', '06102026')).toBe('CH201TPS06102026CH');
    expect(canonicalDeSlot('C', 1, '16PQA', '06102026')).toBe('C116PQA06102026C');
  });

  it('las cajas de congelados, que solo conocían dos de las seis copias', () => {
    expect(canonicalDeSlot('CC', 1, '26ALC', '06102026')).toBe('CC126ALC06102026CC');
    expect(canonicalDeSlot('CN', 4, '26ALC', '06102026')).toBe('CN426ALC06102026CN');
  });

  it('un envase desconocido cae al descarte de siempre', () => {
    // Cambiar ESTO sí rompería ids ya guardados: es el formato que tienen las 29 filas viejas.
    expect(canonicalDeSlot('X', 1, '01TPS', '06102026')).toBe('101TPS06102026');
    expect(canonicalDeSlot('', 2, '01TPS', '06102026')).toBe('201TPS06102026');
  });
});

describe('ningún par de envases produce el mismo id', () => {
  it('con el mismo número, tienda y día, los ocho son distintos', () => {
    const ids = ['P', 'B', 'CH', 'C', 'CC', 'CN', 'A', 'W']
      .map(t => canonicalDeSlot(t, 1, '23PEÑ', '02102026'));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('stampDesdeISO', () => {
  it('DDMMYYYY', () => {
    expect(stampDesdeISO('2026-10-06')).toBe('06102026');
    expect(stampDesdeISO('2026-01-02')).toBe('02012026');
  });
});

// ── LA TRADUCCIÓN DE NACIONAL ─────────────────────────────────────────────────────────────────
//
// `sheetsRegiones` era la séptima copia. Habla de `pkg` (vocabulario de la pantalla) y no de la
// letra de `picking_pallets`, así que traduce con `pkgCodeNacional` y el formato sale de acá.
// Este test fija los SEIS valores reales de `pkg` contra las cadenas que la hoja ya tiene escritas.

describe('los seis `pkg` de Nacional dan exactamente lo que la hoja ya tiene', () => {
  const casos: [string, string][] = [
    ['pallet',      'P147PTV05102026P'],
    ['box',         '1B47PTV05102026B'],
    ['contenedor',  'C147PTV05102026C'],
    ['chocolate',   'CH147PTV05102026CH'],
    ['adquisicion', 'A147PTV05102026A'],
    ['web-retiro',  'W147PTV05102026W'],
  ];
  it.each(casos)('%s', (pkg, esperado) => {
    expect(canonicalDeSlot(pkgCodeNacional(pkg), 1, '47PTV', '05102026')).toBe(esperado);
  });
});
