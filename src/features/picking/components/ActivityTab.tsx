'use client';

import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Printer, Tag, User, Wifi, PlusCircle, MinusCircle, Plus, Minus, AlertTriangle, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PrintRecord, PickerNameChange, PalletSlot, SupervisorPresence, SupervisorPrint } from '../picking-types';
import { TipoBadge } from './TipoBadge';
import { detectarReincidencia, TIPO_LABEL, type PickingEvento } from '../picking-utils';
import {
  eventMatchesType, eventMatchesStore, eventMatchesPicker, EMPTY_TYPE_SET,
  type AnyEv, type FilterCat,
} from '../activity-filters';
import { fmtHoraChile } from '@/lib/fechaChile';

function fmtTime(iso: string) {
  return fmtHoraChile(iso);
}

interface Section {
  name:         string;
  isLive:       boolean; // tiene datos de Presence
  events:       AnyEv[];
}

// ─── componente principal (renderizador puro) ─────────────────────────────────

interface Props {
  printRecords: PrintRecord[];
  nameChanges:  PickerNameChange[];
  palletSlots:  PalletSlot[];
  supervisors:  Record<string, SupervisorPresence>; // otros supervisores en tiempo real
  eventos?:     PickingEvento[];                     // auditoría de altas/bajas de pallets
  userFilters?: Set<string>;                         // mostrar solo estas cuentas (vacío = todas)
  storeFilter?: string | null;                       // mostrar solo esta tienda (null = todas)
  pickerFilter?: string | null;                      // mostrar solo este picker (null = todos)
  typeFilter?:  Set<FilterCat>;                       // tipos a mostrar (vacío = todos)
  onStoreClick?: (cod: string) => void;              // clic en el código de tienda → filtrar
}

const EMPTY_STR_SET: Set<string> = new Set();

