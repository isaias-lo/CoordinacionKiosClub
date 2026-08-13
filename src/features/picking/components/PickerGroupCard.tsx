'use client';

import React, { useState } from 'react';
import { Printer, RotateCcw, AlertTriangle, Package } from 'lucide-react';
import { BarcodeCard } from '@/features/despacho/shared/BarcodeCard';
import type { PickerGroup, PickingOperation, PalletSlot, PickerType, PrintRecord, SectionFilter } from '../picking-types';
import { STATE_INFO, sanitizeForBarcode, buildCanonicalId, todayISO } from '../picking-utils';
import { fmtHoraChile } from '@/lib/fechaChile';

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
  lastPrint?: PrintRecord;   // último registro de impresión para mostrar advertencia de reimpresión
  myName?: string;           // nombre del supervisor actual para detectar impresiones propias vs ajenas
  sectionFilter?: SectionFilter;
  // Card de Congelados: el stepper muestra SOLO Caja Cartón/Caja Negra (nunca P/C/B/CH),
  // se determina por las categorías del grupo, no por `sectionFilter` (que en la vista
  // "Todas" es 'all' para todas las cards sin importar la columna).
  isCongelados?: boolean;
  adelanto?: { fecha_despacho: string | null }; // si la tienda es un adelanto
  otroDia?: boolean; // fecha del "Documento origen" en Odoo distinta a hoy — solo advertencia
}

