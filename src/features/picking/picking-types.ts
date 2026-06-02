export interface PickingOperation {
  id: number; name: string; origin: string; partner: string;
  fromLocation: string; toLocation: string; state: string;
  scheduledDate: string; dateDone: string | null; pickingType: string;
  responsible: string; responsibleId: number | null;
  categories: string[]; storeCodeFromOrigin: string; originDate: string;
  lineCount: number;
}

export interface PickerGroup {
  key: string;
  storeCod: string;
  stateKey: string;
  operations: PickingOperation[];
}

export interface TodayStore { cod: string; name: string; sources: ('rm' | 'regiones')[]; }
export type StoreGroupKey = 'region' | 'costa' | 'santiago';
export interface OdooConfig { url: string; db: string; username: string; apiKey: string; }

export interface PickingSession {
  date: string;
  selectedCods: string[];
  opsMap: Record<string, PickingOperation[]>;
  pickerDisplayNames: Record<string, string>;
}

export interface PalletSlot {
  id: number;
  store_cod: string;
  state_key: string;
  picker_label: string;
  tipo: string;
  contenido: string;
  refs: string;
  created_at: string;
}

export interface PrintRecord {
  state_key: string;
  printed_at: string;
  picker_label: string;
  pallets: number;
  tipo: string;
}

export interface SessionStateRow {
  state_key: string;
  picker_label: string;
  tipo: string;
}

export interface SupervisorPrint {
  storeCod: string;
  pickerLabel: string;
  pallets: number;
  tipo: string;
  printedAt: string;
}

export interface PickerNameChange {
  id: number;
  picker_key: string;
  old_name: string;
  new_name: string;
  changed_by_name: string;
  changed_at: string;
}

export interface SupervisorPresence {
  name: string;
  userId: string;
  recentPrints: SupervisorPrint[];
  lastActive: string;
}

export interface PickerStatRow {
  name: string; ops: number; totalMinutes: number; avgMinutesPerOp: number;
  units: number; lineCount: number; avgSecondsPerLine: number; cph: number;
}

export interface StatsCache { cachedAt: string; rows: PickerStatRow[]; }

export type PickerType = 'P' | 'C' | 'B' | 'CH';
export type SectionFilter = 'all' | 'aseo-comida' | 'hogar';

// ─── localStorage keys ────────────────────────────────────────────────────────
export const SAVED_NAMES_KEY     = 'picking_saved_picker_names';
export const SESSION_KEY         = 'picking_session_v2';
export const SECTION_FILTER_KEY  = 'picking_section_filter';
export const COLS_PER_ROW_KEY    = 'picking_cols_per_row';
export const STATS_CACHE_KEY     = 'picking_stats_cache_v1';
export const LABEL_CONFIG_KEY    = 'picking_label_config_v1';
export const CANONICAL_NAMES_KEY = 'picking_canonical_names_v1';

export const AUTO_REFRESH_MS = 3 * 60 * 1000;

export const CANONICAL_PICKER_KEYS = [
  'Pickers 1','Pickers 2','Pickers 3','Pickers 4','Pickers 5',
  'Pickers 6','Pickers 7','Pickers 8','Pickers 9','Pickers 10',
  'Pickers 11','Pickers 12','Pickers 13','Pickers 14','Pickers 15',
  'Pickers 16','Pickers 17','Pickers 18','Adquisiciones','Calidad',
];

export const STATS_DATE_FROM = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })();
export const STATS_DATE_TO   = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10); })();
