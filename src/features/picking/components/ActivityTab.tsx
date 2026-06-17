'use client';

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Printer, Tag, User, Wifi, PlusCircle, MinusCircle, AlertTriangle, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PrintRecord, PickerNameChange, PalletSlot, SupervisorPresence, SupervisorPrint } from '../picking-types';
import { TipoBadge } from './TipoBadge';
import { detectarReincidencia, TIPO_LABEL, type PickingEvento } from '../picking-utils';
import { fmtHoraChile } from '@/lib/fechaChile';

function fmtTime(iso: string) {
  return fmtHoraChile(iso);
}

// ─── tipos internos ───────────────────────────────────────────────────────────

type PrintEv = {
  kind:           'print';
  at:             string;
  storeCod:       string;
  pickerLabel:    string;
  pallets:        number;
  bultos:         number;
  tiposPresentes: string[];
  fromPresence:   boolean; // true = dato de Presence (tiempo real, no persistido aún)
};

type NameEv = {
  kind:      'name';
  at:        string;
  pickerKey: string;
  oldName:   string;
  newName:   string;
};

type PalletEv = {
  kind:        'pallet';
  at:          string;
  eventType:   'crear' | 'eliminar';
  storeCod:    string;
  tipo:        string;
  pickerLabel: string;
};

type AnyEv = PrintEv | NameEv | PalletEv;

interface Section {
  name:         string;
  isLive:       boolean; // tiene datos de Presence
  events:       AnyEv[];
}

// ─── componente principal ─────────────────────────────────────────────────────

interface Props {
  printRecords: PrintRecord[];
  nameChanges:  PickerNameChange[];
  palletSlots:  PalletSlot[];
  supervisors:  Record<string, SupervisorPresence>; // otros supervisores en tiempo real
  eventos?:     PickingEvento[];                     // auditoría de altas/bajas de pallets
}

export function SupervisorActivityPanel({ printRecords, nameChanges, palletSlots, supervisors, eventos = [] }: Props) {

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
  }, [printRecords, nameChanges, palletSlots, supervisors, eventos, unitsByKey]);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-8">
        <div className="mb-4 opacity-20"><User size={48} strokeWidth={1.5} className="text-slate-400" /></div>
        <div className="text-[14px] font-medium text-slate-400">Sin actividad registrada</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      {reincidentes.length > 0 && (
        <div className="rounded overflow-hidden"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #FECACA' }}>
            <AlertTriangle size={14} style={{ color: '#DC2626' }} />
            <span className="font-semibold text-[13px]" style={{ color: '#991B1B' }}>
              Creó y borró el mismo pallet (posibles errores)
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: '#FEE2E2' }}>
            {reincidentes.map(([name, n]) => (
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
      {sections.map(sec => (
        <div key={sec.name}
          style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          className="rounded overflow-hidden">

          {/* Header supervisor */}
          <div className="flex items-center gap-3 px-4 py-2.5"
            style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: '#EFF6FF' }}>
              <User size={14} style={{ color: '#1E40AF' }} />
            </div>
            <span className="font-semibold text-[14px]" style={{ color: '#1E293B' }}>{sec.name}</span>
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
                    {ev.eventType === 'crear'
                      ? <PlusCircle size={13} className="flex-shrink-0" style={{ color: '#15803D' }} />
                      : <MinusCircle size={13} className="flex-shrink-0" style={{ color: '#DC2626' }} />}
                    <span className="font-mono font-bold text-[12px] flex-shrink-0 px-1.5 py-0.5 rounded"
                      style={{ background: '#F1F5F9', color: '#334155' }}>
                      {ev.storeCod}
                    </span>
                    <span className="text-[13px] font-medium flex-1 truncate" style={{ color: '#334155' }}>
                      {ev.eventType === 'crear' ? 'Creó' : 'Eliminó'} {TIPO_LABEL[ev.tipo] ?? ev.tipo}
                      {ev.pickerLabel ? ` · ${ev.pickerLabel}` : ''}
                    </span>
                    <span className="flex-shrink-0 text-[11px] font-semibold"
                      style={{ color: ev.eventType === 'crear' ? '#15803D' : '#DC2626' }}>
                      {ev.eventType === 'crear' ? '+' : '−'}
                    </span>
                  </>
                ) : ev.kind === 'print' ? (
                  <>
                    <Printer size={13} className="flex-shrink-0" style={{ color: ev.fromPresence ? '#15803D' : '#64748B' }} />
                    <span className="font-mono font-bold text-[12px] flex-shrink-0 px-1.5 py-0.5 rounded"
                      style={{ background: '#F1F5F9', color: '#334155' }}>
                      {ev.storeCod}
                    </span>
                    <span className="text-[13px] font-medium flex-1 truncate" style={{ color: '#334155' }}>
                      {ev.pickerLabel}
                    </span>
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

// ─── Wrapper con selector de fecha + resumen ──────────────────────────────────
// SupervisorActivityPanel es el renderizador puro (recibe los datos por props).
// Este wrapper decide QUÉ datos mostrar: para HOY usa los datos en vivo de
// PickingScreen (con Presence/tiempo real); para días pasados hace sus propias
// consultas a la BD y oculta "En línea" (Presence solo existe en el momento).

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

/** Carga la actividad persistida de una fecha (Chile). */
async function fetchActivity(date: string): Promise<ActivityData> {
  const [prints, evts, pallets, names] = await Promise.all([
    supabase.from('picking_prints')
      .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name')
      .eq('date', date).order('printed_at', { ascending: true }),
    supabase.from('picking_eventos')
      .select('id, date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, created_at')
      .eq('date', date).order('created_at', { ascending: true }),
    supabase.from('picking_pallets')
      .select('id, store_cod, state_key, picker_label, tipo, contenido, refs, created_at')
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
  /** Fecha de hoy en Chile (YYYY-MM-DD). */
  today: string;
}

export function ActivityTab({ live, today }: ActivityTabProps) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [histo, setHisto] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const isToday = selectedDate === today;

  useEffect(() => {
    if (isToday) { setHisto(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchActivity(selectedDate)
      .then(d => { if (!cancelled) setHisto(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate, isToday]);

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
  }), [printRecords, eventos]);

  const ayer = useMemo(() => shiftDate(today, -1), [today]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Barra de fecha + resumen ── */}
      <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: '#E2E8F0', background: '#FAFBFC' }}>
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

        {/* Resumen del día */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <ResumenChip icon={<Printer size={12} />} label="impresiones" value={resumen.impresiones} color="#1E40AF" />
          <ResumenChip icon={<PlusCircle size={12} />} label="creados"   value={resumen.creados}    color="#15803D" />
          <ResumenChip icon={<MinusCircle size={12} />} label="eliminados" value={resumen.eliminados} color="#B45309" />
          <ResumenChip icon={<AlertTriangle size={12} />} label="errores" value={resumen.errores}
            color={resumen.errores > 0 ? '#DC2626' : '#94A3B8'} highlight={resumen.errores > 0} />
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
          />
        )}
      </div>
    </div>
  );
}

function ResumenChip({ icon, label, value, color, highlight = false }: {
  icon: ReactNode; label: string; value: number; color: string; highlight?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded"
      style={{
        background: highlight ? '#FEF2F2' : '#fff',
        border: `1px solid ${highlight ? '#FECACA' : '#E2E8F0'}`,
        color,
      }}
    >
      {icon}
      <span style={{ color: '#0F172A', fontWeight: 700 }}>{value}</span>
      <span style={{ color: '#64748B', fontWeight: 500 }}>{label}</span>
    </span>
  );
}
