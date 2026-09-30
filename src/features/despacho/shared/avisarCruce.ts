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

/** El texto del aviso cuando el cruce no se pudo escribir, o `null` si salió bien. */
export function mensajeDeFalloDelCruce(r: RespuestaSync | null | undefined): string | null {
  // Sin bloque `cruce` no se pidió, o la respuesta es de una versión anterior: no se inventa un
  // error donde no hay información.
  if (!r?.cruce) return null;
  if (r.cruce.ok) return null;
  return '⚠ El día quedó registrado, pero no se pudo escribir la hoja CRUCE PESOS. '
       + 'Avisa para recargarla — no se perdió nada de lo registrado.';
}

/**
 * Lee la respuesta del sync y devuelve el aviso, si hace falta.
 *
 * No lanza nunca: el día ya quedó registrado y el cruce es un informe derivado. Mismo criterio que
 * `logActividad`.
 */
export async function leerResultadoDelCruce(res: Response | void): Promise<string | null> {
  try {
    if (!res || typeof (res as Response).json !== 'function') return null;
    const json = await (res as Response).json() as RespuestaSync;
    const aviso = mensajeDeFalloDelCruce(json);
    if (aviso) console.error('[cruce-pesos]', json.cruce?.error);
    return aviso;
  } catch {
    return null;
  }
}
