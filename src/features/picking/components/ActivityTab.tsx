'use client';

import { useState } from 'react';
import { Users, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import type { SupervisorPresence, PickerNameChange, PickerGroup } from '../picking-types';
import { TIPO_LABEL, relativeTime } from '../picking-utils';

// ─── SupervisorActivityPanel ──────────────────────────────────────────────────

interface ActivityPanelProps {
  supervisors: Record<string, SupervisorPresence>;
  now: number;
  nameChanges: PickerNameChange[];
}

export function SupervisorActivityPanel({ supervisors, now, nameChanges }: ActivityPanelProps) {
  const [collapsed, setCollapsed]           = useState(false);
  const [namesCollapsed, setNamesCollapsed] = useState(false);
  const list = Object.values(supervisors);
  if (list.length === 0 && nameChanges.length === 0) return null;

  return (
    <div className="mx-4 mt-4 rounded overflow-hidden print:hidden"
      style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <button type="button" onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer border-none bg-transparent">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: '#F1F5F9' }}>
            <Users size={16} className="text-slate-500" />
          </div>
          <div className="text-left">
            <div className="text-[11px] text-slate-400 leading-none mb-0.5">En turno</div>
            <div className="font-semibold text-[14px] text-slate-700">
              {list.length === 0 ? 'Sin supervisores activos' : list.length === 1 ? '1 supervisor activo' : `${list.length} supervisores activos`}
            </div>
          </div>
          <div className="flex gap-1.5 ml-1 flex-wrap">
            {list.map(s => (
              <span key={s.userId}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-0.5 rounded"
                style={{ background: '#EFF6FF', color: '#1E40AF' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 inline-block" />
                {s.name.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
        {collapsed ? <ChevronDown size={15} className="text-slate-400 ml-2" /> : <ChevronUp size={15} className="text-slate-400 ml-2" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-[rgba(37,99,235,0.10)]">
          {list.map(sup => (
            <div key={sup.userId} className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0"
                    style={{ boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }} />
                  <span className="font-black text-[16px] text-navy">{sup.name}</span>
                </div>
                <span className="text-[11px] font-semibold text-text-3 bg-white/60 px-2 py-0.5 rounded-full">{relativeTime(sup.lastActive, now)}</span>
              </div>
              {sup.recentPrints.length === 0 ? (
                <div className="text-[12px] text-text-3 italic">Sin impresiones aún este turno</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {sup.recentPrints.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span className="font-mono font-bold text-navy bg-[rgba(26,37,80,0.06)] px-1.5 py-0.5 rounded text-[11px] flex-shrink-0">{p.storeCod}</span>
                      <span className="text-text-2 truncate flex-1">{p.pickerLabel}</span>
                      <span className="flex-shrink-0 font-bold text-text-3">{p.pallets}p</span>
                      <span className="flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: 'rgba(26,37,80,0.06)', color: '#475569' }}>
                        {TIPO_LABEL[p.tipo] ?? p.tipo}
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-text-3">
                        {new Date(p.printedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {nameChanges.length > 0 && (
        <div className="border-t" style={{ borderColor: 'rgba(37,99,235,0.12)' }}>
          <button type="button" onClick={() => setNamesCollapsed(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer border-none"
            style={{ background: '#F8FAFC' }}>
            <div className="flex items-center gap-2 text-[12px] font-medium text-slate-500">
              <Tag size={12} />
              Cambios de nombre · {nameChanges.length}
            </div>
            {namesCollapsed ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronUp size={13} className="text-slate-400" />}
          </button>
          {!namesCollapsed && (
            <div className="px-4 pb-3 flex flex-col gap-1.5">
              {nameChanges.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-[12px]">
                  <span className="font-mono font-bold text-navy bg-[rgba(26,37,80,0.06)] px-1.5 py-0.5 rounded text-[11px] flex-shrink-0">{c.picker_key}</span>
                  <span className="text-text-3 flex-shrink-0 text-[10px]">«{c.old_name || '—'}»</span>
                  <span className="text-[10px] text-text-3 flex-shrink-0">→</span>
                  <span className="font-semibold text-navy flex-1 truncate">«{c.new_name || '—'}»</span>
                  <span className="flex-shrink-0 text-[11px] text-text-3">{c.changed_by_name}</span>
                  <span className="flex-shrink-0 text-[10px] text-text-3">{new Date(c.changed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TurnoSummary ─────────────────────────────────────────────────────────────

interface TurnoSummaryProps {
  allGroups: PickerGroup[];
  pickerPallets: Record<string, number>;
  printedKeys: Set<string>;
  selectedCods: string[];
}

export function TurnoSummary({ allGroups, pickerPallets, printedKeys, selectedCods }: TurnoSummaryProps) {
  const realGroups   = allGroups.filter(g => g.key !== 'Sin asignar');
  const totalPickers = realGroups.length;
  const printedCount = realGroups.filter(g => printedKeys.has(g.stateKey)).length;
  const totalPallets = realGroups.reduce((s, g) => s + (pickerPallets[g.stateKey] ?? 0), 0);
  const pct = totalPickers > 0 ? Math.round((printedCount / totalPickers) * 100) : 0;

  if (totalPickers === 0) return null;

  return (
    <div className="mx-4 mt-3 mb-1 rounded overflow-hidden print:hidden flex-shrink-0"
      style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-4 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-bold" style={{ color: '#1A2550' }}>
              {printedCount}<span className="font-normal" style={{ color: '#9CA3AF' }}>/{totalPickers}</span> pickers impresos
            </span>
            <span className="text-[12px] font-bold" style={{ color: pct === 100 ? '#16A34A' : '#D97706' }}>{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? '#16A34A' : '#1E40AF',
              }} />
          </div>
        </div>
        <div className="shrink-0 text-right border-l pl-4" style={{ borderColor: '#F1F5F9' }}>
          <div className="text-[22px] font-black leading-none" style={{ color: '#1A2550' }}>{totalPallets}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>pallets</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {selectedCods.map(cod => {
          const groups      = realGroups.filter(g => g.storeCod === cod);
          const allPrinted  = groups.length > 0 && groups.every(g => printedKeys.has(g.stateKey));
          const somePrinted = groups.some(g => printedKeys.has(g.stateKey));
          const dotColor = allPrinted ? '#16A34A' : somePrinted ? '#D97706' : '#CBD5E1';
          const bg     = allPrinted ? 'rgba(22,163,74,0.1)' : somePrinted ? 'rgba(217,119,6,0.1)' : 'rgba(26,37,80,0.05)';
          const border = allPrinted ? 'rgba(22,163,74,0.3)' : somePrinted ? 'rgba(217,119,6,0.3)' : 'rgba(26,37,80,0.1)';
          const color  = allPrinted ? '#16A34A' : somePrinted ? '#92400E' : '#9CA3AF';
          return (
            <div key={cod} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold"
              style={{ background: bg, border: `1px solid ${border}`, color }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
              {cod}
            </div>
          );
        })}
      </div>
    </div>
  );
}
