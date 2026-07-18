import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { TodayStore, StoreGroupKey, PickerStatRow, PalletSlot } from './picking-types';
import { CANONICAL_PICKER_KEYS } from './picking-types';

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function todayISO(): string { return new Date().toISOString().slice(0, 10); }

export function stampFromISO(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}${mm}${yyyy}`;
}

/**
 * Un slot en el bucket "Sin asignar" (op de Odoo sin responsable). Bajo el flujo normal el
 * supervisor asigna un picker ANTES de imprimir, así que estos slots nunca se imprimen. [P6]
 */
export function isSinAsignar(pickerLabel: string | null | undefined): boolean {
  return (pickerLabel ?? '').toLowerCase().trim() === 'sin asignar';
}

/**
 * Numeración de etiquetas: rank 1-based dentro de (store_cod, tipo), en orden de creación
 * (created_at, luego id — determinista e independiente del orden del array, lo que evita que
 * dos equipos numeren distinto → P7). EXCLUYE el bucket "Sin asignar", cuyos slots fantasma
 * nunca se imprimen e inflaban el conteo (los CH del picker real salían 4,5,6 en vez de 1,2,3 → P6).
 * Devuelve { [slotId]: pallet_num }; los slots "Sin asignar" quedan sin entrada.
 */
export function computePalletNums(
  slots: Pick<PalletSlot, 'id' | 'store_cod' | 'tipo' | 'picker_label' | 'created_at'>[],
): Record<number, number> {
  const result: Record<number, number> = {};
  const byStoreTipo: Record<string, typeof slots> = {};
  for (const s of slots) {
    if (isSinAsignar(s.picker_label)) continue;
    const key = `${s.store_cod}::${s.tipo || 'P'}`;
    (byStoreTipo[key] ??= []).push(s);
  }
  for (const group of Object.values(byStoreTipo)) {
    group.sort((a, b) => (a.created_at !== b.created_at ? (a.created_at < b.created_at ? -1 : 1) : a.id - b.id));
    group.forEach((s, idx) => { result[s.id] = idx + 1; });
  }
  return result;
}

export function buildCanonicalId(tipo: string, seq: number, cod: string, isoDate: string): string {
  const stamp = stampFromISO(isoDate);
  if (tipo === 'P')  return `P${seq}${cod}${stamp}P`;
  if (tipo === 'B')  return `${seq}B${cod}${stamp}B`;
  if (tipo === 'CH') return `CH${seq}${cod}${stamp}CH`;
  if (tipo === 'C')  return `C${seq}${cod}${stamp}C`;
  return `${seq}${cod}${stamp}`;
}

// ─── String helpers ───────────────────────────────────────────────────────────
export function sanitizeForBarcode(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').trim();
}

export function categoriesToContenido(cats: string[]): string {
  const low = cats.map(c => c.toLowerCase());
  const hasComida    = low.some(c => c.includes('comida') || c.includes('food') || c.includes('aliment'));
  const hasHogar     = low.some(c => c.includes('hogar') || c.includes('home') || c.includes('bazar'));
  const hasAseo      = low.some(c => c.includes('aseo')  || c.includes('limpieza') || c.includes('clean'));
  const hasChocolates = low.some(c => c.includes('chocolate'));
  if (hasChocolates) return 'chocolate';
  if (hasComida && hasHogar && hasAseo) return 'completo';
  if (hasComida && hasAseo)  return 'comida-aseo';
  if (hasAseo   && hasHogar) return 'aseo-hogar';
  if (hasComida && hasHogar) return 'mixto';
  if (hasComida) return 'comida';
  if (hasAseo)   return 'aseo';
  return 'hogar';
}

// ─── Store helpers ────────────────────────────────────────────────────────────
export function getStoreName(cod: string): string { return TIENDAS_INICIAL[cod]?.n ?? cod; }

// Reverse map: store name (uppercase) → store code, for matching Odoo origins that use names instead of codes
const STORE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TIENDAS_INICIAL).map(([cod, info]) => [info.n.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), cod])
);

// Forma "plana" de un código: sin acentos ni Ñ (Ñ→N), mayúsculas. "37VIÑ" y "37VIN" → "37VIN".
function flatCode(code: string): string {
  return (code ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Mapa: forma plana del código del catálogo → código canónico del catálogo.
// El catálogo usa Ñ en los códigos canónicos (23PEÑ, 37VIÑ), así que las grafías
// ASCII de Odoo (23PEN, 37VIN) deben colapsar al canónico con Ñ.
const CANONICAL_BY_FLAT: Record<string, string> = Object.fromEntries(
  Object.keys(TIENDAS_INICIAL).map(cod => [flatCode(cod), cod])
);

/**
 * Canoniza un código de tienda al código exacto del catálogo (TIENDAS_INICIAL),
 * resolviendo la grafía de la Ñ: "37VIN" → "37VIÑ", "23PEN" → "23PEÑ".
 * Si no hay coincidencia en el catálogo, devuelve el código tal cual.
 */
export function canonicalStoreCode(code: string): string {
  if (!code) return code;
  return CANONICAL_BY_FLAT[flatCode(code)] ?? code;
}

export function getStoreGroup(store: TodayStore): StoreGroupKey {
  const z = TIENDAS_INICIAL[store.cod]?.z ?? '';
  if (z === 'Región' || store.sources.includes('regiones')) return 'region';
  if (z === 'Costa') return 'costa';
  return 'santiago';
}

// ─── Odoo origin parsing ──────────────────────────────────────────────────────
const ABAST_KEYWORDS = [
  { kw: 'Abastecimiento Comida',    cat: 'Comida' },
  { kw: 'Abastecimiento Aseo',      cat: 'Aseo' },
  { kw: 'Abastecimiento Hogar',     cat: 'Hogar' },
  { kw: 'Abastecimiento Chocolates', cat: 'Chocolates' },
] as const;

export { ABAST_KEYWORDS };

export function parseOrigin(origin: string): { categories: string[]; storeCode: string; originDate: string } {
  const categories: string[] = ABAST_KEYWORDS
    .filter(({ kw }) => origin.includes(kw))
    .map(({ cat }) => cat as string);
  if (categories.length === 0) {
    const m = origin.match(/\(([^)]+)\)/);
    if (m) m[1].split(',').forEach(c => { const t = c.trim(); if (t) categories.push(t); });
  }
  // 1) Try code pattern (Ñ-aware + dígito final): "29CFL", "37VIÑ", "35BN2", "09LEO".
  //    Usa extractStoreCode (lookarounds) en vez de \b, que no trata la Ñ como palabra.
  let storeCode = extractStoreCode(origin);
  // 2) Fallback: match store name from TIENDAS_INICIAL (e.g. "Maipu POS 2/..." → "17MAI")
  if (!storeCode) {
    const originNorm = origin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    let bestLen = 0;
    for (const [nameNorm, cod] of Object.entries(STORE_NAME_TO_CODE)) {
      if (nameNorm.length > bestLen && originNorm.includes(nameNorm)) {
        storeCode = cod;
        bestLen = nameNorm.length;
      }
    }
  }
  const dateMatch  = origin.match(/Fecha\((\d{2}\/\d{2}\/\d{4})\)/) ?? origin.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { categories, storeCode, originDate: dateMatch?.[1] ?? '' };
}

export function isAbastecimientoOp(origin: string): boolean {
  return ABAST_KEYWORDS.some(({ kw }) => origin.includes(kw));
}

/**
 * Estados de picking Odoo que cuentan para el semáforo de la tienda ("pickeables" =
 * con stock reservado / accionables por el picker):
 *   - 'assigned' | 'partially_available' → Listo/Preparado (reservado, se puede pickear)
 *   - 'done'                              → Realizado/Validado
 * Se EXCLUYEN 'confirmed' y 'waiting' (demanda sin stock reservado, no pickeables): un
 * duplicado/backorder en 'confirmed' que nunca pasa a 'done' dejaba la tienda en ámbar
 * para siempre (caso 05LP: un 2º "Abastecimiento Aseo" en 'confirmed' daba 5/6). Alinea
 * el conteo con la definición de "pickeable" que ya usa el proxy de Odoo para stock.move.
 */
export const PICKEABLE_STATES = new Set(['assigned', 'partially_available', 'done']);
export function isPickeableState(state: string): boolean {
  return PICKEABLE_STATES.has(state);
}

/** Extrae un código de tienda (2 dígitos + 2-4 letras + dígito opcional, ej. "42ANP",
 *  "35BN2") de cualquier texto.
 *  Incluye Ñ en la clase de letras y usa lookarounds en vez de \b: la Ñ NO es carácter
 *  de palabra para \b, así que con la regex anterior códigos como "23PEÑ" (Peñalolén)
 *  quedaban truncados a "23PE" y el progreso de Odoo se guardaba bajo una clave que no
 *  coincidía con la canónica de la tienda (semáforo siempre naranja).
 *  El dígito final opcional (\d?) cubre códigos como "35BN2"/"38SP2": sin él la regex
 *  tomaba "35BN" y el lookahead chocaba con el "2" → sin match → tienda sin semáforo. */
const STORE_CODE_RE = /(?<![A-ZÑ0-9])(\d{2}[A-ZÑ]{2,4}\d?)(?![A-ZÑ0-9])/;
export function extractStoreCode(text: string): string {
  return (text ?? '').toUpperCase().match(STORE_CODE_RE)?.[1] ?? '';
}

/**
 * Identifica la tienda de un picking de forma robusta a typos manuales en el
 * Documento Origen. Prioridad: 1º destino (location_dest_id, columna "A" en Odoo,
 * dato estructurado), 2º origin (texto manual), 3º partner.
 * El resultado se canoniza al código del catálogo para que el semáforo/bodega
 * (que usan el código del catálogo, p. ej. "37VIÑ") hagan match aunque Odoo use
 * otra grafía de la Ñ (p. ej. "37VIN").
 */
export function resolveStoreCode(p: { toLocation?: string; origin?: string; partner?: string }): string {
  const raw = extractStoreCode(p.toLocation ?? '')
      || parseOrigin(p.origin ?? '').storeCode
      || extractStoreCode(p.partner ?? '');
  return canonicalStoreCode(raw);
}

// ─── Stats formatting ─────────────────────────────────────────────────────────
export function fmtDuration(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtSecs(sec: number): string {
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function cphColor(cph: number): string {
  if (cph <= 0) return '#9CA3AF';
  if (cph >= 90) return '#16A34A';
  if (cph >= 60) return '#D97706';
  return '#DC2626';
}

export function isAllowedPicker(name: string): boolean {
  const n = name.toLowerCase().trim();
  const m = n.match(/^pickers?\s+(\d+)$/);
  if (m) { const num = parseInt(m[1]); return num >= 1 && num <= 18; }
  return n.includes('adquisicion') || n.includes('adquisición') || n.includes('calidad');
}

// ─── Pickers dinámicos (built-in + custom agregados desde Config) ───────────────
const BUILTIN_PICKER_LC = new Set(CANONICAL_PICKER_KEYS.map(k => k.toLowerCase().trim()));

/** True si la key NO es built-in → es un picker/pistola agregado desde Config. */
export function isCustomPickerKey(key: string): boolean {
  return !BUILTIN_PICKER_LC.has(key.toLowerCase().trim());
}

/**
 * Lista ordenada de keys de pickers a mostrar y gestionar en Config: las built-in (en su
 * orden) + las custom presentes en `canonicalNames` (agregadas desde el panel). Dedup
 * case-insensitive. Las custom "Pickers N" se ordenan por número; el resto, alfabético.
 * Se usa también para resolver nombres (getCanonicalName) y para el filtro de Estadísticas,
 * de modo que un picker agregado sea "de primera clase" en todo el flujo.
 */
export function buildPickerKeyList(canonicalNames: Record<string, string>): string[] {
  const seen = new Set(BUILTIN_PICKER_LC);
  const custom: string[] = [];
  for (const k of Object.keys(canonicalNames)) {
    const lc = k.toLowerCase().trim();
    if (seen.has(lc)) continue;
    seen.add(lc);
    custom.push(k);
  }
  const numOf = (k: string) => { const m = k.toLowerCase().match(/^pickers?\s+(\d+)$/); return m ? parseInt(m[1]) : null; };
  custom.sort((a, b) => {
    const na = numOf(a), nb = numOf(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a.localeCompare(b);
  });
  return [...CANONICAL_PICKER_KEYS, ...custom];
}

// ─── Auditoría de pallets (crear / eliminar) ───────────────────────────────────
export interface PickingEvento {
  id:           number;
  date:         string;
  event_type:   'crear' | 'eliminar';
  pallet_id:    number | null;
  state_key:    string | null;
  store_cod:    string | null;
  tipo:         string | null;
  picker_label: string | null;
  actor_name:   string | null;
  created_at:   string;
}

export interface ReincidenciaPar {
  actor_name: string;       // quién creó (origen de la acción)
  borrado_por: string | null;
  state_key:  string;
  tipo:       string;
  store_cod:  string | null;
  pallet_id:  number | null;
  creado_at:  string;
  borrado_at: string;
}

/**
 * Empareja "creó y luego borró" el MISMO pallet (por pallet_id) dentro de una
 * ventana corta, para detectar errores/correcciones reiteradas. Devuelve los
 * pares y un conteo por supervisor (atribuido a quien creó). Una ventana corta
 * (default 30 min) evita marcar bajas legítimas hechas horas después.
 */
export function detectarReincidencia(
  eventos: PickingEvento[],
  ventanaMin = 30,
): { pares: ReincidenciaPar[]; porSupervisor: Record<string, number> } {
  const byPallet = new Map<number, { crear?: PickingEvento; eliminar?: PickingEvento }>();
  for (const e of eventos) {
    if (e.pallet_id == null) continue;
    const g = byPallet.get(e.pallet_id) ?? {};
    if (e.event_type === 'crear' && !g.crear) g.crear = e;       // primera creación
    if (e.event_type === 'eliminar')          g.eliminar = e;    // última eliminación
    byPallet.set(e.pallet_id, g);
  }
  const pares: ReincidenciaPar[] = [];
  const porSupervisor: Record<string, number> = {};
  for (const { crear, eliminar } of byPallet.values()) {
    if (!crear || !eliminar) continue;
    const dtMin = (new Date(eliminar.created_at).getTime() - new Date(crear.created_at).getTime()) / 60_000;
    if (dtMin < 0 || dtMin > ventanaMin) continue;
    const actor = crear.actor_name ?? eliminar.actor_name ?? '—';
    pares.push({
      actor_name:  actor,
      borrado_por: eliminar.actor_name ?? null,
      state_key:   crear.state_key ?? eliminar.state_key ?? '',
      tipo:        crear.tipo ?? eliminar.tipo ?? '',
      store_cod:   crear.store_cod ?? eliminar.store_cod ?? null,
      pallet_id:   crear.pallet_id,
      creado_at:   crear.created_at,
      borrado_at:  eliminar.created_at,
    });
    porSupervisor[actor] = (porSupervisor[actor] ?? 0) + 1;
  }
  return { pares, porSupervisor };
}

// ─── Relative time ────────────────────────────────────────────────────────────
export function relativeTime(isoStr: string, nowMs: number): string {
  const diffMs = nowMs - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1)  return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs} h`;
}

