import { describe, it, expect } from 'vitest';
import { parseTSheetAuth } from '../sheets';
import type { TiendaInfo } from '../../data/tiendas';
import { grupoDeSector } from '@/lib/sectores';

// Columnas reales de la hoja TIENDAS (ver HEADERS en api/tiendas/export-sheets):
// 0 CÓDIGO · 1 NOMBRE · 2 DIRECCIÓN · 3 REGIÓN · 4 SECTOR/COMUNA · 5 CORREDOR · …
const fila = (cod: string, sector: string, corredor: string) =>
  [cod, `Tienda ${cod}`, 'Una calle 123', 'RM', sector, corredor, 'MALL', '09:00-12:00'];

const parsear = (filas: string[][]) => {
  const tiendas: Record<string, TiendaInfo> = {};
  // Las dos primeras filas son título y encabezado.
  parseTSheetAuth([['título'], ['header'], ...filas], tiendas, {});
  return tiendas;
};

describe('parseTSheetAuth · el sector no se pierde', () => {
  // La carga de Sheets corre sola al montar y pisaba el catálogo. Como no escribía `sector`,
  // quedaba en undefined para TODAS las tiendas y quien dedujera la zona de ahí la resolvía mal.
  it('escribe el sector desde la columna SECTOR/COMUNA', () => {
    const t = parsear([fila('37VIÑ', 'Costa', 'V Región (Ruta 68)')]);
    expect(t['37VIÑ'].sector).toBe('Costa');
  });

  // Este es el caso que se veía: el corredor es texto libre y no empieza con "costa" ni "regi",
  // así que deducir la zona de él manda Costa y Regiones a Santiago.
  it('el corredor NO sirve para deducir la zona; el sector sí', () => {
    const t = parsear([
      fila('37VIÑ', 'Costa',       'V Región (Ruta 68)'),
      fila('53VAL', 'Región',      'Sur (Ruta 5 Sur)'),
      fila('41ANA', 'Región',      'Norte Grande'),
      fila('11ILC', 'Corredor Oriente', 'Oriente'),
    ]);
    expect(grupoDeSector(t['37VIÑ'].corredor)).toBe('rm');    // el corredor engaña
    expect(grupoDeSector(t['37VIÑ'].sector)).toBe('costa');   // el sector acierta
    expect(grupoDeSector(t['53VAL'].sector)).toBe('fal');
    expect(grupoDeSector(t['41ANA'].sector)).toBe('fal');
    expect(grupoDeSector(t['11ILC'].sector)).toBe('rm');
  });

  it('el corredor se sigue guardando aparte, para mostrarlo', () => {
    const t = parsear([fila('11ILC', 'Corredor Oriente', 'Oriente')]);
    expect(t['11ILC'].corredor).toBe('Oriente');
  });

  it('sin sector en la hoja no inventa uno', () => {
    const t = parsear([fila('XXX', '', 'Oriente')]);
    expect(t['XXX'].sector).toBeUndefined();
  });
});
