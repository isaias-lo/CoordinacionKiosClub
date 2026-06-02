'use client';

import React, { useState } from 'react';
import { BarcodeCard } from '@/features/despacho/shared/BarcodeCard';
import type { PickerGroup, PickingOperation, PalletSlot, PickerType } from '../picking-types';
import { STATE_INFO, sanitizeForBarcode, buildCanonicalId, todayISO } from '../picking-utils';

// ─── StateBadge ───────────────────────────────────────────────────────────────

export function StateBadge({ state }: { state: string }) {
  const info = STATE_INFO[state] ?? { label: state, color: '#6B7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.25)' };
  return (
    <span className="inline-flex items-center text-[12px] font-bold px-2.5 py-0.5 rounded-full shrink-0"
      style={{ color: info.color, background: info.bg, border: `1px solid ${info.border}` }}>
      {state === 'done' ? '✓ ' : ''}{info.label}
    </span>
  );
}

// ─── PickerGroupCard ──────────────────────────────────────────────────────────

interface Props {
  group: PickerGroup;
  displayName: string;
  palletsByTipo: Record<string, number>;
  onNameChange: (v: string) => void;
  onTipoPalletsChange: (tipo: PickerType, n: number) => void;
  onRefreshOp: (op: PickingOperation) => void;
  onPrint: () => void;
  refreshingId: number | null;
  totalPickers: number;
  assignedNums: number[];
  isPrinted: boolean;
  colsPerRow: number;
  onPrintSelected: (palletNums: Set<number>) => void;
  slots: PalletSlot[];
  stickerBelow?: boolean;
}

