// Cuánta carga tiene cada pestaña de Congelados. Puro y testeable.
//
// Las dos zonas —Nacional y RM/Costa— son pantallas separadas, y cada una solo sabe de lo suyo.
// Para enterarte de que en la otra hay tiendas sin registrar tenías que cambiar de pestaña e ir a
// mirar. Y no registrar es lo que deja la carga invisible para el despacho y el Enrutador: es
// justo lo que no puede depender de que alguien se acuerde de revisar.
//
// El contador va en la pestaña misma, así que se ve sin entrar.

import { resumenCongelados, type ConteoTienda } from './resumenCongelados';
import type { ZonaCongelados } from './congeladosGrid';

export interface ConteoZona {
  /** Tiendas con carga. */
  tiendas: number;
  cajas: number;
  /** Tiendas con carga que todavía NO se registraron. El número que importa. */
  pendientes: number;
}

export type ConteoCongelados = Record<ZonaCongelados, ConteoZona>;

export const CONTEO_VACIO: ConteoCongelados = {
  nacional: { tiendas: 0, cajas: 0, pendientes: 0 },
  rmcosta:  { tiendas: 0, cajas: 0, pendientes: 0 },
};

/** Reduce el resumen de una zona a lo que cabe en una pestaña. */
export function conteoDeZona(
  cods: string[],
  cajasPorTienda: Record<string, ConteoTienda | undefined>,
  registradas: ReadonlySet<string>,
): ConteoZona {
  const r = resumenCongelados(cods, cajasPorTienda, registradas);
  return { tiendas: r.conCarga.length, cajas: r.totalCajas, pendientes: r.pendientes };
}

export type TonoBadge = 'pendiente' | 'listo' | 'ninguno';

export interface Badge {
  /** Lo que se dibuja. Vacío ⇒ no se dibuja nada. */
  texto: string;
  tono: TonoBadge;
  /** Para el `title`: la pestaña sola no alcanza a explicar qué significa el número. */
  detalle: string;
}

/**
 * Qué mostrar en la pestaña.
 *
 * El número es el de tiendas SIN REGISTRAR, no el de cajas ni el de tiendas con carga. Es lo
 * único que pide una acción: si está en cero no hay nada que hacer ahí, por más cajas que haya.
 *
 * Una zona sin carga NO lleva badge. Un cero dibujado compite por la vista con el que sí importa,
 * y además "0" y "sin carga" se leen igual de lejos.
 */
export function badgeZona(c: ConteoZona): Badge {
  if (c.pendientes > 0) {
    return {
      texto: String(c.pendientes),
      tono: 'pendiente',
      detalle: `${c.pendientes} ${c.pendientes === 1 ? 'tienda sin registrar' : 'tiendas sin registrar'} · ${c.cajas} ${c.cajas === 1 ? 'caja' : 'cajas'}`,
    };
  }
  if (c.tiendas > 0) {
    return {
      texto: '✓',
      tono: 'listo',
      detalle: `Todo registrado · ${c.cajas} ${c.cajas === 1 ? 'caja' : 'cajas'} en ${c.tiendas} ${c.tiendas === 1 ? 'tienda' : 'tiendas'}`,
    };
  }
  return { texto: '', tono: 'ninguno', detalle: 'Sin congelados este día' };
}
