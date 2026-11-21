// Lo que Mantención puede hacer con una solicitud en la Fase 1, y cuándo se puede. Módulo puro.
//
// La Fase 1 solo usa `pendiente` y `descartada` (docs/PROMPT_Mantencion_Fase1.md): programar,
// ejecutar y cerrar llegan con las rutas en la Fase 2. Por eso acá no hay «cambiar estado» libre:
// cada acción es una decisión con nombre, y cada una deja su línea en la bitácora.

import { z } from 'zod';
import { URGENCIAS, type SolicitudMant } from '../tipos';
import { esTrabajoAbierto } from './tablero';

export const AccionSchema = z.discriminatedUnion('accion', [
  /** Leve, media o urgente. Solo Mantención: la tienda nunca clasifica. */
  z.object({ accion: z.literal('clasificar'), urgencia: z.enum(URGENCIAS) }),
  /** No se va a hacer: queda registrada y deja de contar. */
  z.object({ accion: z.literal('descartar') }),
  /** Es la misma que otra: queda unida a la original y deja de contar. */
  z.object({ accion: z.literal('unir'), originalId: z.string().uuid() }),
  /** Se parecen, pero son dos problemas distintos: el par no se vuelve a marcar. */
  z.object({ accion: z.literal('no_duplicado'), originalId: z.string().uuid() }),
]);

export type AccionSolicitud = z.infer<typeof AccionSchema>;

/**
 * Por qué esta acción no se puede hacer sobre esta solicitud, o `null` si se puede.
 *
 * Una solicitud cerrada, descartada o ya unida no se toca: lo que pasó con ella ya está en la
 * bitácora, y cambiarla ahora reescribiría la historia.
 */
export function motivoParaNo(
  accion: AccionSolicitud,
  solicitud: SolicitudMant,
  original?: SolicitudMant | null,
): string | null {
  if (!esTrabajoAbierto(solicitud)) return 'La solicitud ya no está abierta';
  if (accion.accion === 'unir' || accion.accion === 'no_duplicado') {
    if (!original) return 'La solicitud original no existe';
    if (original.id === solicitud.id) return 'Una solicitud no puede ser duplicado de sí misma';
    if (original.codigoTienda.toUpperCase() !== solicitud.codigoTienda.toUpperCase()) {
      return 'Solo se unen solicitudes de la misma tienda';
    }
    if (accion.accion === 'unir' && !esTrabajoAbierto(original)) {
      return 'La original ya no está abierta: no hay a qué unirla';
    }
  }
  return null;
}

/** Lo que cambia en la fila y lo que queda en la bitácora, para cada acción. */
export function efectoDeAccion(accion: AccionSolicitud, s: SolicitudMant): {
  cambios: Record<string, unknown>;
  eventos: Array<{ campo: string; anterior: string | null; nuevo: string | null }>;
} {
  switch (accion.accion) {
    case 'clasificar':
      return {
        cambios: { urgencia: accion.urgencia },
        eventos: [{ campo: 'urgencia', anterior: s.urgencia, nuevo: accion.urgencia }],
      };
    case 'descartar':
      return {
        cambios: { estado: 'descartada' },
        eventos: [{ campo: 'estado', anterior: s.estado, nuevo: 'descartada' }],
      };
    case 'unir':
      return {
        cambios: { duplicada_de: accion.originalId, estado: 'descartada' },
        eventos: [
          { campo: 'duplicada_de', anterior: s.duplicadaDe, nuevo: accion.originalId },
          { campo: 'estado', anterior: s.estado, nuevo: 'descartada' },
        ],
      };
    case 'no_duplicado':
      // No cambia la fila: la decisión vive solo en la bitácora (ver la cabecera de tablero.ts).
      return { cambios: {}, eventos: [{ campo: 'no_es_duplicado', anterior: null, nuevo: accion.originalId }] };
  }
}
