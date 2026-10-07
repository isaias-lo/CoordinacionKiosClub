import { describe, expect, it } from 'vitest';
import { copiaParaOtraTienda, formatoKg, formatoMedidas, posicionDeUnidad, textoAvanceTiendas, totalesResumen } from '../resumenDia';
import { claseNacional } from '../numeroCard';

const it_ = (pkg: string, peso = 0, valor = 0) => ({ pkg, peso, valor });

describe('totales del resumen', () => {
  it('cuenta cada clase por su nombre: contenedor y agregados ya no son bultos', () => {
    const t = totalesResumen([
      it_('pallet', 300), it_('box', 20), it_('contenedor', 150), it_('chocolate', 17),
      it_('adquisicion'), it_('web-retiro'),
    ], i => claseNacional(i.pkg));
    expect(t).toMatchObject({ pallet: 1, bulto: 1, contenedor: 1, chocolate: 1, agregado: 2, unidades: 4 });
  });

  it('suma kilos sin arrastrar coma flotante, y el monto de todo', () => {
    const t = totalesResumen([it_('pallet', 0.1, 1000), it_('pallet', 0.2), it_('adquisicion', 0, 500)], i => claseNacional(i.pkg));
    expect(t.kg).toBe(0.3);
    expect(t.monto).toBe(1500);
  });
});

describe('formatos', () => {
  it('kilos a la chilena', () => {
    expect(formatoKg(4210.5)).toBe('4.210,5 kg');
    expect(formatoKg(NaN)).toBe('0 kg');
  });
  it('medidas sin ceros', () => {
    expect(formatoMedidas(150, 0, 0)).toBe('150 cm');
    expect(formatoMedidas(40, 60, 30)).toBe('40 × 60 × 30 cm');
    expect(formatoMedidas(0)).toBe('');
  });
  it('avance de tiendas', () => {
    expect(textoAvanceTiendas(4, 11)).toBe('4 de 11 tiendas listas');
    expect(textoAvanceTiendas(1, 11)).toBe('1 de 11 tiendas lista');
    expect(textoAvanceTiendas(11, 11)).toBe('Las 11 tiendas de hoy están listas');
    expect(textoAvanceTiendas(0, 0)).toBe('Sin tiendas hoy');
  });
});

describe('copiar a otra tienda', () => {
  it('no lleva id, slot ni código: cada tienda tiene su propia unidad', () => {
    const c = copiaParaOtraTienda({ id: 'di-1', pickingSlotId: 9, canonical_id: 'P1X', guia: '123', orden: 'P1', peso: 300 });
    expect(c).toEqual({ guia: '', orden: '', peso: 300 });
  });
});

describe('editar por id, no por posición', () => {
  it('encuentra la unidad aunque se haya movido', () => {
    expect(posicionDeUnidad([{ id: 'b' }, { id: 'a' }], 'a', 0)).toBe(1);
  });
  it('si la borraron, -1: no se pisa otra', () => {
    expect(posicionDeUnidad([{ id: 'b' }], 'a', 0)).toBe(-1);
  });
  it('sin id, usa la posición si sigue existiendo', () => {
    expect(posicionDeUnidad([{}, {}], undefined, 1)).toBe(1);
    expect(posicionDeUnidad([{}], undefined, 3)).toBe(-1);
  });
});
