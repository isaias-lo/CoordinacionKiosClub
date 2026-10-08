import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { pesoNetoDeTarjeta, taraDeTarjeta } from '../pesoDelPallet';
import { camposDePeso } from '../actualizarSlotPicking';
import { traeRegistrosNuevos } from '../registroPorFecha';
import { confirmarQuitarSinGuardar, textoQuitarSinGuardar } from '../confirmarGuardado';
import { tiendasSinCatalogo } from '../../regiones/utils/sheetsRegiones';
import type { DispatchItem } from '../../../../types';

describe('sumar o unificar sobre un pallet sin guardar respeta el «peso del pallet»', () => {
  it('sin guardar: el neto es el bruto menos la tara escrita', () => {
    expect(pesoNetoDeTarjeta({ peso: '300', pesoPallet: '22' })).toBe(278);
    expect(taraDeTarjeta({ peso: '300', pesoPallet: '22' })).toBe(22);
  });
  it('con coma decimal', () => {
    expect(pesoNetoDeTarjeta({ peso: '300,5', pesoPallet: '22,5' })).toBe(278);
  });
  it('sin tara, el peso tal cual', () => {
    expect(pesoNetoDeTarjeta({ peso: '20' })).toBe(20);
    expect(taraDeTarjeta({ peso: '20', pesoPallet: '' })).toBeUndefined();
  });
  it('guardada: manda lo guardado (ya es neto)', () => {
    const row = { peso: '999', pesoPallet: '1', savedItem: { peso: 278, taraPallet: 22 } };
    expect(pesoNetoDeTarjeta(row)).toBe(278);
    expect(taraDeTarjeta(row)).toBe(22);
  });
  it('una tara imposible no inventa un neto: queda el bruto', () => {
    expect(pesoNetoDeTarjeta({ peso: '20', pesoPallet: '30' })).toBe(20);
  });
});

describe('camposDePeso: lo que el Resumen escribe en el slot', () => {
  it('peso, medidas y volumétrico', () => {
    expect(camposDePeso({ peso: 35, alto: 150, ancho: 100, largo: 120 }))
      .toEqual({ peso_kg: 35, alto: 150, ancho: 100, largo: 120, peso_v: 300 });
  });
  it('sin pesar: volumétrico 0', () => {
    expect(camposDePeso({ peso: 0, alto: 0, ancho: 0, largo: 0 }, true).peso_v).toBe(0);
  });
});

describe('traeRegistrosNuevos: un registro de otro equipo no se descarta como eco', () => {
  it('detecta un día registrado que lo local no tiene', () => {
    expect(traeRegistrosNuevos({}, { '2026-10-09': true })).toBe(true);
  });
  it('nada nuevo', () => {
    expect(traeRegistrosNuevos({ '2026-10-09': true }, { '2026-10-09': true })).toBe(false);
    expect(traeRegistrosNuevos({ '2026-10-09': true }, {})).toBe(false);
    expect(traeRegistrosNuevos(null, undefined)).toBe(false);
  });
});

describe('la ✕ de una tarjeta sin guardar', () => {
  it('sin pallet en Picking no pregunta', () => {
    expect(confirmarQuitarSinGuardar('P3', false)).toBe(true);
  });
  it('el aviso dice que se borra de Picking', () => {
    expect(textoQuitarSinGuardar('P3')).toContain('Se borra también de Picking');
  });
});

describe('tiendasSinCatalogo: Nacional no descarta tiendas en silencio', () => {
  const item = { orden: 'pallet1', tipo: 'hogar', pkg: 'pallet', guia: '', valor: 0, peso: 1, alto: 1, ancho: 1, largo: 1 } as DispatchItem;
  it('lista las que tienen carga y no están en el catálogo', () => {
    expect(tiendasSinCatalogo({ 'Tienda Que No Existe': [item], 'Otra Vacía': [] })).toEqual(['Tienda Que No Existe']);
  });
});
