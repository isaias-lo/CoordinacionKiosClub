'use client';

import { useMemo } from 'react';
import { Printer, Tag, User, Wifi } from 'lucide-react';
import type { PrintRecord, PickerNameChange, PalletSlot, SupervisorPresence, SupervisorPrint } from '../picking-types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function TipoBadge({ tipos }: { tipos: string[] }) {
  const hasP  = tipos.includes('P');
  const hasB  = tipos.includes('B');
  const hasC  = tipos.includes('C');
  const hasCH = tipos.includes('CH');
  const parts: string[] = [];
  if (hasP)  parts.push('Pallet');
  if (hasB)  parts.push('Bulto');
  if (hasC)  parts.push('Cont.');
  if (hasCH) parts.push('Choc.');
  const label   = parts.join(' + ') || '—';
  const isMulti = parts.length > 1;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{
        background: isMulti ? '#EFF6FF' : hasB ? '#F0FDF4' : hasC ? '#FAF5FF' : '#EFF6FF',
        color:      isMulti ? '#1E40AF' : hasB ? '#15803D' : hasC ? '#6B21A8' : '#1E40AF',
        border:     `1px solid ${isMulti ? '#BFDBFE' : hasB ? '#BBF7D0' : hasC ? '#E9D5FF' : '#BFDBFE'}`,
      }}>
      {label}
    </span>
  );
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

type AnyEv = PrintEv | NameEv;

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
}

export function SupervisorActivityPanel({ printRecords, nameChanges, palletSlots, supervisors }: Props) {

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
    const byName: Record<string, { dbPrints: PrintRecord[]; presencePrints: SupervisorPrint[]; nameEvs: PickerNameChange[]; isLive: boolean }> = {};

    const ensure = (name: string) => {
      if (!byName[name]) byName[name] = { dbPrints: [], presencePrints: [], nameEvs: [], isLive: false };
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
  }, [printRecords, nameChanges, palletSlots, supervisors, unitsByKey]);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-8">
        <div className="mb-4 opacity-20"><User size={48} strokeWidth={1.5} className="text-slate-400" /></div>
        <div className="text-[14px] font-medium text-slate-400">Sin actividad registrada hoy</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
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
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[11px] font-mono flex-shrink-0" style={{ color: '#94A3B8', minWidth: 36 }}>
                  {fmtTime(ev.at)}
                </span>

                {ev.kind === 'print' ? (
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
