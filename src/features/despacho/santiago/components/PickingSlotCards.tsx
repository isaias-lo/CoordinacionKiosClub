'use client';

import { useState, useCallback } from 'react';
import { supabase } from '../../../../lib/supabase';

export interface PickingSlot {
  id:           number;
  tipo:         string;   // P | B | C | CH
  contenido:    string;
  seq:          number | null;
  canonical_id: string | null;
  peso_kg:      number | null;
  alto:         number | null;
  largo:        number | null;
  ancho:        number | null;
  peso_v:       number | null;
}

export interface CombineResult {
  newId:       number;
  renumbered:  { id: number; oldSeq: number | null; newSeq: number; canonical_id: string }[];
  needsReprint: number[];
}

interface Props {
  slots:     PickingSlot[];
  storeCod:  string;
  date:      string;     // YYYY-MM-DD
  onRefresh: () => void;
  onCombined?: (result: CombineResult) => void;
}

const TIPO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  P:  { label: 'Pallet',     color: '#2563EB', bg: 'rgba(37,99,235,0.10)' },
  B:  { label: 'Bulto',      color: '#D97706', bg: 'rgba(217,119,6,0.10)' },
  C:  { label: 'Contenedor', color: '#6B21A8', bg: 'rgba(107,33,168,0.10)' },
  CH: { label: 'Chocolate',  color: '#92400E', bg: 'rgba(146,64,14,0.10)' },
};

function SlotCard({
  slot, selected, onToggleSelect, onSaved,
}: {
  slot: PickingSlot;
  selected: boolean;
  onToggleSelect: () => void;
  onSaved: () => void;
}) {
  const [peso,  setPeso]  = useState(String(slot.peso_kg ?? ''));
  const [alto,  setAlto]  = useState(String(slot.alto    ?? ''));
  const [largo, setLargo] = useState(String(slot.largo   ?? ''));
  const [ancho, setAncho] = useState(String(slot.ancho   ?? ''));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(
    slot.peso_kg != null || slot.alto != null
  );

  const ti = TIPO_LABEL[slot.tipo] ?? TIPO_LABEL.P;
  const needsLargoAncho = slot.tipo === 'B';
  const isDirty = peso !== String(slot.peso_kg ?? '') || alto !== String(slot.alto ?? '');

  const handleSave = async () => {
    setSaving(true);
    const updates: Record<string, number | null> = {
      peso_kg: parseFloat(peso)  || null,
      alto:    parseInt(alto)    || null,
      largo:   needsLargoAncho ? (parseInt(largo) || null) : (slot.tipo === 'P' ? 120 : null),
      ancho:   needsLargoAncho ? (parseInt(ancho) || null) : (slot.tipo === 'P' ? 100 : null),
    };
    if (updates.peso_kg && updates.alto) {
      const l = updates.largo ?? 0;
      const a = updates.ancho ?? 0;
      updates.peso_v = Math.round(((updates.alto * l * a) / 6000) * 10) / 10 || null;
    }
    const { error } = await supabase
      .from('picking_pallets')
      .update(updates)
      .eq('id', slot.id);
    setSaving(false);
    if (!error) { setSaved(true); onSaved(); }
  };

  return (
    <div
      className={`rounded-[12px] border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-[rgba(37,99,235,0.05)]'
          : saved
          ? 'border-green-200 bg-[rgba(22,163,74,0.04)]'
          : 'border-[#E2E8F0] bg-white'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#F1F5F9]">
        <button
          onClick={onToggleSelect}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all ${
            selected ? 'bg-blue-500 border-blue-500 text-white' : 'border-[#CBD5E1] bg-white'
          }`}
        >
          {selected && '✓'}
        </button>

        <span
          className="font-barlow-condensed text-[14px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ color: ti.color, background: ti.bg }}
        >
          {slot.tipo}{slot.seq ?? '?'}
        </span>

        {slot.canonical_id && (
          <span className="font-mono text-[10px] text-[#94A3B8] truncate flex-1">
            {slot.canonical_id}
          </span>
        )}
        {!slot.canonical_id && (
          <span className="text-[10px] text-[#94A3B8] italic flex-1">Sin imprimir</span>
        )}

        {saved && !isDirty && (
          <span className="text-[10px] font-bold text-green-600 flex-shrink-0">✓ Guardado</span>
        )}
      </div>

      {/* Dimension fields */}
      <div className={`px-3 py-2.5 grid gap-2 ${needsLargoAncho ? 'grid-cols-4' : 'grid-cols-2'}`}>
        <div>
          <div className="text-[9px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Peso kg</div>
          <input
            type="number" min="0" step="0.1"
            value={peso} onChange={e => setPeso(e.target.value)}
            placeholder="—"
            className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[13px] font-mono text-navy focus:outline-none focus:border-blue-400 [-webkit-appearance:none]"
          />
        </div>
        <div>
          <div className="text-[9px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Alto cm</div>
          <input
            type="number" min="0"
            value={alto} onChange={e => setAlto(e.target.value)}
            placeholder="—"
            className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[13px] font-mono text-navy focus:outline-none focus:border-blue-400 [-webkit-appearance:none]"
          />
        </div>
        {needsLargoAncho && (
          <>
            <div>
              <div className="text-[9px] font-bold text-[#64748B] uppercase tracking-wide mb-1">Largo cm</div>
              <input
                type="number" min="0"
                value={largo} onChange={e => setLargo(e.target.value)}
                placeholder="—"
                className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[13px] font-mono text-navy focus:outline-none focus:border-blue-400 [-webkit-appearance:none]"
              />
            </div>
            <div>
              <div className="text-[9px] font-bold text-[#64748B]} uppercase tracking-wide mb-1">Ancho cm</div>
              <input
                type="number" min="0"
                value={ancho} onChange={e => setAncho(e.target.value)}
                placeholder="—"
                className="w-full border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[13px] font-mono text-navy focus:outline-none focus:border-blue-400 [-webkit-appearance:none]"
              />
            </div>
          </>
        )}
      </div>

      {/* Save button */}
      <div className="px-3 pb-2.5">
        <button
          onClick={handleSave}
          disabled={saving || !peso || !alto}
          className="w-full py-2 rounded-lg font-barlow-condensed text-[13px] font-bold transition-all disabled:opacity-40 cursor-pointer"
          style={{
            background: saved && !isDirty ? '#DCFCE7' : '#1E40AF',
            color:      saved && !isDirty ? '#16A34A' : '#fff',
          }}
        >
          {saving ? 'Guardando…' : saved && !isDirty ? '✓ Dimensiones guardadas' : 'Guardar dimensiones'}
        </button>
      </div>
    </div>
  );
}

