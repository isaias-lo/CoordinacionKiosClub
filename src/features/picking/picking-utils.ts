import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { TodayStore, StoreGroupKey, PickerStatRow } from './picking-types';

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function todayISO(): string { return new Date().toISOString().slice(0, 10); }

export function stampFromISO(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}${mm}${yyyy}`;
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
  // 1) Try code pattern: 2 digits + 2-4 uppercase letters (e.g. "29CFL", "09LEO")
  const storeMatch = origin.match(/\b(\d{2}[A-Z]{2,4})\b/);
  let storeCode = storeMatch?.[1] ?? '';
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

/** Extrae un código de tienda (2 dígitos + 2-4 letras, ej. "42ANP") de cualquier texto.
 *  Incluye Ñ en la clase de letras y usa lookarounds en vez de \b: la Ñ NO es carácter
 *  de palabra para \b, así que con la regex anterior códigos como "23PEÑ" (Peñalolén)
 *  quedaban truncados a "23PE" y el progreso de Odoo se guardaba bajo una clave que no
 *  coincidía con la canónica de la tienda (semáforo siempre naranja). */
const STORE_CODE_RE = /(?<![A-ZÑ0-9])(\d{2}[A-ZÑ]{2,4})(?![A-ZÑ0-9])/;
export function extractStoreCode(text: string): string {
  return (text ?? '').toUpperCase().match(STORE_CODE_RE)?.[1] ?? '';
}

/**
 * Identifica la tienda de un picking de forma robusta a typos manuales en el
 * Documento Origen. Prioridad: 1º destino (location_dest_id, columna "A" en Odoo,
 * dato estructurado), 2º origin (texto manual), 3º partner.
 */
export function resolveStoreCode(p: { toLocation?: string; origin?: string; partner?: string }): string {
  return extractStoreCode(p.toLocation ?? '')
      || parseOrigin(p.origin ?? '').storeCode
      || extractStoreCode(p.partner ?? '');
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
