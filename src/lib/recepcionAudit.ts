/**
 * Auditoría de ediciones de una recepción de tienda. Puro y testeable.
 *
 * Regla de accountability (requerida por el usuario): al EDITAR una recepción ya recibida,
 * la persona se re-identifica (nombre + RUT obligatorios y en blanco) y NO puede ver ni tocar
 * a la persona anterior. Cada edición registra SU PROPIO receptor+rut en `historial_ediciones`,
 * junto con los campos que cambió. El `receptor`/`rut` de la fila principal (quien recibió
 * originalmente) NO se sobreescribe — así queda el rastro de todas las personas.
 */

export interface CamposRecepcion {
  pallets_recibidos?: number | null;
  bultos_recibidos?: number | null;
  contenedores_recibidos?: number | null;
  acuse_recibo?: string | null;
  observaciones?: string | null;
}

export interface CambioCampo {
  campo: string;
  de: string | number | null;
  a: string | number | null;
}

export interface EdicionEntry {
  ts: string;
  receptor: string;
  rut: string;
  cambios: CambioCampo[];
  /** id de la operación cliente — permite que un reintento offline de la MISMA edición no
   *  duplique la entrada en el historial. */
  clientOpId?: string;
}

const LABELS: Record<keyof CamposRecepcion, string> = {
  pallets_recibidos:      'Pallets recibidos',
  bultos_recibidos:       'Bultos recibidos',
  contenedores_recibidos: 'Contenedores recibidos',
  acuse_recibo:           'Acuse',
  observaciones:          'Observaciones',
};

function norm(v: unknown): string | number | null {
  if (v === undefined || v === null || v === '') return null;
  return typeof v === 'number' ? v : String(v);
}

/** Diferencia campo-a-campo entre el estado previo y el nuevo (solo los que cambian). */
export function diffCampos(prev: CamposRecepcion, next: CamposRecepcion): CambioCampo[] {
  const cambios: CambioCampo[] = [];
  for (const key of Object.keys(LABELS) as (keyof CamposRecepcion)[]) {
    const de = norm(prev[key]);
    const a  = norm(next[key]);
    if (de !== a) cambios.push({ campo: LABELS[key], de, a });
  }
  return cambios;
}

/** Construye una entrada de auditoría para agregar a `historial_ediciones`. */
export function buildEdicionEntry(params: {
  prev: CamposRecepcion;
  next: CamposRecepcion;
  receptor: string;
  rut: string;
  ts?: string;
  clientOpId?: string;
}): EdicionEntry {
  const { prev, next, receptor, rut, ts, clientOpId } = params;
  const entry: EdicionEntry = {
    ts: ts ?? new Date().toISOString(),
    receptor: receptor.trim(),
    rut: rut.trim(),
    cambios: diffCampos(prev, next),
  };
  if (clientOpId) entry.clientOpId = clientOpId;
  return entry;
}
