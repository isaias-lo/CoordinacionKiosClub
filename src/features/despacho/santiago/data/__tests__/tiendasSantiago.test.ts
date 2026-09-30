import { describe, it, expect } from 'vitest';
import { getTiendaSantiagoByCod, registrarTiendasSantiagoBD, TIENDAS_SANTIAGO } from '../tiendasSantiago';
import { buildRows } from '../../utils/sheetsSantiago';
import type { SantiagoItem } from '../../types';

const item = (orden: string): SantiagoItem => ({
  id: 'x', tiendaCod: '', tipo: 'Pallet', contenido: 'comida',
  peso: 467.5, alto: 120, largo: 120, ancho: 100, pesoVolumetrico: 240,
  regimen: 'Seco', orden, estado: 'Listo para despachar',
} as SantiagoItem);

describe('EL BUG: una tienda que el catálogo no conoce se perdía entera', () => {
  it('buildRows la ESCRIBE igual, no la descarta', () => {
    // Acá había un `if (!tienda) continue;`. El 29/09/2026 el registro de RM/Costa informó 25
    // tiendas y escribió 15: 26ALC (467,5 kg), 56PZA (665,6) y 59EGN (1.003) se descartaron en
    // silencio por no estar en el catálogo estático. Ni la planilla ni la base las vieron.
    const rows = buildRows({ '99ZZZ': [item('P1')] }, 'Seco', '2026-09-30', '2026-09-29');
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('P199ZZZ30092026P');   // el id, intacto
    expect(rows[0][2]).toBe('99ZZZ');              // el código
    expect(rows[0][12]).toBe(467.5);               // y sobre todo: EL PESO
  });

  it('una tienda conocida sigue trayendo sus metadatos', () => {
    const rows = buildRows({ '01TPS': [item('P1')] }, 'Seco', '2026-09-30', '2026-09-29');
    expect(rows[0][3]).toBe('TRAPENSES');
    expect(rows[0][10]).toBe('Lo Barnechea');
  });
});

describe('registrarTiendasSantiagoBD — la mitad que a RM/Costa le faltaba', () => {
  it('suma una tienda de la BD que el catálogo estático no tiene', () => {
    // Nacional ya lo hacía (`registrarTiendasBD`): "una tienda de Región creada en Config. Tiendas
    // YA aparece sola en Bodega". RM/Costa no tenía equivalente.
    expect(getTiendaSantiagoByCod('98YYY')).toBeUndefined();
    const nuevas = registrarTiendasSantiagoBD({
      '98YYY': { cod: '98YYY', tienda: 'NUEVA', region: 'RM', direccion: 'x',
                 comuna: 'Ñuñoa', tipo: 'STRIPCENTER', ventanaHoraria: '9:00 - 12:00', diasDespacho: ['LU'] },
    });
    expect(nuevas).toEqual(['98YYY']);
    expect(getTiendaSantiagoByCod('98YYY')?.tienda).toBe('NUEVA');
  });

  it('NO pisa las curadas: sus datos están afinados a mano', () => {
    // Las 37 de arriba tienen ventanas verificadas con la tienda y comuna de reparto, que no
    // siempre es la del local. La BD todavía no tiene eso.
    const antes = getTiendaSantiagoByCod('01TPS')!.tienda;
    registrarTiendasSantiagoBD([{ ...getTiendaSantiagoByCod('01TPS')!, tienda: 'PISADA' }]);
    expect(getTiendaSantiagoByCod('01TPS')!.tienda).toBe(antes);
  });

  it('no duplica al correr dos veces', () => {
    const n = TIENDAS_SANTIAGO.length;
    const fila = { cod: '97XXX', tienda: 'OTRA', region: 'RM', direccion: '', comuna: '',
                   tipo: 'STRIPCENTER' as const, ventanaHoraria: '', diasDespacho: [] };
    registrarTiendasSantiagoBD([fila]);
    registrarTiendasSantiagoBD([fila]);
    expect(TIENDAS_SANTIAGO.length).toBe(n + 1);
  });

  it('ignora filas sin código', () => {
    const n = TIENDAS_SANTIAGO.length;
    registrarTiendasSantiagoBD([{ cod: '', tienda: 'X' } as never]);
    expect(TIENDAS_SANTIAGO.length).toBe(n);
  });
});
