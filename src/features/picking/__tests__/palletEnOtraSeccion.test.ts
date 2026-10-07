import { describe, it, expect } from 'vitest';
import {
  palletsDeOtraSeccion, textoDelAviso, destinoDelAviso, textoDelBoton,
} from '../palletEnOtraSeccion';

// ── EL CASO 41ANA DEL 07/10/2026 ──────────────────────────────────────────────────────────────
//
// Cristian Morales, dos operaciones de Odoo en el mismo batch (una de Aseo, una de Hogar), UN
// pallet: el slot #1533, con `section='hogar'` y `contenido='aseo-hogar'`. En la pestaña ASEO la
// tarjeta decía «0 pallets» y el recuadro vacío, y quien trabaja Aseo podía armarlo de nuevo.

const mixto = { id: 1533, section: 'hogar', contenido: 'aseo-hogar' };

describe('el pallet mixto que está en otra pestaña', () => {
  it('EL CASO: desde ASEO avisa que está en HOGAR, con su número', () => {
    const a = palletsDeOtraSeccion([mixto], 'aseo');
    expect(a).toEqual([{ slotId: 1533, seccion: 'hogar' }]);
    expect(textoDelAviso(a)).toBe('1 pallet mixto de este picker ya está en HOGAR · #1533');
    expect(textoDelBoton(destinoDelAviso(a))).toBe('Ver en HOGAR');
  });

  it('ES SIMÉTRICO: creado desde ASEO, el aviso sale en HOGAR', () => {
    // El mecanismo no sabe nada de «Hogar» ni de «Aseo»: guarda la pestaña que estaba activa.
    const alReves = { id: 1533, section: 'aseo', contenido: 'aseo-hogar' };
    const a = palletsDeOtraSeccion([alReves], 'hogar');
    expect(textoDelAviso(a)).toBe('1 pallet mixto de este picker ya está en ASEO · #1533');
    expect(textoDelBoton(destinoDelAviso(a))).toBe('Ver en ASEO');
  });

  it('EL TERCER CASO: creado desde TODAS no está en NINGUNA sección', () => {
    // `seccionDeGrupo` devuelve null para un mixto, así que el slot nace sin sección y hoy es
    // invisible en las dos pestañas. Son 79 slots en la base.
    const sinSeccion = { id: 1533, section: null, contenido: 'aseo-hogar' };
    for (const sec of ['aseo', 'hogar'] as const) {
      const a = palletsDeOtraSeccion([sinSeccion], sec);
      expect(textoDelAviso(a))
        .toBe('1 pallet mixto de este picker no está en ninguna sección — míralo en TODAS · #1533');
      expect(textoDelBoton(destinoDelAviso(a))).toBe('Ver en TODAS');
    }
  });

  it('varios pallets, varias secciones: manda a TODAS', () => {
    const a = palletsDeOtraSeccion([
      { id: 1, section: 'hogar', contenido: 'aseo-hogar' },
      { id: 2, section: 'comida', contenido: 'comida-aseo' },
    ], 'aseo');
    expect(textoDelAviso(a)).toBe('2 pallets mixtos de este picker se cuentan en otras secciones · #1 · #2');
    expect(textoDelBoton(destinoDelAviso(a))).toBe('Ver en TODAS');
  });
});

describe('cuándo NO hay que avisar nada', () => {
  it('el pallet ya se cuenta en esta pestaña', () => {
    expect(palletsDeOtraSeccion([mixto], 'hogar')).toEqual([]);
    expect(textoDelAviso([])).toBeNull();
    expect(destinoDelAviso([])).toBeNull();
    expect(textoDelBoton(null)).toBeNull();
  });

  it('UN PALLET DE OTRA COSA NO GENERA RUIDO', () => {
    // Un picker con un pallet solo de Hogar y otro solo de Aseo: cada uno en su pestaña, y
    // ninguno avisa del otro. Sin esta condición el aviso saldría en todas partes.
    const soloHogar = { id: 7, section: 'hogar', contenido: 'hogar' };
    expect(palletsDeOtraSeccion([soloHogar], 'aseo')).toEqual([]);
    expect(palletsDeOtraSeccion([soloHogar], 'comida')).toEqual([]);
  });

  it('un mixto de comida+aseo no avisa en HOGAR', () => {
    const ca = { id: 9, section: 'comida', contenido: 'comida-aseo' };
    expect(palletsDeOtraSeccion([ca], 'hogar')).toEqual([]);
    expect(palletsDeOtraSeccion([ca], 'aseo')).toHaveLength(1);
  });

  it('«completo» no nombra ninguna categoría: no se adivina', () => {
    // Son 44 slots. Decidir que «completo» son las cinco sería inventar.
    expect(palletsDeOtraSeccion([{ id: 3, section: 'hogar', contenido: 'completo' }], 'aseo')).toEqual([]);
  });

  it('sin pallets, sin aviso', () => {
    expect(palletsDeOtraSeccion([], 'aseo')).toEqual([]);
  });
});
