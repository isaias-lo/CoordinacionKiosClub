// Lo que ve la tienda de cada solicitud: el estado, las preguntas que la esperan y el historial.
// Módulo puro.
//
// ── LA NOTA PARA EL TÉCNICO NO ES PARA LA TIENDA ──────────────────────────────────────────────
//
// Mantención deja notas (`nota_mantencion`) que son instrucciones para el técnico: «llevar
// escalera», «el cilindro es de 70 mm». No son una conversación con la tienda, así que su pantalla
// no las muestra. No es un secreto —el RLS las deja leer—, es ruido para quien no las va a usar.

import { fechaChileDe } from '@/lib/fechaChile';
import type { ComentarioMant, EstadoSolicitud, Urgencia } from '../tipos';

/** Estados en que la solicitud ya no espera nada de nadie. `no_resuelta` vuelve a programarse. */
const TERMINADOS: readonly EstadoSolicitud[] = ['cerrada', 'descartada'];

export function esAbierta(estado: EstadoSolicitud): boolean {
  return !TERMINADOS.includes(estado);
}

export type Tono = 'neutro' | 'ambar' | 'azul' | 'verde' | 'gris' | 'rojo';

const ETIQUETA: Record<EstadoSolicitud, { texto: string; tono: Tono }> = {
  pendiente:    { texto: 'Pendiente',    tono: 'neutro' },
  programada:   { texto: 'Programada',   tono: 'azul'   },
  en_ejecucion: { texto: 'En ejecución', tono: 'azul'   },
  por_cerrar:   { texto: 'Por cerrar',   tono: 'azul'   },
  cerrada:      { texto: 'Cerrada',      tono: 'verde'  },
  no_resuelta:  { texto: 'No resuelta',  tono: 'ambar'  },
  descartada:   { texto: 'Descartada',   tono: 'gris'   },
};

/**
 * El estado como lo ve la tienda. «Por enviar» le gana a todo: es una solicitud que está en el
 * celular y todavía no existe en el servidor.
 *
 * Una solicitud unida a otra queda `descartada` en la base, pero para la tienda «descartada» se
 * lee como «no la van a hacer», y no es así: se hace, dentro de la otra. Por eso tiene su texto.
 */
export function estadoParaTienda(
  estado: EstadoSolicitud,
  opciones: { porEnviar?: boolean; unida?: boolean } = {},
): { texto: string; tono: Tono } {
  if (opciones.porEnviar) return { texto: 'Por enviar', tono: 'ambar' };
  if (opciones.unida) return { texto: 'Unida a otra', tono: 'gris' };
  return ETIQUETA[estado] ?? { texto: estado, tono: 'neutro' };
}

/** Los comentarios que la tienda ve: todos menos las notas para el técnico (ver la cabecera). */
export function comentariosParaTienda(comentarios: readonly ComentarioMant[]): ComentarioMant[] {
  return comentarios.filter(c => c.tipo !== 'nota_mantencion');
}

const porFecha = (a: ComentarioMant, b: ComentarioMant) =>
  a.creadoEn.localeCompare(b.creadoEn) || a.id - b.id;

/**
 * Las preguntas de Mantención que todavía no tienen respuesta: las que van arriba, en «Te esperan».
 *
 * Una pregunta queda respondida con cualquier respuesta POSTERIOR en la misma solicitud. Una
 * respuesta anterior no cuenta: si Mantención vuelve a preguntar, es porque la anterior no alcanzó.
 */
export function preguntasSinResponder(comentarios: readonly ComentarioMant[]): ComentarioMant[] {
  const porSolicitud = new Map<string, ComentarioMant[]>();
  for (const c of comentarios) {
    const lista = porSolicitud.get(c.solicitudId) ?? [];
    lista.push(c);
    porSolicitud.set(c.solicitudId, lista);
  }
  const pendientes: ComentarioMant[] = [];
  for (const lista of porSolicitud.values()) {
    const orden = [...lista].sort(porFecha);
    orden.forEach((c, i) => {
      if (c.tipo !== 'pregunta') return;
      const respondida = orden.slice(i + 1).some(o => o.tipo === 'respuesta');
      if (!respondida) pendientes.push(c);
    });
  }
  return pendientes.sort(porFecha);
}

/** «hoy», «ayer» o «hace N días», contando días de Chile y no horas. */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const dia = fechaChileDe(iso);
  const hoy = fechaChileDe(ahora);
  if (!dia || !hoy) return '';
  const dias = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/**
 * El historial de una solicitud tal como lo lee la tienda, de lo más viejo a lo más nuevo.
 *
 * La última línea dice qué se está esperando, porque es lo que la tienda viene a averiguar.
 */
export function historialParaTienda(
  solicitud: { creadaEn: string; estado: EstadoSolicitud; urgencia: Urgencia | null; duplicadaDe?: string | null },
  comentarios: readonly ComentarioMant[],
  ahora: Date = new Date(),
): string[] {
  const lineas = [`Ingresada por la tienda · ${haceCuanto(solicitud.creadaEn, ahora)}`];
  const propios = comentariosParaTienda(comentarios).sort(porFecha);
  for (const c of propios) {
    if (c.tipo === 'pregunta') lineas.push(`Mantención pregunta: ${c.texto}`);
    else lineas.push(`Respuesta de la tienda: ${c.texto}`);
  }
  if (solicitud.duplicadaDe) {
    lineas.push('Mantención la unió a otra solicitud igual de esta tienda: se resuelve junto con esa');
    return lineas;
  }
  if (preguntasSinResponder(propios).length) {
    lineas.push('Mantención espera tu respuesta');
    return lineas;
  }
  switch (solicitud.estado) {
    case 'pendiente':
      lineas.push(solicitud.urgencia
        ? 'En espera de que Mantención la programe'
        : 'Mantención la está revisando para asignarle urgencia');
      break;
    case 'programada':   lineas.push('Programada en una ruta de Mantención'); break;
    case 'en_ejecucion': lineas.push('El técnico está trabajando en ella'); break;
    case 'por_cerrar':   lineas.push('El técnico terminó; Mantención revisa el trabajo'); break;
    case 'cerrada':      lineas.push('Mantención dio el cierre'); break;
    case 'no_resuelta':  lineas.push('No se pudo resolver en la visita; se vuelve a programar'); break;
    case 'descartada':   lineas.push('Mantención la descartó'); break;
  }
  return lineas;
}