// ─── UI constants ─────────────────────────────────────────────────────────────
export const STATE_INFO: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: 'Borrador',   color: '#6B7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.25)' },
  waiting:   { label: 'Esperando', color: '#D97706', bg: 'rgba(217,119,6,0.10)',   border: 'rgba(217,119,6,0.30)' },
  confirmed: { label: 'Confirmado', color: '#2563EB', bg: 'rgba(37,99,235,0.10)',  border: 'rgba(37,99,235,0.30)' },
  assigned:  { label: 'Preparado',  color: '#D97706', bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.30)' },
  done:      { label: 'Realizado',  color: '#16A34A', bg: 'rgba(22,163,74,0.15)',  border: 'rgba(22,163,74,0.40)' },
  cancel:    { label: 'Cancelado',  color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  border: 'rgba(220,38,38,0.30)' },
};

export const GROUP_LABELS: Record<StoreGroupKey, string> = { region: 'Regiones', costa: 'Costa', santiago: 'Santiago' };

export const TIPO_LABEL: Record<string, string> = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolates' };

export const STAT_COLS: { key: keyof PickerStatRow; label: string; hint: string; right?: boolean }[] = [
  { key: 'name',              label: 'Nombre',            hint: 'Responsable (Odoo) + nombre configurado' },
  { key: 'ops',               label: 'Ops',               hint: 'Operaciones completadas',                right: true },
  { key: 'avgMinutesPerOp',   label: 'Prom / Op',         hint: 'Tiempo promedio por operación',          right: true },
  { key: 'lineCount',         label: 'Cant. SKU',         hint: 'Cantidad de SKUs / líneas escaneadas',   right: true },
  { key: 'avgSecondsPerLine', label: 'T. Prom / SKU',     hint: 'Tiempo promedio por SKU escaneado',      right: true },
  { key: 'units',             label: 'Unidades',          hint: 'Unidades movidas (qty done)',             right: true },
  { key: 'avgMinutesPerOp',   label: 'T. Prom / Pedido',  hint: 'Tiempo promedio por pedido completo',    right: true },
];
