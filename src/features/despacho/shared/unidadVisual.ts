// Cómo se ve cada tipo de unidad en Bodega, y el avance de una tienda. Puro.
//
// ── UN COLOR, UN SIGNIFICADO ───────────────────────────────────────────────────────────────────
//
// Antes el azul era Pallet y también Aseo, y el ámbar era Bulto, Comida y "aviso". El color dejaba
// de decir algo. Ahora cada tipo de unidad tiene su color (`uni-*` en tailwind.config.js) y ningún
// estado lo usa; los estados tienen los suyos (`est-*`).
//
// Adquisición y web/retiro van en gris: no se pesan ni se miden, así que no compiten por un color
// con lo que sí hay que trabajar.
//
// Las clases van escritas enteras porque Tailwind solo genera las que encuentra literales.

export type ClaseUnidad = 'pallet' | 'bulto' | 'contenedor' | 'chocolate' | 'agregado';

/** Los dos nombres de tipo del sistema: Nacional (`pallet`, `box`…) y RM/Costa (`Pallet`, `Bulto`…). */
export function claseUnidad(tipo: string): ClaseUnidad {
  switch (tipo) {
    case 'pallet': case 'Pallet': case 'P': return 'pallet';
    case 'box': case 'bulto': case 'Bulto': case 'B': return 'bulto';
    case 'contenedor': case 'Contenedor': case 'C': return 'contenedor';
    case 'chocolate': case 'Chocolate': case 'CH': return 'chocolate';
    default: return 'agregado';
  }
}

export interface EstiloUnidad {
  /** Texto en el color del tipo. */
  texto: string;
  /** Fondo suave, para etiquetas. */
  suave: string;
  /** Borde en el color del tipo. */
  borde: string;
}

export const ESTILO_UNIDAD: Record<ClaseUnidad, EstiloUnidad> = {
  pallet:     { texto: 'text-uni-pallet',     suave: 'bg-uni-pallet-suave',     borde: 'border-uni-pallet' },
  bulto:      { texto: 'text-uni-bulto',      suave: 'bg-uni-bulto-suave',      borde: 'border-uni-bulto' },
  contenedor: { texto: 'text-uni-contenedor', suave: 'bg-uni-contenedor-suave', borde: 'border-uni-contenedor' },
  chocolate:  { texto: 'text-uni-chocolate',  suave: 'bg-uni-chocolate-suave',  borde: 'border-uni-chocolate' },
  agregado:   { texto: 'text-text-sub',       suave: 'bg-bg-2',                 borde: 'border-border-2' },
};

/** Letra corta del tipo, la misma que va impresa en la etiqueta de Picking. */
export const LETRA_UNIDAD: Record<Exclude<ClaseUnidad, 'agregado'>, string> = {
  pallet: 'P', bulto: 'B', contenedor: 'C', chocolate: 'CH',
};

export interface AvanceTipo {
  clase: Exclude<ClaseUnidad, 'agregado'>;
  pesadas: number;
  total: number;
}

export interface AvanceTienda {
  pesadas: number;
  total: number;
  /** Solo los tipos que la tienda tiene, en el orden de las tarjetas (P, C, B, CH). */
  porTipo: AvanceTipo[];
}

/**
 * Cuánto lleva una tienda.
 *
 * `unidades` son las que existen hoy para la tienda —guardadas o no— con `pesada` = ya tiene peso
 * real. `pendientesSinFila` son las que Picking imprimió y todavía no tienen ni tarjeta (los
 * "fantasmas"): cuentan en el total, porque también hay que pesarlas.
 *
 * Adquisición y web/retiro no entran: no se pesan, y contarlas haría que una tienda nunca llegue
 * al 100%.
 */
export function avanceTienda(
  unidades: { tipo: string; pesada: boolean }[],
  pendientesSinFila: Partial<Record<Exclude<ClaseUnidad, 'agregado'>, number>> = {},
): AvanceTienda {
  const orden: AvanceTipo['clase'][] = ['pallet', 'contenedor', 'bulto', 'chocolate'];
  const por = Object.fromEntries(orden.map(c => [c, { clase: c, pesadas: 0, total: pendientesSinFila[c] ?? 0 }])) as
    Record<AvanceTipo['clase'], AvanceTipo>;
  for (const u of unidades) {
    const c = claseUnidad(u.tipo);
    if (c === 'agregado') continue;
    por[c].total += 1;
    if (u.pesada) por[c].pesadas += 1;
  }
  const porTipo = orden.map(c => por[c]).filter(t => t.total > 0);
  return {
    pesadas: porTipo.reduce((s, t) => s + t.pesadas, 0),
    total:   porTipo.reduce((s, t) => s + t.total, 0),
    porTipo,
  };
}

/**
 * Qué tarjeta va abierta para trabajar.
 *
 * Primero la del último escaneo (`foco`): la persona tiene ESE pallet en la balanza. Después la
 * que eligió tocando la cola. Si ninguna de las dos sigue pendiente, la primera de la cola.
 */
export function idActiva<R extends { id: string; pickingSlotId?: number | null }>(
  pendientes: readonly R[],
  o: { foco?: number | null; elegida?: string | null },
): string | null {
  if (o.foco != null) {
    const r = pendientes.find(p => p.pickingSlotId === o.foco);
    if (r) return r.id;
  }
  if (o.elegida && pendientes.some(p => p.id === o.elegida)) return o.elegida;
  return pendientes[0]?.id ?? null;
}
