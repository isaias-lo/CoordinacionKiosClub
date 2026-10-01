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


/**
 * Escribe CRUCE PESOS del día, por su cuenta.
 *
 * ── POR QUÉ NO VIAJA MÁS ADENTRO DEL SYNC (30/09/2026) ─────────────────────────────────────────
 *
 * El cruce vivía dentro de `sync-despacho`, después del volcado de las hojas. Se hizo así en el
 * #619 para que el orden lo garantizara el servidor — antes eran tres peticiones encadenadas y la
 * tercera no alcanzaba a salir si la persona navegaba.
 *
 * Eso resolvió aquello y creó esto: el cruce pasó a ser rehén de una operación que engorda sola.
 * `sync-despacho` manda a Supabase LA PLANILLA ENTERA en cada llamada, y esas hojas solo crecen.
 * Medido el 30/09: **8.986 filas · 4,66 MB** por delante del cruce, dentro de un presupuesto de
 * 60 segundos. El cruce solo tarda 8.
 *
 * Ese día los dos registros —Nacional a las 17:57 y RM/Costa a las 18:57— dejaron sus pesos bien
 * en la base y la hoja se quedó vacía las dos veces.
 *
 * ── POR QUÉ SEPARARLO NO TRAE DE VUELTA EL BUG DEL #619 ────────────────────────────────────────
 *
 * Aquel se rompía porque el tercer eslabón **solo se emitía si el segundo resolvía**: la pestaña
 * se iba antes de que esa petición saliera, y `keepalive` protege lo que ya se envió, no lo que
 * todavía no se envió.
 *
 * Acá las dos peticiones **salen juntas**, apenas resuelve la escritura de la planilla. Ninguna
 * espera a la otra, así que no hay cadena que cortar.
 *
 * Y el cruce puede correr sin esperar al sync porque no lo necesita: lee `despacho_rm` /
 * `despacho_regiones`, y ahí los pesos ya los dejó el espejo de `sheets-write`. El 30/09 estaban
 * en la base a las 18:58:02, diecisiete segundos después del REGISTRAR.
 *
 * Devuelve el aviso para mostrar, o `null` si salió bien. No lanza nunca.
 */
export async function escribirCruceDelDia(fechaISO: string): Promise<string | null> {
  try {
    const res = await fetch('/api/cruce-pesos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: fechaISO }),
      keepalive: true,
    });
    if (!res.ok) {
      console.error('[cruce-pesos] HTTP', res.status);
      return AVISO_CRUCE;
    }
    const json = await res.json() as { ok?: boolean; error?: string };
    if (json?.ok) return null;
    console.error('[cruce-pesos]', json?.error ?? 'la respuesta no trajo ok');
    return AVISO_CRUCE;
  } catch (e) {
    console.error('[cruce-pesos]', e);
    return AVISO_CRUCE;
  }
}
