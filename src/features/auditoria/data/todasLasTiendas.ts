import { TIENDAS } from '../../despacho/regiones/data/tiendas';
import { TIENDAS_SANTIAGO } from '../../despacho/santiago/data/tiendasSantiago';
import type { TiendaRef } from '../types';

export const TODAS_LAS_TIENDAS: TiendaRef[] = [
  ...Object.values(TIENDAS).map(t => ({
    cod: t.cod,
    nombre: t.name,
    area: 'regiones' as const,
    region: t.region,
    comuna: t.comuna,
  })),
  ...TIENDAS_SANTIAGO.map(t => ({
    cod: t.cod,
    nombre: t.tienda,
    area: 'santiago' as const,
    region: t.region === 'VR' ? 'VALPARAÍSO' : 'R. METROPOLITANA',
    comuna: t.comuna,
  })),
].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
