// [Registros dobles] Cuando el Enrutador cierra un camión ANTES de que Bodega registre, deja filas
// de RESPALDO en DESPACHO (ids `R…`/`ENR-…`: agregadas, con ruteo pero SIN dimensiones). Al registrar
// Bodega después, sus filas por-pallet (`P…`/`1B…`/`CH…`) deben HEREDAR el ruteo de ese respaldo, y
// el respaldo debe ELIMINARSE — si no, quedan dos juegos de filas para el mismo despacho, cada uno
// con la mitad de la información. Todo esto es puro y testeable; la I/O (leer/append/borrar hoja) la
// hace el endpoint.

/** Índices 0 de las columnas de RUTEO en DESPACHO RM/REGIONES (A=0 … Z=25). */
export const COL_RUTEO = {
  transporte: 6,  // G
  patente:    7,  // H
  estado:     18, // S
  conductor:  21, // V
  ruta:       22, // W
  supervisor: 23, // X
} as const;

export interface Ruteo {
  transporte: string; patente: string; estado: string; conductor: string; ruta: string; supervisor: string;
}

/** Fila de respaldo del Enrutador tal como se lee de la hoja (1-indexed en `fila`). */
export interface FilaRespaldo extends Ruteo {
  fila: number;
  id: string;
  fecha: string;
  cod: string;
}

/**
 * ¿El id es una fila de RESPALDO del Enrutador? Formatos: `R{ruta}{cod}{fecha}{P|B}` (p. ej.
 * `R101TPS29082026P`) o `ENR-{fecha}-{cod}`. Las de Bodega empiezan con P/C/CH/{dígito}B, nunca así.
 */
export function esRespaldoEnrutador(id: string): boolean {
  return /^(R\d|ENR-)/.test(String(id ?? '').trim());
}

/**
 * Decide qué ruteo heredan las filas de Bodega y qué filas de respaldo borrar.
 * @param claves   "fecha::cod" de los registros que Bodega va a escribir.
 * @param respaldo filas de respaldo leídas de la hoja.
 */
export function reconciliarRespaldo(
  claves: Set<string>,
  respaldo: FilaRespaldo[],
): { ruteoPorClave: Map<string, Ruteo>; filasABorrar: number[]; idsABorrar: string[] } {
  const ruteoPorClave = new Map<string, Ruteo>();
  const filasABorrar: number[] = [];
  const idsABorrar: string[] = [];

  for (const r of respaldo) {
    if (!esRespaldoEnrutador(r.id)) continue;
    const clave = `${r.fecha}::${r.cod}`;
    if (!claves.has(clave)) continue; // solo el respaldo de las tiendas que Bodega está escribiendo
    // Todas las R… de una tienda comparten ruteo → basta la primera.
    if (!ruteoPorClave.has(clave)) {
      ruteoPorClave.set(clave, {
        transporte: r.transporte, patente: r.patente, estado: r.estado,
        conductor: r.conductor, ruta: r.ruta, supervisor: r.supervisor,
      });
    }
    filasABorrar.push(r.fila);
    idsABorrar.push(r.id);
  }
  // Descendente: borrar de abajo hacia arriba no corre los índices de las filas de arriba.
  filasABorrar.sort((a, b) => b - a);
  return { ruteoPorClave, filasABorrar, idsABorrar };
}

// El ruteo del respaldo es la decisión REAL del Enrutador (el camión que el coordinador cerró), así
// que PREVALECE sobre el transporte por defecto que Bodega pone a ciegas — pero solo con valores
// no-vacíos (un campo vacío del respaldo, p. ej. sin conductor, no borra lo que ya había).

/** Escribe las columnas de ruteo de una fila (array posicional) con los valores no-vacíos del respaldo. */
export function aplicarRuteoAFila(row: (string | number)[], ruteo: Ruteo): (string | number)[] {
  const out = [...row];
  while (out.length <= COL_RUTEO.supervisor) out.push('');
  const set = (i: number, v: string) => { if (v && String(v).trim()) out[i] = v; };
  set(COL_RUTEO.transporte, ruteo.transporte);
  set(COL_RUTEO.patente,    ruteo.patente);
  set(COL_RUTEO.estado,     ruteo.estado);
  set(COL_RUTEO.conductor,  ruteo.conductor);
  set(COL_RUTEO.ruta,       ruteo.ruta);
  set(COL_RUTEO.supervisor, ruteo.supervisor);
  return out;
}

/** Escribe los campos de ruteo de un record (objeto para Supabase) con los valores no-vacíos del respaldo. */
export function aplicarRuteoARecord<T extends Record<string, unknown>>(rec: T, ruteo: Ruteo): T {
  const out: Record<string, unknown> = { ...rec };
  const set = (k: string, v: string) => { if (v && String(v).trim()) out[k] = v; };
  set('transporte', ruteo.transporte);
  set('patente',    ruteo.patente);
  set('estado',     ruteo.estado);
  set('conductor',  ruteo.conductor);
  set('ruta',       ruteo.ruta);
  set('supervisor', ruteo.supervisor);
  return out as T;
}
