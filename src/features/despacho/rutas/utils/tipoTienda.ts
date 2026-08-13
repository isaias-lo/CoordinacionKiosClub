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
 *  Fuente canónica = el campo `region` del catálogo (RM, Valparaíso, Antofagasta, Biobío, …):
 *  Valparaíso ⇒ Costa; RM/Metropolitana ⇒ RM; cualquier OTRA región ⇒ Nacional. Sin `region`,
 *  cae a una heurística por zona (`z`). Antes solo miraba `z`, y como las tiendas Nacional tienen
 *  `z`="Corredor …"/comuna (sin "regi"), caían mal en RM → al filtrar RM aparecían las Nacional. */
export function grupoTienda(z?: string | null, region?: string | null): 'rm' | 'costa' | 'fal' {
  const zz = (z ?? '').trim().toLowerCase();
  const rr = (region ?? '').trim().toLowerCase();
  if (rr) {
    if (rr === 'v' || rr === 'vr' || rr.includes('valpara')) return 'costa'; // Valparaíso = Costa
    if (rr === 'rm' || rr === 'm' || rr.includes('metropol')) return 'rm';
    return 'fal'; // cualquier otra región (Antofagasta, Biobío, Los Lagos, …) = Nacional
  }
  // Sin `region`: heurística por zona (compat. con el comportamiento anterior).
  if (zz.includes('costa')) return 'costa';
  if (zz.includes('regi')) return 'fal';
  return 'rm';
}
