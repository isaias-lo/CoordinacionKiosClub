// Varios datos por encargado en una tabla con una sola fila por encargado.
//
// `picking_session_state` guarda el nombre del picker, y desde el batch manual guarda también el
// número de agrupación. La intención era separarlos por la columna `tipo` — pero la PRIMARY KEY es
// `(state_key, date)`, sin `tipo`, y el upsert usa `onConflict: 'state_key,date'`.
//
// Resultado: escribir el batch PISA la fila del nombre. `picker_label` pasa a ser el número y
// `tipo` pasa a 'batch', así que el nombre deja de sincronizarse entre equipos y no vuelve al
// recargar. Verificado en producción: 25 filas quedaron con `tipo='batch'`.
//
// Se resuelve sin migración, metiendo el tipo en la propia clave. El nombre —que es el uso
// original y tiene cientos de filas— conserva su clave tal cual; los usos nuevos van con sufijo.
// Así nada de lo que ya existe se mueve, y el día que la PK incluya `tipo` se puede quitar el
// sufijo sin perder nada.
//
// Puro y testeable: no toca red ni base.

/** El `tipo` del nombre del picker. Es el uso original y su clave NO lleva sufijo. */
export const TIPO_NOMBRE = 'P';

/**
 * Los dos usos que conservan la clave pelada, por volumen y antigüedad: el nombre del picker
 * (cientos de filas desde mayo) y el progreso de Odoo (miles desde junio). Cambiarles la clave
 * obligaría a migrar; dejarlos quietos no le cuesta nada a nadie.
 *
 * Cualquier uso NUEVO lleva sufijo. No es una preferencia de estilo: es lo único que impide que
 * dos usos distintos peleen por la misma fila, porque la PK de la tabla es `(state_key, date)`.
 */
const TIPOS_SIN_SUFIJO = new Set([TIPO_NOMBRE, 'odoo-progress']);

/**
 * La clave con la que guardar un dato.
 *
 * Los dos usos veteranos van sin sufijo para no mover lo que ya existe; el resto lleva el suyo,
 * y así deja de competir por la misma fila.
 */
export function claveSesion(stateKey: string, tipo: string): string {
  const t = String(tipo ?? '').trim() || TIPO_NOMBRE;
  return TIPOS_SIN_SUFIJO.has(t) ? stateKey : `${stateKey}::${t}`;
}

/**
 * De una fila leída de la tabla, a qué encargado y qué dato corresponde.
 *
 * Acepta las filas VIEJAS —guardadas antes del sufijo, con la clave pelada y `tipo='batch'`— para
 * no perder los batches ya cargados. Por eso el sufijo se quita solo si está.
 */
export function parseClaveSesion(
  fila: { state_key: string; tipo?: string | null },
): { stateKey: string; tipo: string } {
  const tipo = String(fila?.tipo ?? '').trim() || TIPO_NOMBRE;
  const clave = String(fila?.state_key ?? '');
  const sufijo = `::${tipo}`;
  const stateKey = !TIPOS_SIN_SUFIJO.has(tipo) && clave.endsWith(sufijo)
    ? clave.slice(0, -sufijo.length)
    : clave;
  return { stateKey, tipo };
}
