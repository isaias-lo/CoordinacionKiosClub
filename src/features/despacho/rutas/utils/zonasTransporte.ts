// [E8] Configuración de qué empresa transporta cada zona y si se rutea o se consolida.
//
// Existe porque quién lleva cada zona es una decisión comercial que CAMBIA: hasta agosto de
// 2026 Falabella hacía todo Regiones a través de Ortiz y otros transportistas; desde el lunes
// 31 Luis Fica —que ya hacía todo Santiago— tomó el sur completo, y más adelante tomaría el
// norte. Deducirlo del historial no sirve: el historial está a mitad de camino y el día que
// cambia queda viejo.
//
// Puro y testeable. La configuración se INYECTA ya cargada; acá no hay red.

import type { ZonaRuteo } from '@/lib/sectores';
import { empresaCanonica } from './empresaFlota';

export type ModoZona = 'ruta' | 'consolidacion';

export interface ConfigZona {
  zona: ZonaRuteo;
  /** 'ruta' calcula recorrido, orden y ventanas. 'consolidacion' solo asigna transportista. */
  modo: ModoZona;
  /** Empresas habilitadas. Vacío = ninguna puede llevarla (queda para asignar a mano). */
  empresas: string[];
  /** Lo más lejano primero: se carga antes y sale más temprano. */
  orden: number;
  activo: boolean;
}

export type ConfigZonas = Record<ZonaRuteo, ConfigZona>;

/**
 * Estado al 29/08/2026. Es el respaldo si la tabla todavía no existe o el endpoint falla:
 * el motor tiene que poder rutear igual, no quedarse sin nada.
 *
 * El sur está REPARTIDO a propósito: las seis ya traspasadas van con Luis Fica y el resto
 * sigue con Falabella — verificado en el despacho del 28/08, donde Panguipulli salió en un
 * camión de Falabella. El lunes 31 pasa a ser solo Luis Fica, y eso se cambia desde la
 * pantalla, no acá.
 */
export const ZONAS_DEFAULT: ConfigZonas = {
  sur:      { zona: 'sur',      modo: 'consolidacion', empresas: ['Luis Fica', 'Falabella'], orden: 1, activo: true },
  norte:    { zona: 'norte',    modo: 'consolidacion', empresas: ['Falabella', 'Ortiz'],    orden: 2, activo: true },
  costa:    { zona: 'costa',    modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 3, activo: true },
  santiago: { zona: 'santiago', modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 4, activo: true },
};

/** Normaliza filas de la BD a la configuración, completando con el default lo que falte. */
export function parseZonas(filas: unknown): ConfigZonas {
  const out: ConfigZonas = {
    sur:      { ...ZONAS_DEFAULT.sur },
    norte:    { ...ZONAS_DEFAULT.norte },
    costa:    { ...ZONAS_DEFAULT.costa },
    santiago: { ...ZONAS_DEFAULT.santiago },
  };
  if (!Array.isArray(filas)) return out;
  for (const f of filas) {
    const r = f as Partial<ConfigZona> & { zona?: string };
    const z = String(r?.zona ?? '').trim().toLowerCase() as ZonaRuteo;
    if (!(z in out)) continue;
    out[z] = {
      zona:     z,
      modo:     r.modo === 'ruta' || r.modo === 'consolidacion' ? r.modo : out[z].modo,
      empresas: Array.isArray(r.empresas) ? r.empresas.map(e => String(e).trim()).filter(Boolean) : out[z].empresas,
      orden:    Number.isFinite(r.orden as number) ? Number(r.orden) : out[z].orden,
      activo:   typeof r.activo === 'boolean' ? r.activo : out[z].activo,
    };
  }
  return out;
}

/**
 * ¿Puede este camión llevar esta zona? Compara por empresa CANÓNICA, así "Kios", "Kios Club"
 * y "kiosclub" cuentan como la misma. Sin empresas configuradas nadie puede: es deliberado —
 * es la salida segura para el día del traspaso, marcar la zona como "asignar a mano" en vez
 * de proponer el transportista equivocado.
 */
export function empresaHabilitada(empresaCamion: string | undefined | null, cfg: ConfigZona): boolean {
  const e = empresaCanonica(empresaCamion);
  return cfg.empresas.some(x => empresaCanonica(x) === e);
}

/** Zonas de ruteo (no de consolidación), en el orden en que se arman. */
export function zonasDeRuteo(cfg: ConfigZonas): ConfigZona[] {
  return Object.values(cfg).filter(z => z.activo && z.modo === 'ruta').sort((a, b) => a.orden - b.orden);
}

/** Zonas que se consolidan, en el orden en que se arman. */
export function zonasDeConsolidacion(cfg: ConfigZonas): ConfigZona[] {
  return Object.values(cfg).filter(z => z.activo && z.modo === 'consolidacion').sort((a, b) => a.orden - b.orden);
}