export const PickerGroupCard = React.memo(function PickerGroupCard({
  group, displayName, palletsByTipo, onNameChange, onTipoPalletsChange,
  onRefreshOp, onPrint, refreshingId, totalPickers, assignedNums,
  isPrinted, colsPerRow, onPrintSelected, slots, stickerBelow,
}: Props) {
  const allDone       = group.operations.every(o => o.state === 'done');
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const refs          = group.operations.map(o => o.name).join('+');
  const cats          = allCategories.join(',');
  const pickerLabel   = displayName || group.key;
  const barcodePickerName = sanitizeForBarcode(pickerLabel);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const toggleIndex = (i: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handlePrintSelected = () => {
    const nums = new Set([...selectedIndices].map(i => assignedNums[i]).filter(n => n !== undefined));
    onPrintSelected(nums);
    setSelectedIndices(new Set());
  };

  const borderColor = allDone || isPrinted ? 'rgba(22,163,74,0.45)' : 'rgba(26,37,80,0.12)';
  const shadow      = allDone || isPrinted ? '0 2px 16px rgba(22,163,74,0.14)' : '0 1px 8px rgba(26,37,80,0.07)';

  return (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor, boxShadow: shadow }}>
      {/* Card header */}
      <div className="px-5 py-3 border-b flex items-center justify-between"
        style={{
          background:  allDone || isPrinted ? 'rgba(22,163,74,0.05)' : 'rgba(26,37,80,0.02)',
          borderColor: allDone || isPrinted ? 'rgba(22,163,74,0.18)' : '#F0F2F5',
        }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[14px] font-bold text-navy bg-[rgba(26,37,80,0.09)] px-3 py-1 rounded-lg shrink-0">{group.key}</span>
          {displayName && <span className="text-[16px] font-semibold text-text truncate">{displayName}</span>}
          {allDone && <span className="text-[13px] font-bold text-[#16A34A] shrink-0">✓ Realizado</span>}
          {isPrinted && (
            <span className="text-[12px] font-bold shrink-0 px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.35)' }}>
              🖨 Ya impreso
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {allCategories.map(c => (
            <span key={c} className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(26,37,80,0.07)] text-navy">{c}</span>
          ))}
          <span className="text-[13px] text-text-3">{group.operations.length} op.</span>
        </div>
      </div>

      {/* Split body */}
      <div className={stickerBelow ? 'flex flex-col' : 'flex flex-col lg:flex-row'}>

        {/* LEFT: Form */}
        <div className={`${stickerBelow ? 'w-full border-b' : 'lg:w-[45%] border-b lg:border-b-0 lg:border-r'} p-5 border-gray-100 print:hidden space-y-4`}>

          {/* Operaciones */}
          <div className={group.operations.length > 1 ? 'flex flex-wrap gap-2' : ''}>
            {group.operations.map(op => (
              <div key={op.id}
                className={`flex items-start gap-2 ${group.operations.length > 1
                  ? 'flex-1 min-w-[150px] border border-gray-100 rounded-xl p-3 bg-[#FAFAFA]'
                  : 'pb-2'
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[14px] font-bold text-navy">{op.name}</span>
                    <StateBadge state={op.state} />
                  </div>
                  {op.categories.length > 0 && (
                    <div className="text-[13px] text-text-3 mt-0.5">{op.categories.join(' · ')}</div>
                  )}
                  {(op.fromLocation || op.toLocation) && (
                    <div className="text-[12px] text-text-3 mt-0.5">
                      {op.fromLocation && <span><span className="font-semibold text-text-2">De:</span> {op.fromLocation}</span>}
                      {op.fromLocation && op.toLocation && <span className="mx-1">→</span>}
                      {op.toLocation && <span><span className="font-semibold text-text-2">A:</span> <span className="font-semibold text-navy">{op.toLocation}</span></span>}
                    </div>
                  )}
                  {op.lineCount > 0 && (
                    <div className="text-[12px] font-semibold mt-0.5" style={{ color: '#4B5563' }}>
                      {op.lineCount} línea{op.lineCount !== 1 ? 's' : ''}
                    </div>
                  )}
                  {op.origin && <div className="text-[11px] text-text-3 mt-0.5 truncate">{op.origin}</div>}
                </div>
                {op.state !== 'done' && (
                  <button onClick={() => onRefreshOp(op)} disabled={refreshingId === op.id}
                    className="text-[13px] shrink-0 border rounded-full px-2.5 py-1.5 cursor-pointer disabled:opacity-40"
                    style={{ borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                    {refreshingId === op.id ? '⏳' : '↻'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Nombre del picker */}
          <div>
            <label className="text-[12px] font-bold text-text-3 uppercase tracking-wide block mb-1.5">
              Nombre del picker <span className="text-amber-600 font-bold">*</span>
              <span className="ml-1 text-[11px] font-normal normal-case text-text-3">(se incluye en el código)</span>
            </label>
            <input type="text" value={displayName} onChange={e => onNameChange(e.target.value)}
              placeholder={`${group.key} — ingresa nombre real…`}
              className="w-full border rounded-xl px-4 py-3 text-[16px] font-barlow text-text bg-white outline-none transition-colors"
              style={{ borderColor: displayName ? 'rgba(22,163,74,0.5)' : 'rgba(217,119,6,0.5)' }} />
            {!displayName && (
              <div className="text-[12px] text-amber-600 mt-1">⚠ Se usará &quot;{group.key}&quot; si no ingresas nombre</div>
            )}
          </div>

          {/* Contadores P / C / B / CH */}
          <div>
            <label className="text-[10px] font-black text-text-3 uppercase tracking-[1.5px] block mb-2">Unidades a despachar</label>
            <div className="flex gap-2">
              {([
                { tipo: 'P'  as PickerType, label: 'PALLETS',      color: '#1E3A8A' },
                { tipo: 'C'  as PickerType, label: 'CONTENEDORES', color: '#6B21A8' },
                { tipo: 'B'  as PickerType, label: 'BULTOS',       color: '#065F46' },
                { tipo: 'CH' as PickerType, label: 'CHOCOLATES',   color: '#92400E' },
              ]).map(({ tipo, label, color }) => {
                const count = palletsByTipo[tipo] ?? 0;
                return (
                  <div key={tipo} className="flex-1 flex flex-col items-center gap-2 py-3 px-1.5 rounded-2xl border-2 transition-all"
                    style={{
                      borderColor: count > 0 ? color : 'rgba(26,37,80,0.09)',
                      background:  count > 0 ? `linear-gradient(160deg, ${color}12 0%, ${color}06 100%)` : 'rgba(249,250,251,0.7)',
                      boxShadow:   count > 0 ? `0 4px 14px ${color}22, inset 0 1px 0 rgba(255,255,255,0.8)` : '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                    <div className="text-center leading-none">
                      <div className="text-[14px] font-black leading-none" style={{ color: count > 0 ? color : '#CBD5E1' }}>{tipo}</div>
                      <div className="text-[8px] font-black uppercase tracking-wide mt-0.5" style={{ color: count > 0 ? `${color}99` : '#CBD5E1' }}>{label}</div>
                    </div>
                    <div className="flex items-center gap-1.5 w-full justify-center">
                      <button onClick={() => onTipoPalletsChange(tipo, Math.max(0, count - 1))}
                        className="w-8 h-8 rounded-full font-bold text-[18px] flex items-center justify-center cursor-pointer transition-all active:scale-95"
                        style={{ border: '1.5px solid rgba(26,37,80,0.14)', color: '#6B7280', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>−</button>
                      <span className="w-8 text-center text-[26px] font-barlow-condensed font-black leading-none"
                        style={{ color: count > 0 ? color : '#D1D5DB' }}>{count}</span>
                      <button onClick={() => onTipoPalletsChange(tipo, count + 1)}
                        className="w-8 h-8 rounded-full font-bold text-[18px] flex items-center justify-center cursor-pointer transition-all active:scale-95"
                        style={{ border: `1.5px solid ${color}`, color: '#fff', background: color, boxShadow: `0 2px 8px ${color}50` }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT / BOTTOM */}
        <div className={`${stickerBelow ? 'w-full border-t border-gray-100' : 'lg:w-[55%]'} p-4 bg-[#FAFAFA]`}>
          {!allDone ? (
            <div className="h-full min-h-[180px] flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-bold text-amber-700">⚠ Operaciones pendientes</span>
                <span className="text-[11px] text-text-3">Completa todas para generar etiquetas</span>
              </div>
              {group.operations.map(op => {
                const info = STATE_INFO[op.state] ?? STATE_INFO.draft;
                return (
                  <div key={op.id} className="flex items-center gap-3 bg-white border rounded-xl px-4 py-3"
                    style={{ borderColor: info.border }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[13px] font-bold text-navy">{op.name}</span>
                        <StateBadge state={op.state} />
                        {op.lineCount > 0 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(26,37,80,0.07)', color: '#374151' }}>
                            {op.lineCount} líneas
                          </span>
                        )}
                      </div>
                      {op.categories.length > 0 && (
                        <div className="text-[12px] text-text-3 mt-0.5">{op.categories.join(' · ')}</div>
                      )}
                    </div>
                    {op.state !== 'done' && (
                      <button onClick={() => onRefreshOp(op)} disabled={refreshingId === op.id}
                        className="text-[13px] shrink-0 border rounded-full px-2.5 py-1.5 cursor-pointer disabled:opacity-40"
                        style={{ borderColor: 'rgba(37,99,235,0.35)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                        {refreshingId === op.id ? '⏳' : '↻'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : assignedNums.length === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-text-3">
              <div className="text-[40px] opacity-30">▊▊▊▊</div>
              <div className="text-[14px] text-center">Ingresa la cantidad de unidades<br/>para generar los códigos</div>
            </div>
          ) : (
            <div>
              <div className="print:hidden flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="text-[13px] font-semibold text-text-2">
                  {assignedNums.length} código{assignedNums.length !== 1 ? 's' : ''}
                  {selectedIndices.size > 0 && (
                    <span className="ml-2 text-[12px] font-normal text-blue-600">
                      · {selectedIndices.size} seleccionada{selectedIndices.size !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedIndices.size > 0 && (
                    <>
                      <button onClick={() => setSelectedIndices(new Set())}
                        className="text-[12px] cursor-pointer px-3 py-1.5 rounded-xl border transition-all"
                        style={{ borderColor: 'rgba(37,99,235,0.3)', color: '#2563EB', background: 'rgba(37,99,235,0.06)' }}>
                        ✕ Limpiar
                      </button>
                      <button onClick={handlePrintSelected}
                        className="flex items-center gap-1.5 text-[13px] font-bold cursor-pointer px-3 py-1.5 rounded-xl transition-all active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #1E3A8A, #2563EB)', color: '#fff' }}>
                        🖨 Imprimir {selectedIndices.size}
                      </button>
                    </>
                  )}
                  <button onClick={onPrint}
                    className="flex items-center gap-1.5 text-[14px] font-bold cursor-pointer px-4 py-2 rounded-xl transition-all active:scale-95"
                    style={isPrinted
                      ? { background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.4)' }
                      : { background: 'linear-gradient(135deg, #78350F, #D97706)', color: '#fff' }}>
                    {isPrinted ? '↺ Re-imprimir todas' : selectedIndices.size > 0 ? '🖨 Todas' : '🖨 Imprimir'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {assignedNums.map((pNum, i) => {
                  const isSelected = selectedIndices.has(i);
                  const slot       = slots[i];
                  const slotTipo   = (slot?.tipo as PickerType | undefined) ?? 'P';
                  const tipoTotal  = slots.filter(s => ((s.tipo as PickerType | undefined) ?? 'P') === slotTipo).length;
                  const itemWidth  = `calc((100% - ${(colsPerRow - 1) * 8}px) / ${colsPerRow})`;
                  return (
                    <div key={slot?.id ?? i}
                      style={{ width: itemWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div onClick={() => toggleIndex(i)}
                        style={{
                          position: 'relative', cursor: 'pointer', borderRadius: 10,
                          outline: isSelected ? '2.5px solid #2563EB' : '2.5px solid transparent',
                          transition: 'outline 0.15s',
                        }}>
                        <BarcodeCard
                          value={`${group.storeCod};${barcodePickerName};${refs};${slotTipo}${pNum};${cats}`}
                          palletNum={pNum} total={tipoTotal}
                          storeCod={group.storeCod} pickerLabel={pickerLabel}
                          responsibleKey={group.key} allCategories={allCategories}
                          totalPickers={totalPickers} tipo={slotTipo}
                          slotId={slot?.id}
                          canonicalId={buildCanonicalId(slotTipo, pNum, group.storeCod, todayISO())}
                          compact
                        />
                        {isSelected && (
                          <div style={{
                            position: 'absolute', top: 6, right: 6,
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(37,99,235,0.4)',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