export function SupervisorActivityPanel({
  printRecords, nameChanges, palletSlots, supervisors, eventos = [],
  userFilters, storeFilter = null, pickerFilter = null, typeFilter, onStoreClick,
}: Props) {
  const typeSet = typeFilter ?? EMPTY_TYPE_SET;
  const userSet = userFilters ?? EMPTY_STR_SET;

  // Reincidencia: quién creó y luego borró el mismo pallet en poco tiempo
  const reincidencia = useMemo(() => detectarReincidencia(eventos), [eventos]);
  const reincidentes = useMemo(
    () => Object.entries(reincidencia.porSupervisor).sort((a, b) => b[1] - a[1]),
    [reincidencia],
  );

  // Pallets y bultos reales desde picking_pallets
  const unitsByKey = useMemo(() => {
    const map: Record<string, { pallets: number; bultos: number; tipos: string[] }> = {};
    for (const s of palletSlots) {
      if (!map[s.state_key]) map[s.state_key] = { pallets: 0, bultos: 0, tipos: [] };
      if (s.tipo === 'P') map[s.state_key].pallets++;
      if (s.tipo === 'B') map[s.state_key].bultos++;
      if (!map[s.state_key].tipos.includes(s.tipo)) map[s.state_key].tipos.push(s.tipo);
    }
    return map;
  }, [palletSlots]);

  // #10: número (seq) por pallet_id (si sigue vivo) y BATCH por grupo (state_key) desde las impresiones.
  const seqByPalletId = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of palletSlots) if (s.seq != null) m.set(s.id, s.seq);
    return m;
  }, [palletSlots]);
  const batchByStateKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of printRecords) if (r.batch) m.set(r.state_key, r.batch);
    return m;
  }, [printRecords]);

  const sections = useMemo<Section[]>(() => {
    const byName: Record<string, { dbPrints: PrintRecord[]; presencePrints: SupervisorPrint[]; nameEvs: PickerNameChange[]; palletEvs: PickingEvento[]; isLive: boolean }> = {};

    const ensure = (name: string) => {
      if (!byName[name]) byName[name] = { dbPrints: [], presencePrints: [], nameEvs: [], palletEvs: [], isLive: false };
    };

    // 1. Datos de DB: registros con printed_by_name
    for (const r of printRecords) {
      const name = r.printed_by_name?.trim() || 'Sin atribución';
      ensure(name);
      byName[name].dbPrints.push(r);
    }

    // 2. Datos de DB: cambios de nombre con changed_by_name
    for (const c of nameChanges) {
      const name = c.changed_by_name?.trim() || 'Sin atribución';
      ensure(name);
      byName[name].nameEvs.push(c);
    }

    // 2b. Auditoría de altas/bajas de pallets (crear / eliminar)
    for (const e of eventos) {
      const name = e.actor_name?.trim() || 'Sin atribución';
      ensure(name);
      byName[name].palletEvs.push(e);
    }

    // 3. Datos de Presence: supervisores conectados en tiempo real.
    //    Agregar sus recentPrints que NO estén ya en los registros de DB de ese supervisor.
    //    Esto cubre a supervisores que no recargaron la página (su printed_by_name = null).
    for (const sup of Object.values(supervisors)) {
      const name = sup.name.trim();
      if (!name) continue;
      ensure(name);
      byName[name].isLive = true;

      // Keys ya cubiertos por DB para este supervisor
      const dbCovered = new Set(byName[name].dbPrints.map(r => r.state_key));

      for (const p of sup.recentPrints) {
        // Construir una key aproximada desde storeCod + pickerLabel
        // Si algún DB record tiene el mismo storeCod (primeras letras del state_key) Y pickerLabel, ya está cubierto
        const alreadyCovered = byName[name].dbPrints.some(
          r => r.state_key.startsWith(p.storeCod + '__') && r.picker_label === p.pickerLabel
        );
        if (!alreadyCovered) {
          byName[name].presencePrints.push(p);
        }
        void dbCovered; // suppress unused warning
      }
    }

    // 4. Construir eventos combinados por supervisor
    return Object.entries(byName)
      .map(([name, data]): Section => {
        const events: AnyEv[] = [];

        // Eventos de print de DB
        for (const r of data.dbPrints) {
          const units = unitsByKey[r.state_key];
          events.push({
            kind:           'print',
            at:             r.printed_at,
            storeCod:       r.state_key.split('__')[0],
            pickerLabel:    r.picker_label,
            pallets:        units?.pallets ?? r.pallets,
            bultos:         units?.bultos  ?? 0,
            tiposPresentes: units?.tipos   ?? [r.tipo],
            fromPresence:   false,
            batch:          r.batch,
            printCount:     r.print_count,
          });
        }

        // Eventos de print de Presence (no están en DB aún o sin atribución en DB)
        for (const p of data.presencePrints) {
          // Buscar state_key aproximado para obtener unidades reales
          const matchKey = Object.keys(unitsByKey).find(k =>
            k.startsWith(p.storeCod + '__') &&
            palletSlots.find(s => s.state_key === k)?.picker_label === p.pickerLabel
          );
          const units = matchKey ? unitsByKey[matchKey] : null;
          events.push({
            kind:           'print',
            at:             p.printedAt,
            storeCod:       p.storeCod,
            pickerLabel:    p.pickerLabel,
            pallets:        units?.pallets ?? p.pallets,
            bultos:         units?.bultos  ?? 0,
            tiposPresentes: units?.tipos   ?? [p.tipo],
            fromPresence:   true,
          });
        }

        // Cambios de nombre
        for (const c of data.nameEvs) {
          events.push({ kind: 'name', at: c.changed_at, pickerKey: c.picker_key, oldName: c.old_name, newName: c.new_name });
        }

        // Altas / bajas de pallets
        for (const e of data.palletEvs) {
          events.push({
            kind:        'pallet',
            at:          e.created_at,
            eventType:   e.event_type,
            storeCod:    e.store_cod ?? (e.state_key ? e.state_key.split('__')[0] : '—'),
            tipo:        e.tipo ?? '',
            pickerLabel: e.picker_label ?? '',
            palletId:    e.pallet_id ?? null,
            seq:         e.pallet_id != null ? (seqByPalletId.get(e.pallet_id) ?? null) : null,
            batch:       e.state_key ? batchByStateKey.get(e.state_key) : undefined,
          });
        }

        // Ordenar cronológicamente
        events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        return { name, isLive: data.isLive, events };
      })
      .filter(s => s.events.length > 0)
      .sort((a, b) => {
        if (a.name === 'Sin atribución') return 1;
        if (b.name === 'Sin atribución') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [printRecords, nameChanges, palletSlots, supervisors, eventos, unitsByKey, seqByPalletId, batchByStateKey]);

  // IDs de pallets con reincidencia (creó+borró el mismo) → categoría "error"
  const errorPalletIds = useMemo(
    () => new Set(reincidencia.pares.map(p => p.pallet_id).filter((id): id is number => id != null)),
    [reincidencia],
  );

  // Secciones tras aplicar los filtros activos (cuenta / tipo / tienda / picker)
  const filteredSections = useMemo(() => sections
    .filter(s => userSet.size === 0 || userSet.has(s.name))
    .map(s => ({
      ...s,
      events: s.events.filter(ev =>
        eventMatchesType(ev, typeSet, errorPalletIds) &&
        eventMatchesStore(ev, storeFilter) &&
        eventMatchesPicker(ev, pickerFilter)),
    }))
    .filter(s => s.events.length > 0),
    [sections, userSet, typeSet, storeFilter, pickerFilter, errorPalletIds],
  );

  // Reincidentes visibles en el panel rojo, respetando el filtro de cuentas
  const reincidentesVisibles = userSet.size ? reincidentes.filter(([name]) => userSet.has(name)) : reincidentes;

  if (filteredSections.length === 0) {
    const conFiltros = userSet.size > 0 || !!storeFilter || !!pickerFilter || typeSet.size > 0;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-8">
        <div className="mb-4 opacity-20"><User size={48} strokeWidth={1.5} className="text-slate-400" /></div>
        <div className="text-[14px] font-medium text-slate-400">
          {sections.length > 0 && conFiltros ? 'Sin resultados con los filtros aplicados' : 'Sin actividad registrada'}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      {reincidentesVisibles.length > 0 && (
        <div className="rounded overflow-hidden"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #FECACA' }}>
            <AlertTriangle size={14} style={{ color: '#DC2626' }} />
            <span className="font-semibold text-[13px]" style={{ color: '#991B1B' }}>
              Creó y borró el mismo pallet (posibles errores)
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: '#FEE2E2' }}>
            {reincidentesVisibles.map(([name, n]) => (
              <div key={name} className="flex items-center gap-3 px-4 py-2">
                <span className="text-[13px] font-medium flex-1 truncate" style={{ color: '#7F1D1D' }}>{name}</span>
                <span className="flex-shrink-0 text-[12px] font-bold px-2 py-0.5 rounded"
                  style={{ background: '#FEE2E2', color: '#DC2626' }}>
                  {n} {n === 1 ? 'vez' : 'veces'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {filteredSections.map(sec => (
        <div key={sec.name}
          style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          className="rounded overflow-hidden">

          {/* Header supervisor */}
          <div className="flex items-center gap-3 px-4 py-3"
            style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: '#EFF6FF' }}>
              <User size={20} style={{ color: '#1E40AF' }} />
            </div>
            <span className="font-bold text-[18px]" style={{ color: '#1E293B' }}>{sec.name}</span>
            {sec.isLive && (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded"
                style={{ background: '#DCFCE7', color: '#15803D' }}>
                <Wifi size={10} />
                En línea
              </span>
            )}
            <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded"
              style={{ background: '#F1F5F9', color: '#64748B' }}>
              {sec.events.length} acción{sec.events.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Eventos */}
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {sec.events.map((ev, i) => (
              <div key={ev.at + ev.kind + i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] font-mono flex-shrink-0" style={{ color: '#94A3B8', minWidth: 36 }}>
                  {fmtTime(ev.at)}
                </span>

                {ev.kind === 'pallet' ? (
                  <>
                    {/* Badge grande y claro de crear (+) / eliminar (−) */}
                    <span className="flex-shrink-0 inline-flex items-center justify-center rounded-md"
                      style={{ width: 28, height: 28, background: ev.eventType === 'crear' ? 'rgba(22,163,74,0.14)' : 'rgba(220,38,38,0.14)' }}
                      title={ev.eventType === 'crear' ? 'Creó (agregó)' : 'Eliminó (quitó)'}>
                      {ev.eventType === 'crear'
                        ? <Plus  size={19} strokeWidth={3.5} style={{ color: '#15803D' }} />
                        : <Minus size={19} strokeWidth={3.5} style={{ color: '#DC2626' }} />}
                    </span>
                    <StoreBadge cod={ev.storeCod} onClick={onStoreClick} />
                    <span className="text-[13px] font-medium flex-1 truncate" style={{ color: '#334155' }}>
                      <span className="font-bold" style={{ color: ev.eventType === 'crear' ? '#15803D' : '#DC2626' }}>
                        {ev.eventType === 'crear' ? 'Creó' : 'Eliminó'}
                      </span> {TIPO_LABEL[ev.tipo] ?? ev.tipo}
                      {ev.seq != null && (
                        <span className="font-mono font-bold ml-1" style={{ color: '#0F172A' }}>{ev.tipo}{ev.seq}</span>
                      )}
                      {ev.pickerLabel ? ` · ${ev.pickerLabel}` : ''}
                    </span>
                    {ev.batch && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#EDE9FE', color: '#6D28D9' }} title="Transferir Agrupación (Odoo)">
                        🏷 {ev.batch}
                      </span>
                    )}
                    {ev.palletId != null && (
                      <span className="flex-shrink-0 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#F1F5F9', color: '#475569' }} title="ID del pallet">
                        #{ev.palletId}
                      </span>
                    )}
                  </>
                ) : ev.kind === 'print' ? (
                  <>
                    <Printer size={13} className="flex-shrink-0" style={{ color: ev.fromPresence ? '#15803D' : '#64748B' }} />
                    <StoreBadge cod={ev.storeCod} onClick={onStoreClick} />
                    <span className="text-[13px] font-medium flex-1 truncate" style={{ color: '#334155' }}>
                      {ev.pickerLabel}
                    </span>
                    {ev.batch && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#EDE9FE', color: '#6D28D9' }} title="Transferir Agrupación (Odoo)">
                        🏷 {ev.batch}
                      </span>
                    )}
                    {(ev.printCount ?? 0) > 1 && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}
                        title="Veces que se imprimió esta etiqueta">
                        ↻ ×{ev.printCount}
                      </span>
                    )}
                    {ev.pallets > 0 && (
                      <span className="flex-shrink-0 text-[12px] font-bold" style={{ color: '#1E40AF' }}>
                        {ev.pallets}P
                      </span>
                    )}
                    {ev.bultos > 0 && (
                      <span className="flex-shrink-0 text-[12px] font-bold" style={{ color: '#15803D' }}>
                        {ev.bultos}B
                      </span>
                    )}
                    <TipoBadge tipos={ev.tiposPresentes} />
                    {ev.fromPresence && (
                      <span className="flex-shrink-0 text-[10px] font-medium" style={{ color: '#94A3B8' }}>
                        tiempo real
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Tag size={13} className="flex-shrink-0" style={{ color: '#64748B' }} />
                    <span className="font-mono font-bold text-[12px] flex-shrink-0 px-1.5 py-0.5 rounded"
                      style={{ background: '#F1F5F9', color: '#334155' }}>
                      {ev.pickerKey}
                    </span>
                    <span className="text-[12px] flex-shrink-0 truncate" style={{ color: '#94A3B8', maxWidth: 90 }}>
                      {ev.oldName || '—'}
                    </span>
                    <span className="text-[11px] flex-shrink-0" style={{ color: '#CBD5E1' }}>→</span>
                    <span className="text-[13px] font-semibold flex-1 truncate" style={{ color: '#1E293B' }}>
                      {ev.newName || '—'}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Código de tienda; clicable si se pasa onClick (para filtrar por esa tienda). */
function StoreBadge({ cod, onClick }: { cod: string; onClick?: (cod: string) => void }) {
  const cls = 'font-mono font-bold text-[12px] flex-shrink-0 px-1.5 py-0.5 rounded';
  const style = { background: '#F1F5F9', color: '#334155' };
  if (!onClick) return <span className={cls} style={style}>{cod}</span>;
  return (
    <button
      type="button"
      onClick={() => onClick(cod)}
      title={`Filtrar por tienda ${cod}`}
      className={`${cls} cursor-pointer transition hover:brightness-95`}
      style={{ ...style, border: 'none' }}
    >{cod}</button>
  );
}

// ─── Wrapper con selector de fecha + resumen + filtros ────────────────────────
// SupervisorActivityPanel es el renderizador puro (recibe los datos por props).
// Este wrapper decide QUÉ datos mostrar: para HOY usa los datos en vivo de
// PickingScreen (con Presence/tiempo real); para días pasados hace sus propias
// consultas a la BD y oculta "En línea" (Presence solo existe en el momento).
// Además maneja el estado de los filtros (cuenta / tipo / tienda).

interface ActivityData {
  printRecords: PrintRecord[];
  nameChanges:  PickerNameChange[];
  palletSlots:  PalletSlot[];
  eventos:      PickingEvento[];
}

/** YYYY-MM-DD desplazado `n` días (mediodía UTC para evitar bordes de DST). */
function shiftDate(date: string, n: number): string {
  return new Date(new Date(date + 'T12:00:00Z').getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Carga la actividad persistida de una fecha. */
async function fetchActivity(date: string): Promise<ActivityData> {
  const [prints, evts, pallets, names] = await Promise.all([
    supabase.from('picking_prints')
      .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name')
      .eq('date', date).order('printed_at', { ascending: true }),
    supabase.from('picking_eventos')
      .select('id, date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, created_at')
      .eq('date', date).order('created_at', { ascending: true }),
    supabase.from('picking_pallets')
      .select('id, store_cod, state_key, picker_label, tipo, contenido, refs, created_at, seq, canonical_id')
      .eq('date', date).eq('is_active', true).order('created_at', { ascending: true }),
    // picker_name_changes no tiene columna `date`: filtramos por día UTC, igual que
    // el resto del módulo de Picking (las columnas `date` se escriben con todayISO UTC).
    supabase.from('picker_name_changes')
      .select('id, picker_key, old_name, new_name, changed_by_name, changed_at')
      .gte('changed_at', `${date}T00:00:00.000Z`)
      .lte('changed_at', `${date}T23:59:59.999Z`)
      .order('changed_at', { ascending: false }),
  ]);

  const palletSlots = ((pallets.data ?? []) as PalletSlot[])
    .filter(s => !String(s.state_key ?? '').endsWith('__bodega') && s.picker_label !== 'Bodega');

  return {
    printRecords: (prints.data ?? []) as PrintRecord[],
    eventos:      (evts.data ?? []) as PickingEvento[],
    palletSlots,
    nameChanges:  (names.data ?? []) as PickerNameChange[],
  };
}

interface ActivityTabProps {
  /** Datos en vivo de hoy (los que ya carga PickingScreen). */
  live:  ActivityData & { supervisors: Record<string, SupervisorPresence> };
  /** Fecha de hoy (YYYY-MM-DD, espacio UTC como el resto de Picking). */
  today: string;
}

export function ActivityTab({ live, today }: ActivityTabProps) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [histo, setHisto] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const isToday = selectedDate === today;

  // Filtros
  const [userFilters,  setUserFilters]  = useState<Set<string>>(() => new Set());
  const [storeFilter,  setStoreFilter]  = useState<string | null>(null);
  const [pickerFilter, setPickerFilter] = useState<string | null>(null);
  const [typeFilter,   setTypeFilter]   = useState<Set<FilterCat>>(() => new Set());

  useEffect(() => {
    if (isToday) { setHisto(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchActivity(selectedDate)
      .then(d => { if (!cancelled) setHisto(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate, isToday]);

  // Al cambiar de fecha, limpiar los filtros (las cuentas/tiendas/pickers pueden ser otros)
  useEffect(() => {
    setUserFilters(new Set()); setStoreFilter(null); setPickerFilter(null); setTypeFilter(new Set());
  }, [selectedDate]);

  const printRecords = isToday ? live.printRecords : (histo?.printRecords ?? []);
  const nameChanges  = isToday ? live.nameChanges  : (histo?.nameChanges  ?? []);
  const palletSlots  = isToday ? live.palletSlots  : (histo?.palletSlots  ?? []);
  const eventos      = isToday ? live.eventos      : (histo?.eventos      ?? []);
  const supervisors  = isToday ? live.supervisors  : {};

  const resumen = useMemo(() => ({
    impresiones: printRecords.length,
    creados:     eventos.filter(e => e.event_type === 'crear').length,
    eliminados:  eventos.filter(e => e.event_type === 'eliminar').length,
    errores:     detectarReincidencia(eventos).pares.length,
    nombres:     nameChanges.length,
  }), [printRecords, eventos, nameChanges]);

  // Opciones de los desplegables (derivadas del dataset activo)
  const users = useMemo(() => {
    const set = new Set<string>();
    for (const r of printRecords) set.add(r.printed_by_name?.trim() || 'Sin atribución');
    for (const e of eventos)      set.add(e.actor_name?.trim()      || 'Sin atribución');
    for (const c of nameChanges)  set.add(c.changed_by_name?.trim() || 'Sin atribución');
    for (const s of Object.values(supervisors)) { const n = s.name?.trim(); if (n) set.add(n); }
    return [...set].sort((a, b) =>
      a === 'Sin atribución' ? 1 : b === 'Sin atribución' ? -1 : a.localeCompare(b));
  }, [printRecords, eventos, nameChanges, supervisors]);

  const stores = useMemo(() => {
    const set = new Set<string>();
    for (const r of printRecords) { const c = r.state_key.split('__')[0]; if (c) set.add(c); }
    for (const e of eventos) { const c = e.store_cod ?? (e.state_key ? e.state_key.split('__')[0] : ''); if (c) set.add(c); }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [printRecords, eventos]);

  // Pickers asignados presentes (picker_label de impresiones + altas/bajas)
  const pickers = useMemo(() => {
    const set = new Set<string>();
    for (const r of printRecords) { const p = r.picker_label?.trim(); if (p) set.add(p); }
    for (const e of eventos) { const p = e.picker_label?.trim(); if (p) set.add(p); }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [printRecords, eventos]);

  const ayer = useMemo(() => shiftDate(today, -1), [today]);

  const toggleType = (cat: FilterCat) => setTypeFilter(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });
  const hasFilters = userFilters.size > 0 || !!storeFilter || !!pickerFilter || typeFilter.size > 0;
  const clearFilters = () => { setUserFilters(new Set()); setStoreFilter(null); setPickerFilter(null); setTypeFilter(new Set()); };
  const toggleUser = (u: string) => setUserFilters(prev => {
    const next = new Set(prev);
    if (next.has(u)) next.delete(u); else next.add(u);
    return next;
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Barra de fecha + resumen + filtros ── */}
      <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: '#E2E8F0', background: '#FAFBFC' }}>
        {/* Fila 1: fecha */}
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={15} style={{ color: '#64748B' }} />
          <button
            onClick={() => setSelectedDate(today)}
            className="text-[12px] font-semibold px-2.5 py-1 rounded transition-colors"
            style={isToday ? { background: '#1E40AF', color: '#fff' } : { background: '#F1F5F9', color: '#475569' }}
          >Hoy</button>
          <button
            onClick={() => setSelectedDate(ayer)}
            className="text-[12px] font-semibold px-2.5 py-1 rounded transition-colors"
            style={selectedDate === ayer ? { background: '#1E40AF', color: '#fff' } : { background: '#F1F5F9', color: '#475569' }}
          >Ayer</button>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
            className="text-[12px] font-medium px-2 py-1 rounded border bg-white"
            style={{ borderColor: '#CBD5E1', color: '#334155' }}
          />
          {loading && <Loader2 size={14} className="animate-spin" style={{ color: '#94A3B8' }} />}
          {!isToday && (
            <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: '#FEF9C3', color: '#854D0E' }}>
              Día anterior (histórico)
            </span>
          )}
        </div>

        {/* Fila 2: resumen = botones-toggle de tipo (combinables). El conteo es del día completo. */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <ResumenChip icon={<Printer size={12} />} label="impresiones" value={resumen.impresiones} color="#1E40AF"
            active={typeFilter.has('print')} onClick={() => toggleType('print')} />
          <ResumenChip icon={<PlusCircle size={12} />} label="creados" value={resumen.creados} color="#15803D"
            active={typeFilter.has('crear')} onClick={() => toggleType('crear')} />
          <ResumenChip icon={<MinusCircle size={12} />} label="eliminados" value={resumen.eliminados} color="#B45309"
            active={typeFilter.has('eliminar')} onClick={() => toggleType('eliminar')} />
          <ResumenChip icon={<AlertTriangle size={12} />} label="errores" value={resumen.errores} color="#DC2626"
            active={typeFilter.has('error')} highlight={resumen.errores > 0 && !typeFilter.has('error')}
            onClick={() => toggleType('error')} />
        </div>

        {/* Fila 3: filtros por cuenta (multi) y tienda/picker (buscables) */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[11px] font-semibold" style={{ color: '#64748B' }}>Ver:</span>
          <MultiSelect values={userFilters} onToggle={toggleUser} onClear={() => setUserFilters(new Set())}
            options={users} allLabel="Todas las cuentas" />
          <span className="text-[11px] font-semibold" style={{ color: '#64748B' }}>Tienda:</span>
          <SearchSelect value={storeFilter} onChange={setStoreFilter} options={stores} allLabel="Todas" placeholder="Buscar tienda…" />
          <span className="text-[11px] font-semibold" style={{ color: '#64748B' }}>Picker:</span>
          <SearchSelect value={pickerFilter} onChange={setPickerFilter} options={pickers} allLabel="Todos" placeholder="Buscar picker…" />
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold px-2 py-1 rounded"
              style={{ background: '#FEE2E2', color: '#B91C1C' }}
            >Limpiar filtros</button>
          )}
        </div>
      </div>

      {/* ── Listado ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && !histo ? (
          <div className="flex items-center justify-center py-16 text-[13px]" style={{ color: '#94A3B8' }}>
            <Loader2 size={16} className="animate-spin mr-2" /> Cargando actividad…
          </div>
        ) : (
          <SupervisorActivityPanel
            printRecords={printRecords}
            nameChanges={nameChanges}
            palletSlots={palletSlots}
            supervisors={supervisors}
            eventos={eventos}
            userFilters={userFilters}
            storeFilter={storeFilter}
            pickerFilter={pickerFilter}
            typeFilter={typeFilter}
            onStoreClick={(cod) => setStoreFilter(cod)}
          />
        )}
      </div>
    </div>
  );
}

function ResumenChip({ icon, label, value, color, active = false, highlight = false, onClick }: {
  icon: ReactNode; label: string; value: number; color: string; active?: boolean; highlight?: boolean; onClick?: () => void;
}) {
  const style = active
    ? { background: color, border: `1px solid ${color}`, color: '#fff' }
    : { background: highlight ? '#FEF2F2' : '#fff', border: `1px solid ${highlight ? '#FECACA' : '#E2E8F0'}`, color };
  const cls = 'inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded transition'
    + (onClick ? ' cursor-pointer' : '');
  const inner = (
    <>
      {icon}
      <span style={{ color: active ? '#fff' : '#0F172A', fontWeight: 700 }}>{value}</span>
      <span style={{ color: active ? 'rgba(255,255,255,0.9)' : '#64748B', fontWeight: 500 }}>{label}</span>
    </>
  );
  if (!onClick) return <span className={cls} style={style}>{inner}</span>;
  return <button type="button" onClick={onClick} aria-pressed={active} className={cls} style={style}>{inner}</button>;
}

/** Hook: cierra el dropdown al hacer click fuera. */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);
  return ref;
}

/** Selector único con búsqueda (Tienda / Picker). null = todas. */
function SearchSelect({ value, onChange, options, allLabel, placeholder }: {
  value: string | null; onChange: (v: string | null) => void;
  options: string[]; allLabel: string; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useClickOutside(open, () => setOpen(false));
  const filtered = q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setQ(''); }}
        className="text-[12px] px-2 py-1 rounded border bg-white inline-flex items-center gap-1"
        style={{ borderColor: '#CBD5E1', color: value ? '#1E293B' : '#64748B' }}>
        <span className="truncate" style={{ maxWidth: 140 }}>{value ?? allLabel}</span>
        <span style={{ color: '#94A3B8' }}>▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 bg-white border rounded shadow-lg" style={{ borderColor: '#CBD5E1' }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
            className="w-full px-2 py-1.5 text-[12px] border-b outline-none" style={{ borderColor: '#E2E8F0' }} />
          <div className="max-h-56 overflow-auto py-1">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50"
              style={{ color: !value ? '#1E40AF' : '#475569', fontWeight: !value ? 700 : 500 }}>{allLabel}</button>
            {filtered.map(o => (
              <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50"
                style={{ color: value === o ? '#1E40AF' : '#334155', fontWeight: value === o ? 700 : 500 }}>{o}</button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-[11px]" style={{ color: '#94A3B8' }}>Sin resultados</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Selector múltiple con búsqueda (Cuentas). vacío = todas. */
function MultiSelect({ values, onToggle, onClear, options, allLabel }: {
  values: Set<string>; onToggle: (v: string) => void; onClear: () => void;
  options: string[]; allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useClickOutside(open, () => setOpen(false));
  const filtered = q.trim() ? options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const label = values.size === 0 ? allLabel : values.size === 1 ? [...values][0] : `${values.size} cuentas`;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(o => !o); setQ(''); }}
        className="text-[12px] px-2 py-1 rounded border bg-white inline-flex items-center gap-1"
        style={{ borderColor: '#CBD5E1', color: values.size ? '#1E293B' : '#64748B' }}>
        <span className="truncate" style={{ maxWidth: 160 }}>{label}</span>
        <span style={{ color: '#94A3B8' }}>▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-60 bg-white border rounded shadow-lg" style={{ borderColor: '#CBD5E1' }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cuenta…"
            className="w-full px-2 py-1.5 text-[12px] border-b outline-none" style={{ borderColor: '#E2E8F0' }} />
          <div className="max-h-56 overflow-auto py-1">
            {values.size > 0 && (
              <button type="button" onClick={onClear}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50" style={{ color: '#B91C1C', fontWeight: 600 }}>
                Quitar selección ({values.size})
              </button>
            )}
            {filtered.map(o => {
              const checked = values.has(o);
              return (
                <button key={o} type="button" onClick={() => onToggle(o)}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-slate-50 flex items-center gap-2" style={{ color: '#334155' }}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] flex-shrink-0"
                    style={{ borderColor: checked ? '#1E40AF' : '#CBD5E1', background: checked ? '#1E40AF' : '#fff', color: '#fff' }}>
                    {checked ? '✓' : ''}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="px-3 py-2 text-[11px]" style={{ color: '#94A3B8' }}>Sin resultados</div>}
          </div>
        </div>
      )}
    </div>
  );
}
