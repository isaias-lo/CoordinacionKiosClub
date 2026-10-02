import { describe, it, expect } from 'vitest';
import { bultosQueViajan, bultosSantiago, bultosNacional, claseSantiago } from '../numeroCard';

// ── EL CASO: 01TPS, 02/10/2026 ─────────────────────────────────────────────────────────────────
//
// La cabecera de Bodega decía «13 pesados» y el bloque de cruce «14 unidades». La que faltaba era
// la adquisición: diez contadores distintos preguntaban `i.tipo === 'Bulto'`, que nunca coincide
// con 'Adquisicion'. En el Enrutador tampoco aparecía, porque `despacho_sesion` se llena con esos
// mismos contadores.
//
// Decisión del coordinador: los agregados SUBEN AL CAMIÓN, así que van sumados a los bultos.

describe('bultosSantiago — RM/Costa', () => {
  it('EL CASO: la adquisición de 01TPS cuenta como bulto', () => {
    const items = [
      { tipo: 'Pallet' }, { tipo: 'Pallet' }, { tipo: 'Pallet' }, { tipo: 'Pallet' },
      { tipo: 'Bulto' }, { tipo: 'Bulto' }, { tipo: 'Bulto' },
      { tipo: 'Chocolate' }, { tipo: 'Chocolate' }, { tipo: 'Chocolate' },
      { tipo: 'Adquisicion' },
    ];
    expect(bultosSantiago(items)).toBe(4);   // 3 bultos + 1 adquisición, NO 3
  });

  it('el web/retiro también', () => {
    expect(bultosSantiago([{ tipo: 'Bulto' }, { tipo: 'WebRetiro' }])).toBe(2);
  });

  it('el pallet, el contenedor y el chocolate NO son bultos', () => {
    expect(bultosSantiago([{ tipo: 'Pallet' }, { tipo: 'Contenedor' }, { tipo: 'Chocolate' }])).toBe(0);
  });

  it('una tienda sin agregados cuenta exactamente igual que antes', () => {
    // La propiedad que importa: esto no mueve ningún número que hoy esté bien.
    expect(bultosSantiago([{ tipo: 'Bulto' }, { tipo: 'Bulto' }, { tipo: 'Pallet' }])).toBe(2);
  });

  it('lista vacía', () => {
    expect(bultosSantiago([])).toBe(0);
  });
});

describe('bultosNacional', () => {
  it('cuenta la caja y los agregados en el vocabulario de Nacional', () => {
    const items = [{ pkg: 'box' }, { pkg: 'adquisicion' }, { pkg: 'webretiro' }, { pkg: 'pallet' }];
    expect(bultosNacional(items)).toBe(3);
  });

  it('una tienda sin agregados no cambia', () => {
    expect(bultosNacional([{ pkg: 'box' }, { pkg: 'box' }, { pkg: 'chocolate' }])).toBe(2);
  });
});

describe('bultosQueViajan — la regla, sin vocabulario', () => {
  it('las tres clases que el chofer carga como bulto', () => {
    const clases = ['bulto', 'adquisicion', 'webretiro', 'pallet', 'contenedor', 'chocolate'] as const;
    expect(bultosQueViajan(clases.map(c => ({ c })), i => i.c)).toBe(3);
  });

  it('un tipo desconocido cae a bulto, igual que en claseSantiago', () => {
    // `claseSantiago` tiene ese default a propósito; acá se fija que no cambie sin querer.
    expect(claseSantiago('LoQueSea')).toBe('bulto');
    expect(bultosSantiago([{ tipo: 'LoQueSea' }])).toBe(1);
  });
});
