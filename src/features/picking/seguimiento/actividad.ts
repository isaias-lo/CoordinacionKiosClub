// Actividad en escritorio: una fila por cosa que pasó, la más nueva arriba.
// Módulo puro (sin React ni Supabase). Arma las filas con los mismos datos que ya usa la vista de
// tarjetas por supervisor (ActivityTab): impresiones, altas y bajas de pallets, cambios de nombre
// y lo que reportan en vivo los otros supervisores.

import type { PrintRecord, PickerNameChange, PalletSlot, SupervisorPresence } from '../picking-types';
import { detectarReincidencia, TIPO_LABEL, type PickingEvento } from '../picking-utils';

export type AccionActividad = 'imprimio' | 'creo' | 'elimino' | 'renombro';

export interface FilaActividad {
  id:       string;
  at:       string;
  quien:    string;
  accion:   AccionActividad;
  /** Código de tienda; null en los cambios de nombre, que no tienen tienda. */
  tienda:   string | null;
  /** Encargado al que se refiere (vacío en cambios de nombre). */
  picker:   string;
  detalle:  string;
  /** Lote de Odoo, si lo hay. */
  batch?:   string;
  /** Veces impresa (solo impresiones). */
  veces?:   number;
  /** Creó y borró el mismo pallet en poco tiempo. */
  error:    boolean;
  /** Impresión que todavía solo se conoce por tiempo real. */
  enVivo:   boolean;
}

export const NOMBRE_ACCION: Record<AccionActividad, string> = {
  imprimio: 'Imprimió', creo: 'Creó', elimino: 'Eliminó', renombro: 'Renombró',
};

/** Color de la píldora de cada acción (clases .pk-pill del diseño). */
export const TONO_ACCION: Record<AccionActividad, 'info' | 'ok' | 'bad' | 'warn'> = {
  imprimio: 'info', creo: 'ok', elimino: 'bad', renombro: 'warn',
};

export const SIN_ATRIBUCION = 'Sin atribución';

interface Datos {
  printRecords: PrintRecord[];
  nameChanges:  PickerNameChange[];
  palletSlots:  PalletSlot[];
  eventos:      PickingEvento[];
  supervisors:  Record<string, SupervisorPresence>;
}

function quienDe(n: string | null | undefined): string {
  return n?.trim() || SIN_ATRIBUCION;
}

/** «2 P · 1 B» con lo que tiene el encargado hoy. */
function unidadesTexto(tipos: Record<string, number>): string {
  return Object.entries(tipos).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`).join(' · ');
}

export function filasActividad({ printRecords, nameChanges, palletSlots, eventos, supervisors }: Datos): FilaActividad[] {
  const unidades: Record<string, Record<string, number>> = {};
  const seq = new Map<number, number>();
  for (const s of palletSlots) {
    const u = (unidades[s.state_key] ??= {});
    const t = s.tipo || 'P';
    u[t] = (u[t] ?? 0) + 1;
    if (s.seq != null) seq.set(s.id, s.seq);
  }
  const batchDe = new Map<string, string>();
  for (const r of printRecords) if (r.batch) batchDe.set(r.state_key, r.batch);
  const errores = new Set(detectarReincidencia(eventos).pares
    .map(p => p.pallet_id).filter((id): id is number => id != null));

  const filas: FilaActividad[] = [];

  for (const r of printRecords) {
    const u = unidadesTexto(unidades[r.state_key] ?? {});
    filas.push({
      id: `p:${r.state_key}:${r.printed_at}`, at: r.printed_at, quien: quienDe(r.printed_by_name),
      accion: 'imprimio', tienda: r.state_key.split('__')[0] || null, picker: r.picker_label,
      detalle: `Etiquetas de ${r.picker_label}${u ? ` (${u})` : ''}`,
      batch: r.batch || undefined, veces: r.print_count ?? 1, error: false, enVivo: false,
    });
  }

  // Lo que avisan en vivo otros supervisores y todavía no está en la base con su nombre.
  for (const sup of Object.values(supervisors)) {
    const quien = sup.name?.trim();
    if (!quien) continue;
    for (const p of sup.recentPrints) {
      const yaEsta = printRecords.some(r => quienDe(r.printed_by_name) === quien
        && r.state_key.startsWith(p.storeCod + '__') && r.picker_label === p.pickerLabel);
      if (yaEsta) continue;
      filas.push({
        id: `v:${quien}:${p.storeCod}:${p.pickerLabel}:${p.printedAt}`, at: p.printedAt, quien,
        accion: 'imprimio', tienda: p.storeCod, picker: p.pickerLabel,
        detalle: `Etiquetas de ${p.pickerLabel}${p.pallets > 0 ? ` (${p.pallets} ${p.tipo})` : ''}`,
        error: false, enVivo: true,
      });
    }
  }

  for (const e of eventos) {
    const tipo = e.tipo ?? '';
    const n = e.pallet_id != null ? seq.get(e.pallet_id) : undefined;
    const nombre = TIPO_LABEL[tipo] ?? (tipo || 'Unidad');
    const picker = e.picker_label ?? '';
    filas.push({
      id: `e:${e.id}`, at: e.created_at, quien: quienDe(e.actor_name),
      accion: e.event_type === 'crear' ? 'creo' : 'elimino',
      tienda: e.store_cod ?? (e.state_key ? e.state_key.split('__')[0] : null), picker,
      detalle: `${nombre}${n != null ? ` ${tipo}-${n}` : ''}${picker ? ` de ${picker}` : ''}${e.pallet_id != null ? ` · #${e.pallet_id}` : ''}`,
      batch: e.state_key ? batchDe.get(e.state_key) : undefined,
      error: e.pallet_id != null && errores.has(e.pallet_id), enVivo: false,
    });
  }

  for (const c of nameChanges) {
    filas.push({
      id: `n:${c.id}`, at: c.changed_at, quien: quienDe(c.changed_by_name), accion: 'renombro',
      tienda: null, picker: '', detalle: `«${c.old_name || c.picker_key}» → «${c.new_name || '—'}»`,
      error: false, enVivo: false,
    });
  }

  return filas.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export type FiltroAccion = 'todo' | AccionActividad | 'errores';

export interface Filtros {
  accion: FiltroAccion;
  tienda: string | null;
  picker: string | null;
  quien:  string | null;
}

export const SIN_FILTROS: Filtros = { accion: 'todo', tienda: null, picker: null, quien: null };

export function pasaFiltros(f: FilaActividad, filtros: Filtros): boolean {
  if (filtros.accion === 'errores' ? !f.error : filtros.accion !== 'todo' && f.accion !== filtros.accion) return false;
  if (filtros.tienda && f.tienda !== filtros.tienda) return false;
  if (filtros.picker && f.picker !== filtros.picker) return false;
  if (filtros.quien && f.quien !== filtros.quien) return false;
  return true;
}

/** Valores distintos de una columna, ordenados (para los desplegables). */
export function opciones(filas: FilaActividad[], campo: 'tienda' | 'picker' | 'quien'): string[] {
  const s = new Set<string>();
  for (const f of filas) { const v = f[campo]; if (v) s.add(v); }
  return [...s].sort((a, b) => a === SIN_ATRIBUCION ? 1 : b === SIN_ATRIBUCION ? -1 : a.localeCompare(b));
}

function celdaCsv(v: string): string {
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV con punto y coma (lo que abre bien Excel en español). */
export function aCsv(encabezados: string[], filas: string[][]): string {
  return [encabezados, ...filas].map(f => f.map(celdaCsv).join(';')).join('\r\n');
}

/** Descarga un CSV en el navegador. */
export function descargarCsv(nombre: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