export const PickerGroupCard = React.memo(function PickerGroupCard({
  group, displayName, palletsByTipo, onNameChange, onTipoPalletsChange,
  onRefreshOp, onPrint, refreshingId, totalPickers, assignedNums,
  isPrinted, colsPerRow, onPrintSelected, slots, stickerBelow,
  lastPrint, myName, sectionFilter, isCongelados, adelanto, otroDia,
}: Props) {
  const allDone       = group.operations.every(o => o.state === 'done');
  const allCategories = [...new Set(group.operations.flatMap(o => o.categories))];
  const refs          = group.operations.map(o => o.name).join('+');
  const cats          = allCategories.join(',');
  const pickerLabel   = displayName || group.key;
  const barcodePickerName = sanitizeForBarcode(pickerLabel);

  const [selectedIndices, setSelectedIndices]             = useState<Set<number>>(new Set());
  // Confirm inline al decrementar un pallet que ya fue impreso
  const [pendingDecrementTipo, setPendingDecrementTipo]   = useState<PickerType | null>(null);

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

  const borderColor = allDone || isPrinted ? 'rgba(22,163,74,0.3)' : 'var(--color-border)';
  const shadow      = '0 1px 3px rgba(0,0,0,0.06)';

  return (
    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor, boxShadow: shadow }}>
      {/* Advertencia: fecha del Documento origen (Odoo) distinta a hoy */}
      {otroDia && (
        <div className="px-4 py-2 flex items-center gap-2" style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}>
          <AlertTriangle size={13} style={{ color: '#92400E', flexShrink: 0 }} />
          <span className="text-[12px] font-medium" style={{ color: '#92400E' }}>
            La fecha del documento origen no coincide con hoy — verifica antes de trabajarlo
          </span>
        </div>
      )}
      {/* Card header */}
      <div className="px-4 py-2.5 border-b flex items-center gap-3 min-w-0" style={{ borderColor: 'var(--color-border)', background: '#fff' }}>
        <span className="font-mono text-[12px] font-semibold shrink-0 px-2 py-0.5 rounded"
          style={{ background: 'rgba(0,0,0,0.04)', color: '#475569' }}>{group.key}</span>
        {displayName && <span className="text-[14px] font-semibold text-slate-700 truncate flex-1">{displayName}</span>}
        {!displayName && <span className="flex-1" />}
        {allCategories.map(c => (
          <span key={c} className="text-[11px] font-medium px-2 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(0,0,0,0.04)', color: '#64748B' }}>{c}</span>
        ))}
        <span className="text-[11px] text-slate-400 shrink-0">{group.operations.length} op.</span>
        {(allDone || isPrinted) && (
          <span className="text-[11px] font-medium shrink-0 px-2 py-0.5 rounded"
            style={{ background: '#DCFCE7', color: '#16A34A' }}>
            {isPrinted ? 'Impreso' : 'Realizado'}
          </span>
        )}
      </div>

      {/* Split body */}
      <div className={stickerBelow ? 'flex flex-col' : 'flex flex-col lg:flex-row'}>

        {/* LEFT: Form */}
        <div className={`${stickerBelow ? 'w-full border-b' : 'lg:w-[45%] border-b lg:border-b-0 lg:border-r'} p-4 border-border print:hidden space-y-4`}>

          {/* Operaciones */}
          <div className={group.operations.length > 1 ? 'flex flex-wrap gap-2' : ''}>
            {group.operations.map(op => (
              <div key={op.id}
                className={`flex items-start gap-2 ${group.operations.length > 1
                  ? 'flex-1 min-w-[150px] border border-border rounded-lg p-3 bg-[#FAFAFA]'
                  : 'pb-2'
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[14px] font-bold text-navy">{op.name}</span>
                    <StateBadge state={op.state} />
                    {op.batch && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded"
                        style={{ background: '#EDE9FE', color: '#6D28D9', border: '1px solid #DDD6FE' }}
                        title="Transferir Agrupación (Odoo)">
                        🏷 {op.batch}
                      </span>
                    )}
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
                    className="shrink-0 border rounded p-1.5 cursor-pointer disabled:opacity-40"
                    style={{ borderColor: 'var(--color-border)', color: '#64748B', background: '#fff' }}>
                    <RotateCcw size={12} className={refreshingId === op.id ? 'animate-spin' : ''} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Nombre del picker */}
          <div>
            <label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide block mb-1.5">
              Nombre del picker <span className="text-amber-600 font-semibold">*</span>
              <span className="ml-1 text-[11px] font-normal normal-case text-text-3">(se incluye en el código)</span>
            </label>
            <input type="text" value={displayName} onChange={e => onNameChange(e.target.value)}
              placeholder={`${group.key} — ingresa nombre real…`}
              className="w-full border rounded-lg px-4 py-3 text-[16px] font-barlow text-text bg-white outline-none transition-colors"
              style={{ borderColor: displayName ? 'rgba(22,163,74,0.5)' : 'rgba(217,119,6,0.5)' }} />
            {!displayName && (
              <div className="text-[12px] text-amber-600 mt-1"><AlertTriangle size={12} className="inline text-amber-600 mr-1" />Se usará &quot;{group.key}&quot; si no ingresas nombre</div>
            )}
          </div>

          {/* Contadores P / C / B / CH */}
          <div>
            <label className="text-[11px] font-medium text-slate-400 block mb-2">Unidades a despachar</label>
            <div className="flex gap-2">
              {([
                { tipo: 'P'  as PickerType, label: 'Pallets'       },
                { tipo: 'C'  as PickerType, label: 'Contenedores'  },
                { tipo: 'B'  as PickerType, label: 'Bultos'        },
                { tipo: 'CH' as PickerType, label: 'Chocolates'    },
                { tipo: 'CC' as PickerType, label: 'Caja Cartón'   },
                { tipo: 'CN' as PickerType, label: 'Caja Negra'    },
              ])
              .filter(({ tipo }) => {
                const esCaja = tipo === 'CC' || tipo === 'CN';
                // Congelados: SOLO Caja Cartón/Caja Negra. Ninguna otra card muestra estas dos.
                if (isCongelados) return esCaja;
                if (esCaja) return false;
                // Sección Chocolates: solo Pallets y Chocolates (no Bultos ni Contenedores).
                if (sectionFilter === 'chocolates') return tipo === 'P' || tipo === 'CH';
                if (sectionFilter === 'aseo-comida' || sectionFilter === 'hogar') return tipo !== 'CH';
                return true; // 'all': show all
              })
              .map(({ tipo, label }) => {
                const count  = palletsByTipo[tipo] ?? 0;
                const active = count > 0;
                return (
                  <div key={tipo}
                    className="flex-1 flex flex-col items-center gap-2 py-2.5 px-1.5 rounded border transition-all"
                    style={{
                      borderColor: active ? 'var(--color-info)' : 'var(--color-border)',
                      background: '#fff',
                    }}>
                    <div className="text-center leading-none">
                      <div className="text-[14px] font-extrabold" style={{ color: active ? 'var(--color-info)' : '#64748B' }}>{tipo}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: active ? '#475569' : '#94A3B8' }}>{label}</div>
                    </div>
                    <div className="flex items-center gap-1 w-full justify-center">
                      <button
                        onClick={() => {
                          if (isPrinted && count > 0) {
                            // Si ya fue impreso, pedir confirmación antes de decrementar
                            setPendingDecrementTipo(tipo);
                          } else {
                            onTipoPalletsChange(tipo, Math.max(0, count - 1));
                          }
                        }}
                        className="w-7 h-7 rounded text-[16px] flex items-center justify-center cursor-pointer border"
                        style={{ borderColor: 'var(--color-border)', color: '#94A3B8', background: '#fff' }}>−</button>
                      <span className="w-8 text-center text-[20px] font-bold leading-none"
                        style={{ color: active ? '#1E293B' : '#CBD5E1' }}>{count}</span>
                      <button onClick={() => onTipoPalletsChange(tipo, count + 1)}
                        className="w-7 h-7 rounded text-[16px] flex items-center justify-center cursor-pointer"
                        style={{ background: 'var(--color-info)', color: '#fff', border: 'none' }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Confirm inline — aparece cuando se intenta decrementar un pallet ya impreso */}
            {pendingDecrementTipo && (
              <div className="mt-3 rounded px-3 py-2.5 flex items-center gap-3"
                style={{ background: '#FFF1F2', border: '1px solid rgba(220,38,38,0.3)' }}>
                <AlertTriangle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
                <div className="flex-1 text-[12px]" style={{ color: '#991B1B' }}>
                  Este pallet ya fue impreso. ¿Eliminar igual?
                </div>
                <button onClick={() => setPendingDecrementTipo(null)}
                  className="text-[12px] font-medium px-2.5 py-1 rounded border cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', color: '#64748B', background: '#fff' }}>
                  Cancelar
                </button>
                <button onClick={() => {
                  const count = palletsByTipo[pendingDecrementTipo] ?? 0;
                  onTipoPalletsChange(pendingDecrementTipo, Math.max(0, count - 1));
                  setPendingDecrementTipo(null);
                }}
                  className="text-[12px] font-semibold px-2.5 py-1 rounded border-none cursor-pointer"
                  style={{ background: '#DC2626', color: '#fff' }}>
                  Eliminar
                </button>
              </div>
            )}

            {/* Advertencia de reimpresión — impreso por otro supervisor */}
            {isPrinted && lastPrint?.printed_by_name && lastPrint.printed_by_name !== myName && (
              <div className="mt-3 rounded px-3 py-2 flex items-center gap-2"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <span className="text-[11px]" style={{ color: '#92400E' }}>
                  <AlertTriangle size={11} className="inline mr-1" style={{color:'#92400E'}} />Impreso por <strong>{lastPrint.printed_by_name}</strong>
                  {' · '}{fmtHoraChile(lastPrint.printed_at)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT / BOTTOM */}
        <div className={`${stickerBelow ? 'w-full border-t border-border' : 'lg:w-[55%]'} p-4 bg-[#FAFAFA]`}>
          {!allDone ? (
            <div className="h-full min-h-[180px] flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={13} className="text-slate-400 shrink-0" />
                <span className="text-[12px] font-medium text-slate-500">Operaciones pendientes — completa todas para imprimir</span>
              </div>
              {group.operations.map(op => {
                const info = STATE_INFO[op.state] ?? STATE_INFO.draft;
                return (
                  <div key={op.id} className="flex items-center gap-3 bg-white border rounded-lg px-4 py-3"
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
                        <RotateCcw size={13} className={refreshingId === op.id ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : assignedNums.length === 0 ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-text-3">
              <Package size={32} className="opacity-30" />
              <div className="text-[14px] text-center">Ingresa unidades para generar códigos</div>
            </div>
          ) : (
            <div>
              <div className="print:hidden flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="text-[13px] font-semibold text-text-2 flex items-center gap-2 flex-wrap">
                  <span>{assignedNums.length} código{assignedNums.length !== 1 ? 's' : ''}</span>
                  {selectedIndices.size > 0 && (
                    <span className="text-[12px] font-normal text-blue-600">
                      · {selectedIndices.size} seleccionada{selectedIndices.size !== 1 ? 's' : ''}
                    </span>
                  )}
                  {(lastPrint?.print_count ?? 0) > 1 && (
                    <span className="inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded"
                      style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}
                      title="Veces que se imprimió esta etiqueta">
                      ↻ Reimpreso ×{lastPrint!.print_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedIndices.size > 0 && (
                    <>
                      <button onClick={() => setSelectedIndices(new Set())}
                        className="text-[12px] cursor-pointer px-2.5 py-1.5 rounded border transition-all"
                        style={{ borderColor: 'var(--color-border)', color: '#64748B', background: '#fff' }}>
                        Limpiar
                      </button>
                      <button onClick={handlePrintSelected}
                        className="flex items-center gap-1.5 text-[12px] font-medium cursor-pointer px-3 py-1.5 rounded transition-all active:scale-95"
                        style={{ background: 'var(--color-info)', color: '#fff', border: 'none' }}>
                        <Printer size={13} /> {selectedIndices.size}
                      </button>
                    </>
                  )}
                  <button onClick={onPrint}
                    className="flex items-center gap-1.5 text-[13px] font-medium cursor-pointer px-3.5 py-1.5 rounded transition-all active:scale-95"
                    style={isPrinted
                      ? { background: '#fff', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }
                      : { background: 'var(--color-info)', color: '#fff', border: 'none' }}>
                    <Printer size={13} />
                    {isPrinted ? 'Re-imprimir' : selectedIndices.size > 0 ? 'Todas' : 'Imprimir'}
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
                          adelanto={!!adelanto} adelantoFecha={adelanto?.fecha_despacho ?? null}
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
