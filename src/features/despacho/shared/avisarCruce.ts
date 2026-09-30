// Qué hacer con la respuesta del REGISTRAR en lo que toca al CRUCE PESOS.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────
//
// El coordinador apretó REGISTRAR en Bodega Nacional y la hoja no se llenó. La primera vez fue
// porque el código del cruce nunca se había mergeado. La segunda —RM/Costa, el mismo día— fue peor,
// porque el código YA estaba: el registro quedó bien en la base, la hoja se quedó vacía, y no hubo
// ni un aviso en ninguna parte.
//
// La causa era la cadena en el cliente:
//
//     sheetsWrite  →  fetch(sync-despacho)  →  fetch(cruce-pesos)
//
// El tercer eslabón solo se EMITE si el segundo resolvió, así que navegar apenas registrar lo
// mataba antes de salir; `keepalive` protege lo ya enviado, no lo que todavía no se envió. Y el
// `.catch(() => {})` del final se tragaba cualquier error.
//
// Ahora la escritura la hace el servidor dentro de `sync-despacho` (una sola petición, el orden
// garantizado ahí), y lo único que queda de este lado es MIRAR LA RESPUESTA. Que es lo que faltaba:
// un informe que falla en silencio es peor que no tenerlo, porque se confía en él.

export interface RespuestaSync {
  ok?: boolean;
  cruce?: { ok: boolean; agregadas?: number; actualizadas?: number; error?: string };
}

/** El aviso, en un solo lugar: lo usan la respuesta y el `catch` de quien llama. */
export const AVISO_CRUCE = '⚠ El día quedó registrado, pero no se pudo escribir la hoja CRUCE '
  + 'PESOS. Avisa para recargarla — no se perdió nada de lo registrado.';

/**
 * El texto del aviso cuando el cruce no se pudo escribir, o `null` si salió bien.
 *
 * `sePidio` dice si esta llamada IBA a escribir el cruce (mandó `{ cruce: <fecha> }`). Importa
 * porque una respuesta SIN el bloque `cruce` significa cosas opuestas según el caso:
 *
 *   · no se pidió        → no hay nada que avisar;
 *   · se pidió y no vino → la petición no llegó a ejecutarlo — un 500, un timeout, un deploy a
 *                            medias — y hay que avisar, porque la hoja quedó sin la fila.
 *
 * Sin ese matiz, todo lo segundo caía en `return null` y el 30/09 pasó exactamente eso: el
 * coordinador apretó REGISTRAR en Nacional, los pesos llegaron a la base, la hoja se quedó sin
 * las 21 filas del día y **no apareció ningún aviso**. Es justo lo que la cabecera de este archivo
 * dice que hay que evitar: un informe que falla en silencio es peor que no tenerlo.
 */
export function mensajeDeFalloDelCruce(
  r: RespuestaSync | null | undefined, sePidio = false,
): string | null {
  if (r?.cruce) return r.cruce.ok ? null : AVISO_CRUCE;
  return sePidio ? AVISO_CRUCE : null;
}

/**
 * Lee la respuesta del sync y devuelve el aviso, si hace falta.
 *
 * No lanza nunca: el día ya quedó registrado y el cruce es un informe derivado. Mismo criterio que
 * `logActividad`.
 */
export async function leerResultadoDelCruce(res: Response | void): Promise<string | null> {
  // Se llama SIEMPRE después de pedir el cruce, así que cualquier respuesta que no lo traiga —o
  // que ni siquiera sea una respuesta, porque el fetch se cayó— es un fallo que hay que avisar.
  try {
    if (!res || typeof (res as Response).json !== 'function') return AVISO_CRUCE;
    const json = await (res as Response).json() as RespuestaSync;
    const aviso = mensajeDeFalloDelCruce(json, true);
    if (aviso) console.error('[cruce-pesos]', json.cruce?.error ?? 'la respuesta no trajo el cruce');
    return aviso;
  } catch {
    return AVISO_CRUCE;   // respuesta ilegible: tampoco se escribió
  }
}
