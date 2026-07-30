/**
 * Lógica pura del estado de SEGUIMIENTO que resulta de un registro de recepción/entrega.
 * Extraída de `src/app/api/recepcion/route.ts` para poder testearla sin red ni Supabase.
 *
 * Estados válidos del semáforo (columna `seguimiento` en despacho_rm/despacho_regiones):
 *   Registrado → Pendiente → En camino → Entregado → Recibido | Diferencia
 */

export const SEGUIMIENTO_VALIDOS = [
  'Registrado', 'Pendiente', 'En camino', 'Entregado', 'Recibido', 'Diferencia',
] as const;
export type Seguimiento = (typeof SEGUIMIENTO_VALIDOS)[number];

const VALIDOS = new Set<string>(SEGUIMIENTO_VALIDOS);
export function esSeguimientoValido(v: unknown): v is Seguimiento {
  return typeof v === 'string' && VALIDOS.has(v);
}

export interface Cantidades {
  pallets: number;
  bultos: number;
  contenedores: number;
}

/** Hay diferencia si NO coinciden pallets, bultos o contenedores. */
export function hayDiferencia(enviado: Cantidades, recibido: Cantidades): boolean {
  return (
    (enviado.pallets      ?? 0) !== (recibido.pallets      ?? 0) ||
    (enviado.bultos       ?? 0) !== (recibido.bultos       ?? 0) ||
    (enviado.contenedores ?? 0) !== (recibido.contenedores ?? 0)
  );
}

/**
 * Estado de seguimiento resultante de un POST a /api/recepcion.
 *
 * - `origen === 'tienda'`: la TIENDA confirma su recepción (QR+OTP). Se compara lo
 *   enviado vs lo que la tienda dice haber recibido (mismo registro):
 *   coincide → 'Recibido'; difiere → 'Diferencia'.
 * - otro origen (chofer / entrega): si la tienda YA registró su recepción hoy
 *   (`recibidoTiendaPrevio != null`) se respeta ese resultado (Recibido/Diferencia);
 *   si aún no recibió → 'Entregado' (el chofer entregó, falta que la tienda confirme).
 */
export function nuevoSeguimientoRecepcion(params: {
  origen: string;
  enviado: Cantidades;
  recibido: Cantidades;
  recibidoTiendaPrevio: Cantidades | null;
}): 'Entregado' | 'Recibido' | 'Diferencia' {
  const { origen, enviado, recibido, recibidoTiendaPrevio } = params;

  if (origen === 'tienda') {
    return hayDiferencia(enviado, recibido) ? 'Diferencia' : 'Recibido';
  }
  if (recibidoTiendaPrevio) {
    return hayDiferencia(enviado, recibidoTiendaPrevio) ? 'Diferencia' : 'Recibido';
  }
  return 'Entregado';
}

export interface DespachoCandidato {
  fecha: string | null;
  seguimiento: string | null;
  created_at: string | null;
}

const RANK = new Map<string, number>(SEGUIMIENTO_VALIDOS.map((s, i): [string, number] => [s, i]));
function rankAvance(s: string | null): number {
  return RANK.get(s ?? '') ?? -1;
}

/**
 * Elige la FECHA del despacho que una recepción debe actualizar, cuando una misma tienda
 * (cod) puede tener despachos en varios días (2ª vuelta / entrega cruzada de día).
 *
 * Regla: preferir un despacho ACTIVO (no 'Recibido'/'Diferencia'); entre los activos, el
 * MÁS AVANZADO (Entregado > En camino > Pendiente > Registrado) y, a igual avance, el más
 * reciente por `created_at`. Así una recepción no re-marca un despacho ya recibido ni pisa
 * un despacho fresco recién armado cuando existe otro ya en ruta/entregado.
 *
 * Limitación conocida: si dos despachos de la misma tienda están al mismo nivel (típico:
 * ambos 'Pendiente' porque el conductor no marcó 'iniciar recorrido'), no hay forma de
 * distinguirlos sin la identidad del despacho → se toma el más reciente.
 */
export function elegirFechaDespacho(candidatos: DespachoCandidato[]): string | null {
  if (!candidatos.length) return null;
  const activos = candidatos.filter(
    c => c.seguimiento !== 'Recibido' && c.seguimiento !== 'Diferencia',
  );
  const pool = activos.length ? activos : candidatos;
  const best = [...pool].sort((a, b) => {
    const ra = rankAvance(a.seguimiento), rb = rankAvance(b.seguimiento);
    if (rb !== ra) return rb - ra;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  })[0];
  return best.fecha ?? null;
}
