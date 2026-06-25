// Tipos de evento y predicados de filtrado del tab Actividad.
// Módulo puro (sin React/Supabase) para poder testearlo en aislamiento.

export type PrintEv = {
  kind:           'print';
  at:             string;
  storeCod:       string;
  pickerLabel:    string;
  pallets:        number;
  bultos:         number;
  tiposPresentes: string[];
  fromPresence:   boolean; // true = dato de Presence (tiempo real, no persistido aún)
  batch?:         string;  // Transferir Agrupación (Odoo)
  printCount?:    number;  // veces (re)impreso
};

export type NameEv = {
  kind:      'name';
  at:        string;
  pickerKey: string;
  oldName:   string;
  newName:   string;
};

export type PalletEv = {
  kind:        'pallet';
  at:          string;
  eventType:   'crear' | 'eliminar';
  storeCod:    string;
  tipo:        string;
  pickerLabel: string;
  palletId:    number | null;
  seq?:        number | null;  // ordinal (P{seq}/B{seq}) si el pallet sigue vivo
  batch?:      string;          // BATCH (de la impresión del mismo grupo), si existe
};

export type AnyEv = PrintEv | NameEv | PalletEv;

// Categorías de los botones-toggle del resumen. Semántica OR: si el set no está
// vacío, un evento se muestra si su categoría está en el set.
export type FilterCat = 'print' | 'crear' | 'eliminar' | 'error' | 'name';

export const EMPTY_TYPE_SET: Set<FilterCat> = new Set();

/** ¿El evento pasa el filtro de tipo? (set vacío = todo). `errorIds` = pallets con reincidencia. */
export function eventMatchesType(ev: AnyEv, typeFilter: Set<FilterCat>, errorIds: Set<number>): boolean {
  if (typeFilter.size === 0) return true;
  if (ev.kind === 'print') return typeFilter.has('print');
  if (ev.kind === 'name')  return typeFilter.has('name');
  // pallet: coincide por su tipo (crear/eliminar) o, si se pidió "error", por ser parte de un par.
  const isError = ev.palletId != null && errorIds.has(ev.palletId);
  return typeFilter.has(ev.eventType) || (typeFilter.has('error') && isError);
}

/** ¿El evento pasa el filtro de tienda? (null = todas). Los cambios de nombre no tienen tienda. */
export function eventMatchesStore(ev: AnyEv, storeFilter: string | null): boolean {
  if (!storeFilter) return true;
  return ev.kind !== 'name' && ev.storeCod === storeFilter;
}

/** ¿El evento pasa el filtro de picker? (null = todos). Filtra por el picker asignado
 *  (`pickerLabel`) de impresiones y altas/bajas; los cambios de nombre no tienen picker. */
export function eventMatchesPicker(ev: AnyEv, pickerFilter: string | null): boolean {
  if (!pickerFilter) return true;
  return ev.kind !== 'name' && ev.pickerLabel === pickerFilter;
}
