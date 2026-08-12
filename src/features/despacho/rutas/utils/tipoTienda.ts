/* ── Tipo de tienda (Mall / Strip Center / Street / …) ────────────────────────
   Normaliza el `tipo` (texto libre de la BD) a una etiqueta + color para mostrar en el
   Planificador. Si el `tipo` viene vacío, deriva de la dirección/zona (misma heurística
   que CalendarioColumnas: "local" en la dirección → Mall; zona Costa/Región). Puro y testeable. */

export type TipoTiendaKey = 'mall' | 'strip' | 'street' | 'costa' | 'region' | 'otro';

export interface TipoTiendaInfo { key: TipoTiendaKey; label: string; color: string }

const TIPOS: Record<TipoTiendaKey, TipoTiendaInfo> = {
  mall:   { key: 'mall',   label: 'Mall',         color: '#1E40AF' },
  strip:  { key: 'strip',  label: 'Strip Center', color: '#7C3AED' },
  street: { key: 'street', label: 'Street',       color: '#475569' },
  costa:  { key: 'costa',  label: 'Costa',        color: '#2563EB' },
  region: { key: 'region', label: 'Región',       color: '#D97706' },
  otro:   { key: 'otro',   label: 'Otro',         color: '#64748B' },
};

/** Clasifica una tienda para el badge del Planificador. Prioriza el `tipo` de la BD; si viene
 *  vacío, deriva de dirección (`d`) y zona (`z`). Un `tipo` desconocido se muestra tal cual (otro). */
export function tipoTienda(raw?: string | null, direccion?: string | null, zona?: string | null): TipoTiendaInfo {
  const t = (raw ?? '').trim();
  const tl = t.toLowerCase();
  const d = (direccion ?? '').toLowerCase();
  const z = (zona ?? '').toLowerCase();

  if (/\bmall\b/.test(tl)) return TIPOS.mall;
  if (/strip/.test(tl))    return TIPOS.strip;
  if (/street|calle/.test(tl)) return TIPOS.street;
  if (tl === 'costa')      return TIPOS.costa;
  if (tl === 'region' || tl === 'región') return TIPOS.region;

  // Sin tipo (o tipo desconocido) → derivar de zona/dirección.
  if (!t) {
    if (z.includes('costa'))  return TIPOS.costa;
    if (z.includes('regi'))   return TIPOS.region;
    if (/\blocal\b|\bmall\b/.test(d)) return TIPOS.mall;
    return TIPOS.street;
  }
  // Tipo con texto desconocido: mostrarlo tal cual.
  return { key: 'otro', label: t, color: TIPOS.otro.color };
}

/** Grupo de la tienda para el filtro del Planificador: Costa / Nacional(fal/regiones) / RM.
 *  Deriva de la zona (`z`), misma lógica que el calendario (Costa→costa, Región→fal, resto→rm). */
export function grupoTienda(z?: string | null): 'rm' | 'costa' | 'fal' {
  const zz = (z ?? '').trim().toLowerCase();
  if (zz.includes('costa')) return 'costa';
  if (zz.includes('regi')) return 'fal';
  return 'rm';
}