export default function PickingSlotCards({ slots, storeCod, date, onRefresh, onCombined }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [combining,   setCombining]   = useState(false);
  const [combineError, setCombineError] = useState('');

  const activeSlots = slots.filter(s => s.seq != null || s.canonical_id != null || s.id > 0);
  if (activeSlots.length === 0) return null;

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Only allow combining slots of the SAME tipo
  const selectedSlots  = activeSlots.filter(s => selectedIds.has(s.id));
  const selectedTipos  = [...new Set(selectedSlots.map(s => s.tipo))];
  const canCombine     = selectedIds.size >= 2 && selectedTipos.length === 1;

  const handleCombine = useCallback(async () => {
    if (!canCombine) return;
    setCombining(true);
    setCombineError('');
    try {
      const res = await fetch('/api/picking-pallets/combine', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ids:       [...selectedIds],
          date,
          store_cod: storeCod,
          tipo:      selectedTipos[0],
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string } & Partial<CombineResult>;
      if (!res.ok || json.error) { setCombineError(json.error ?? 'Error al combinar'); return; }
      setSelectedIds(new Set());
      onRefresh();
      if (onCombined && json.newId) {
        onCombined({ newId: json.newId, renumbered: json.renumbered ?? [], needsReprint: json.needsReprint ?? [] });
      }
    } catch (e) {
      setCombineError(String(e));
    } finally {
      setCombining(false);
    }
  }, [canCombine, selectedIds, date, storeCod, selectedTipos, onRefresh, onCombined]);

  // Group by tipo for display
  const byTipo: Record<string, PickingSlot[]> = {};
  for (const s of activeSlots) {
    if (!byTipo[s.tipo]) byTipo[s.tipo] = [];
    byTipo[s.tipo].push(s);
  }

  return (
    <div className="px-3 pt-3 pb-2 border-b border-[#E2E8F0]">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="font-barlow-condensed text-[11px] font-bold uppercase tracking-widest text-[#475569]">
            Slots de Picking · {activeSlots.length} unidades
          </div>
          {selectedIds.size >= 2 && !canCombine && (
            <div className="text-[10px] text-orange-500 mt-0.5">Selecciona solo un tipo para combinar</div>
          )}
        </div>
        {canCombine && (
          <button
            onClick={handleCombine}
            disabled={combining}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-barlow-condensed text-[12px] font-bold text-white cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'linear-gradient(145deg, #2563EB, #1D4ED8)', boxShadow: '0 2px 8px rgba(37,99,235,0.35)' }}
          >
            {combining ? '⏳' : '⊕'} Combinar {selectedIds.size} {TIPO_LABEL[selectedTipos[0]]?.label}s
          </button>
        )}
      </div>

      {combineError && (
        <div className="mb-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠️ {combineError}
        </div>
      )}

      {/* Cards por tipo */}
      {Object.entries(byTipo).map(([tipo, tipoSlots]) => (
        <div key={tipo} className="mb-3">
          {Object.keys(byTipo).length > 1 && (
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-1.5 px-0.5"
              style={{ color: TIPO_LABEL[tipo]?.color ?? '#374151' }}
            >
              {TIPO_LABEL[tipo]?.label ?? tipo}s
            </div>
          )}
          <div className="space-y-2">
            {tipoSlots.map(slot => (
              <SlotCard
                key={slot.id}
                slot={slot}
                selected={selectedIds.has(slot.id)}
                onToggleSelect={() => toggleSelect(slot.id)}
                onSaved={onRefresh}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
