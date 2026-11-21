// Lo que decide el formulario de una solicitud nueva, fuera del componente. Módulo puro.

import { MAX_FOTOS, MIN_FOTOS } from './validarSolicitud';
import { normalizarCategoria } from './duplicados';
import { esAbierta } from './conversacion';
import type { SolicitudMant } from '../tipos';

/**
 * Lo que falta para poder enviar, en el orden del formulario.
 *
 * El botón de enviar dice qué falta en vez de quedar gris sin explicación: en un celular, un botón
 * apagado sin motivo se lee como «la app no funciona».
 */
export function faltaParaEnviar(f: { tienda: string; descripcion: string; fotos: number }): string[] {
  const falta: string[] = [];
  if (!f.tienda.trim()) falta.push('elegir la tienda');
  if (!f.descripcion.trim()) falta.push('contar qué pasa');
  if (f.fotos < MIN_FOTOS) falta.push('al menos una foto');
  if (f.fotos > MAX_FOTOS) falta.push(`quitar fotos (máximo ${MAX_FOTOS})`);
  return falta;
}

/** El título de una solicitud en la lista: la primera línea de lo que escribió la tienda. */
export function tituloDeSolicitud(descripcion: string, max = 80): string {
  const primera = (descripcion ?? '').trim().split(/\r?\n/)[0].trim();
  if (primera.length <= max) return primera;
  return `${primera.slice(0, max - 1).trimEnd()}…`;
}

/**
 * La solicitud abierta de la misma tienda y categoría que la que se está por crear, si hay.
 *
 * Es la misma regla que marca duplicados para Mantención (`duplicados.ts`): misma tienda, misma
 * categoría y abierta; sin categoría no se avisa. Acá solo AVISA: la tienda puede enviar igual,
 * porque «dos cosas eléctricas» no son necesariamente la misma cosa. Si lo es, Mantención las une.
 */
export function posibleDuplicadoAlCrear(
  nueva: { codigoTienda: string; categoria: string },
  existentes: readonly SolicitudMant[],
): SolicitudMant | null {
  const cat = normalizarCategoria(nueva.categoria);
  if (!cat) return null;
  const cod = nueva.codigoTienda.trim().toUpperCase();
  if (!cod) return null;
  const candidatas = existentes
    .filter(s => esAbierta(s.estado)
      && s.codigoTienda.trim().toUpperCase() === cod
      && normalizarCategoria(s.categoria) === cat)
    .sort((a, b) => a.creadaEn.localeCompare(b.creadaEn));
  return candidatas[0] ?? null;
}
