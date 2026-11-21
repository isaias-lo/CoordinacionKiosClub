// Qué es una solicitud válida, con zod. Igual que `src/lib/schemas.ts`.
//
// ── VALIDA EL SERVIDOR, AUNQUE LA PANTALLA YA LO HAGA ─────────────────────────────────────────
//
// La pantalla del supervisor no deja enviar sin descripción ni sin foto, pero eso es comodidad,
// no una garantía: la solicitud también entra por la cola offline, y lo que se encoló con una
// versión vieja de la aplicación puede subir días después. La regla tiene que vivir donde se
// escribe en la base.
//
// ── LA TIENDA TIENE QUE SER SUYA ──────────────────────────────────────────────────────────────
//
// Eso NO se puede comprobar con un schema: hace falta la lista de tiendas del usuario, que sale
// de `mant_supervisor_tiendas`. Por eso va aparte, en `tiendaPermitida`, y la ruta de API llama a
// las dos. Meterlo en el schema obligaría a construirlo por usuario en cada petición.
//
// ── DE 1 A 5 FOTOS ────────────────────────────────────────────────────────────────────────────
//
// Al menos una porque una solicitud sin foto obliga a Jesús a ir a ver qué pasa. Cinco como tope
// porque son fotos de celular que van a un bucket privado, y el límite evita que una solicitud
// sola se lleve el espacio de un mes.

import { z } from 'zod';

/** De 1 a 5 fotos: ver la cabecera. */
export const MIN_FOTOS = 1;
export const MAX_FOTOS = 5;

const textoLimpio = (max: number) =>
  z.string().trim().min(1).max(max);

export const SolicitudMantencionSchema = z.object({
  codigoTienda: textoLimpio(20),
  /** Opcional y texto libre: hay lista sugerida, pero el supervisor puede escribir otra. */
  categoria: z.string().trim().max(60).optional().or(z.literal('')),
  descripcion: z.string().trim()
    .min(1, 'Contá qué pasa')
    .max(2000, 'La descripción es demasiado larga'),
  /** Rutas dentro del bucket privado, no URLs: las firmadas vencen. */
  fotos: z.array(z.string().trim().min(1))
    .min(MIN_FOTOS, 'Agregá al menos una foto')
    .max(MAX_FOTOS, `Máximo ${MAX_FOTOS} fotos`),
  /** Idempotencia de la cola offline. Ausente en las que carga Mantención por WhatsApp. */
  clientOpId: z.string().trim().min(1).max(100).optional(),
  origen: z.enum(['app', 'whatsapp']).default('app'),
});

export type SolicitudMantencion = z.infer<typeof SolicitudMantencionSchema>;

/**
 * ¿Esta tienda es de este supervisor?
 *
 * Va aparte del schema porque depende de un dato de la base. Se compara sin mayúsculas ni
 * espacios: el código puede llegar de un desplegable o de una cola vieja.
 */
export function tiendaPermitida(
  codigoTienda: string,
  misTiendas: readonly string[],
): boolean {
  const cod = String(codigoTienda ?? '').trim().toUpperCase();
  if (!cod) return false;
  return misTiendas.some(t => String(t ?? '').trim().toUpperCase() === cod);
}

/** El resultado de validar: o los datos limpios, o la lista de problemas en castellano. */
export type Validacion =
  | { ok: true; datos: SolicitudMantencion }
  | { ok: false; errores: string[] };

/**
 * Valida una solicitud entera: el schema y la pertenencia de la tienda.
 *
 * Devuelve TODOS los problemas y no el primero: en un celular, arreglar uno y que aparezca el
 * siguiente es la forma más rápida de que alguien abandone el formulario.
 */
export function validarSolicitud(
  entrada: unknown,
  misTiendas: readonly string[],
): Validacion {
  const r = SolicitudMantencionSchema.safeParse(entrada);
  if (!r.success) {
    return { ok: false, errores: r.error.issues.map(i => i.message) };
  }
  if (!tiendaPermitida(r.data.codigoTienda, misTiendas)) {
    return { ok: false, errores: ['Esa tienda no está entre las tuyas'] };
  }
  return { ok: true, datos: r.data };
}
