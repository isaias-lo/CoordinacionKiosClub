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
  const hasComida = low.some(c => c.includes('comida') || c.includes('food') || c.includes('aliment'));
  const hasHogar  = low.some(c => c.includes('hogar') || c.includes('home') || c.includes('bazar'));
  if (hasComida && hasHogar) return 'mixto';
  if (hasComida) return 'comida';
  return 'hogar';
}

// ─── Store helpers ────────────────────────────────────────────────────────────
export function getStoreName(cod: string): string { return TIENDAS_INICIAL[cod]?.n ?? cod; }

export function getStoreGroup(store: TodayStore): StoreGroupKey {
  const z = TIENDAS_INICIAL[store.cod]?.z ?? '';
  if (z === 'Región' || store.sources.includes('regiones')) return 'region';
  if (z === 'Costa') return 'costa';
  return 'santiago';
}

// ─── Odoo origin parsing ──────────────────────────────────────────────────────
const ABAST_KEYWORDS = [
  { kw: 'Abastecimiento Comida', cat: 'Comida' },
  { kw: 'Abastecimiento Aseo',   cat: 'Aseo' },
  { kw: 'Abastecimiento Hogar',  cat: 'Hogar' },
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
  const storeMatch = origin.match(/\b(\d{2}[A-Z]{2,4})\b/);
  const dateMatch  = origin.match(/Fecha\((\d{2}\/\d{2}\/\d{4})\)/) ?? origin.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { categories, storeCode: storeMatch?.[1] ?? '', originDate: dateMatch?.[1] ?? '' };
}

export function isAbastecimientoOp(origin: string): boolean {
  return ABAST_KEYWORDS.some(({ kw }) => origin.includes(kw));
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

export const TIPO_LABEL: Record<string, string> = { P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chico' };

export const STAT_COLS: { key: keyof PickerStatRow; label: string; hint: string; right?: boolean }[] = [
  { key: 'name',             label: 'Nombre',           hint: 'Responsable de la operación' },
  { key: 'ops',              label: 'Ops',              hint: 'Operaciones completadas',        right: true },
  { key: 'totalMinutes',     label: 'T. Total',         hint: 'Tiempo total trabajado',         right: true },
  { key: 'avgMinutesPerOp',  label: 'Prom / Op',        hint: 'Tiempo promedio por operación',  right: true },
  { key: 'units',            label: 'Unidades',         hint: 'Unidades movidas (qty done)',    right: true },
  { key: 'avgSecondsPerLine',label: 'Prom / Pistolaz.', hint: 'Tiempo promedio entre pistolazos (total_time / líneas)', right: true },
  { key: 'cph',              label: 'CPH',              hint: 'Casos por hora',                 right: true },
];
