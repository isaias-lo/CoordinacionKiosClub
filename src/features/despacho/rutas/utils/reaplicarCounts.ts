import type { SesionRow } from '../../../../lib/despachoSesion';
import { grupoArmada } from './flujoArmada';

export interface CalDataCounts {
  on: boolean;
  p: number;
  b: number;
  c: number;
  ch: number;
  g?: string;
}

/**
 * Re-aplica los counts de `despacho_sesion` (armado en Bodega) a un `calT` ya construido.
 *
 * Contexto: cuando el Enrutador trae el calendario autoritativo de la BD DESPUÉS de que ya
 * llegaron los counts de `despacho_sesion` (carrera de tiempos), las tiendas recién añadidas por
 * el merge del calendario entran con p/b/ch en 0. Esta función las rellena con los counts ya
 * conocidos, sin pisar ediciones manuales.
 *
 * Además INYECTA las tiendas armadas hoy con carga que NO están en el calendario (p. ej. 55ITA
 * agregada en Picking), colocándolas en su grupo (`sectorDe` + fuente). Antes se perdían.
 *
 * Puro y testeable. No pisa ediciones manuales.
 */
export function reaplicarCounts(
  calT: Record<string, CalDataCounts>,
  sesionRows: Map<string, SesionRow>,
  manuallyEdited: Set<string>,
  sectorDe?: (cod: string) => string | null | undefined,
): Record<string, CalDataCounts> {
  const next: Record<string, CalDataCounts> = { ...calT };
  sesionRows.forEach((row, cod) => {
    if (manuallyEdited.has(cod)) return;
    const cc = row.contenedores ?? 0;
    const ch = row.chocolates ?? 0;
    const hasCounts = row.pallets > 0 || row.bultos > 0 || cc > 0 || ch > 0;
    if (next[cod]) {
      next[cod] = { ...next[cod], p: row.pallets, b: row.bultos, c: cc, ch, on: hasCounts };
    } else if (hasCounts) {
      next[cod] = { on: true, p: row.pallets, b: row.bultos, c: cc, ch, g: grupoArmada(row.fuente, sectorDe?.(cod)) };
    }
  });
  return next;
}
