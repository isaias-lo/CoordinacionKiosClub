import { fechaChile } from './fechaChile';
// Trazabilidad de bodega ("quién hizo qué"). El cliente llama a logActividad (fire-and-forget);
// la API /api/actividad estampa el actor desde el token (verifyActor), no desde el cliente.
// NUNCA debe lanzar ni bloquear el flujo de bodega (patrón de picking_eventos.logEvento).

/**
 * Las acciones que se registran. Es la ÚNICA lista: la API la usa como lista blanca, así que
 * agregar una acción acá la habilita en los dos lados. Antes estaba repetida en el route, y una
 * acción que faltara allá se rechazaba con 400 — sin que nadie se enterara, porque logActividad
 * es fire-and-forget.
 *
 * 'revertir' es el deshacer del snackbar. Sin ella la bitácora mentía: quedaba "Eliminó CH3" o
 * "Sumó CH3 a P1" aunque alguien lo hubiera revertido a los dos segundos.
 */
export const ACCIONES_ACTIVIDAD = [
  'registrar_item', 'editar_item', 'eliminar_item', 'unificar', 'sumar', 'registrar_dia', 'revertir',
] as const;

export type AccionActividad = typeof ACCIONES_ACTIVIDAD[number];

export type FuenteActividad = 'nacional' | 'rmcosta';

export interface ActividadCtx {
  fuente: FuenteActividad;
  tiendaCod?: string;
  tiendaNombre?: string;
  label?: string;        // ítem/target: P1 / B2 / C1 / CH1
  sourceLabel?: string;  // source en unificar/sumar: P3 / bulto / CH
  peso?: number;
  alto?: number;
  contenido?: string;
  slotId?: number;
  // revertir: qué operación se deshizo.
  revierte?: 'suma' | 'borrado' | 'unificacion';
  // registrar_dia:
  tiendas?: number;
  pallets?: number;
  bultos?: number;
}

/** Convierte el `orden` interno (pallet1/bulto1/contenedor1/chocolate1) a etiqueta P1/B1/C1/CH1. */
export function ordenToLabel(orden: string): string {
  const m = orden.match(/^([a-zA-Z]+)(\d+)$/);
  if (!m) return orden;
  const map: Record<string, string> = { pallet: 'P', bulto: 'B', contenedor: 'C', chocolate: 'CH' };
  return (map[m[1].toLowerCase()] ?? m[1]) + m[2];
}

/** Frase legible y precisa por acción. Pura y testeable. */
export function buildActividadMensaje(accion: AccionActividad, ctx: ActividadCtx): string {
  const tienda = ctx.tiendaCod
    ? `${ctx.tiendaCod}${ctx.tiendaNombre ? ` ${ctx.tiendaNombre}` : ''}`
    : '';
  const en = tienda ? ` en ${tienda}` : '';
  switch (accion) {
    case 'registrar_item': {
      const kg = ctx.peso != null ? ` · ${ctx.peso}kg` : '';
      return `Ingresó ${ctx.label ?? 'ítem'}${kg}${en}`;
    }
    case 'editar_item':
      return `Editó ${ctx.label ?? 'ítem'}${en}`;
    case 'eliminar_item':
      return `Eliminó ${ctx.label ?? 'ítem'}${en}`;
    case 'unificar':
      return `Unificó ${ctx.sourceLabel ?? '?'} con ${ctx.label ?? '?'}${en}`;
    case 'sumar': {
      const kg = ctx.peso != null ? ` (+${ctx.peso}kg)` : '';
      return `Sumó ${ctx.sourceLabel ?? 'ítem'} a ${ctx.label ?? 'pallet'}${en}${kg}`;
    }
    case 'revertir': {
      const que = ctx.revierte === 'suma'
        ? `la suma de ${ctx.sourceLabel ?? 'ítem'} a ${ctx.label ?? 'pallet'}`
        : ctx.revierte === 'unificacion'
          ? `la unificación de ${ctx.sourceLabel ?? '?'} con ${ctx.label ?? '?'}`
          : `el borrado de ${ctx.label ?? 'ítem'}`;
      return `Revirtió ${que}${en}`;
    }
    case 'registrar_dia': {
      const parts: string[] = [];
      if (ctx.tiendas != null) parts.push(`${ctx.tiendas} tiendas`);
      if (ctx.pallets != null) parts.push(`${ctx.pallets} pallets`);
      if (ctx.bultos != null) parts.push(`${ctx.bultos} bultos`);
      const resumen = parts.length ? ` — ${parts.join(' · ')}` : '';
      const zona = ctx.fuente === 'nacional' ? 'NACIONAL' : 'RM/Costa';
      return `Registró el despacho ${zona}${resumen}`;
    }
  }
}

export interface ActividadRow {
  id: number;
  created_at: string;
  fecha: string;
  actor_id: string | null;
  actor_name: string | null;
  fuente: FuenteActividad;
  accion: AccionActividad;
  tienda_cod: string | null;
  tienda_nombre: string | null;
  mensaje: string;
  detalle: Record<string, unknown> | null;
}

export interface LogActividadInput extends ActividadCtx {
  accion: AccionActividad;
  fecha?: string;  // YYYY-MM-DD local; default hoy
}

function localDate(): string {
  return fechaChile();  // día del CD — ver lib/fechaChile.ts
}

/** Registra la actividad vía API. Fire-and-forget: nunca lanza ni bloquea el flujo. */
export function logActividad(input: LogActividadInput): void {
  try {
    const { accion, fecha, ...ctx } = input;
    if (typeof window === 'undefined') return;
    const body = {
      fecha: fecha ?? localDate(),
      fuente: ctx.fuente,
      accion,
      tienda_cod: ctx.tiendaCod ?? null,
      tienda_nombre: ctx.tiendaNombre ?? null,
      mensaje: buildActividadMensaje(accion, ctx),
      detalle: {
        label: ctx.label ?? null, sourceLabel: ctx.sourceLabel ?? null,
        peso: ctx.peso ?? null, alto: ctx.alto ?? null, contenido: ctx.contenido ?? null,
        slotId: ctx.slotId ?? null,
        tiendas: ctx.tiendas ?? null, pallets: ctx.pallets ?? null, bultos: ctx.bultos ?? null,
      },
    };
    // Auth por cookie de sesión (verifyActor tiene fallback de cookie); keepalive para que
    // sobreviva a una navegación (p. ej. tras "Registrar").
    void fetch('/api/actividad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(e => console.error('[logActividad]', e));
  } catch (e) {
    console.error('[logActividad]', e);
  }
}
