'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { BarcodeCard } from '../../despacho/shared/BarcodeCard';

const DISMISSED_KEY = 'combine_alerts_dismissed_v1';

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const today = new Date().toISOString().slice(0, 10);
    const data = JSON.parse(raw) as { date: string; ids: number[] };
    if (data.date !== today) return new Set(); // reset daily
    return new Set(data.ids);
  } catch { return new Set(); }
}

function saveDismissed(ids: Set<number>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      ids:  [...ids],
    }));
  } catch {}
}

interface ReprintSlot {
  id:           number;
  seq:          number;
  canonical_id: string;
  tipo:         string;
  storeCod:     string;
  pickerLabel:  string;
  refs:         string;
  cats:         string[];
}

interface CombinedGroup {
  newId:         number;
  newSeq:        number | null;
  newCanonicalId: string | null;
  newTipo:       string;
  storeCod:      string;
  merged:        { id: number; seq: number | null }[];
  reprints:      ReprintSlot[];
}

function buildCanonical(tipo: string, seq: number, cod: string, stamp: string): string {
  if (tipo === 'P')  return `P${seq}${cod}${stamp}P`;
  if (tipo === 'B')  return `${seq}B${cod}${stamp}B`;
  if (tipo === 'CH') return `CH${seq}${cod}${stamp}CH`;
  if (tipo === 'C')  return `C${seq}${cod}${stamp}C`;
  return `${seq}${cod}${stamp}`;
}

export function CombineAlertsPanel() {
  const [groups,    setGroups]    = useState<CombinedGroup[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(loadDismissed);
  const [printSlot, setPrintSlot] = useState<CombinedGroup['reprints'][0] | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // 1. Slots que fueron combinados hoy
    const { data: away } = await supabase
      .from('picking_pallets')
      .select('id, tipo, seq, store_cod, combined_into')
      .eq('date', today)
      .eq('is_active', false)
      .not('combined_into', 'is', null);

    if (!away || away.length === 0) { setGroups([]); return; }

    // 2. Agrupar por combined_into (nuevo slot)
    const byNew = new Map<number, typeof away>();
    for (const row of away) {
      const newId = row.combined_into as number;
      if (!byNew.has(newId)) byNew.set(newId, []);
      byNew.get(newId)!.push(row);
    }

    // 3. Leer datos de los nuevos slots + sus hermanos activos (para reprints)
    const newIds = [...byNew.keys()];
    const { data: newSlots } = await supabase
      .from('picking_pallets')
      .select('id, tipo, seq, canonical_id, store_cod, date')
      .in('id', newIds)
      .eq('is_active', true);

    const { data: siblings } = await supabase
      .from('picking_pallets')
      .select('id, tipo, seq, canonical_id, store_cod, picker_label, refs, contenido')
      .eq('date', today)
      .eq('is_active', true)
      .in('store_cod', [...new Set((newSlots ?? []).map(s => s.store_cod as string))]);

    const stamp = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`;

    const result: CombinedGroup[] = [];
    for (const [newId, mergedSlots] of byNew.entries()) {
      const newSlot = (newSlots ?? []).find(s => s.id === newId);
      if (!newSlot) continue;

      const storeCod = newSlot.store_cod as string;
      const tipo     = newSlot.tipo as string;

      // Slots que cambiaron de seq (activos de la misma tienda+tipo)
      const storeActive = (siblings ?? []).filter(s =>
        s.store_cod === storeCod && s.tipo === tipo
      ) as { id: number; seq: number | null; canonical_id: string | null; store_cod: string; tipo: string; picker_label: string | null; refs: string | null; contenido: string | null }[];

      const reprints: ReprintSlot[] = storeActive
        .filter(s => s.seq != null)
        .map(s => ({
          id:           s.id,
          seq:          s.seq!,
          canonical_id: s.canonical_id ?? buildCanonical(tipo, s.seq!, storeCod, stamp),
          tipo,
          storeCod,
          pickerLabel:  s.picker_label ?? '—',
          refs:         s.refs ?? '',
          cats:         s.contenido ? [s.contenido] : [],
        }));

      result.push({
        newId,
        newSeq:         newSlot.seq as number | null,
        newCanonicalId: newSlot.canonical_id as string | null,
        newTipo:        tipo,
        storeCod,
        merged:         mergedSlots.map(s => ({ id: s.id as number, seq: s.seq as number | null })),
        reprints,
      });
    }

    setGroups(result);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const debounced = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => { void load(); }, 600);
    };
    return subscribeToPickingPallets(debounced, load);
  }, [load]);

  const dismiss = (newId: number) => {
    setDismissed(prev => {
      const next = new Set([...prev, newId]);
      saveDismissed(next);
      return next;
    });
  };

  const visible = groups.filter(g => !dismissed.has(g.newId));
  if (visible.length === 0) return null;

  return (
    <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200">
      <div className="px-4 py-2 flex items-center gap-2">
        <span className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider">
          ⚠️ Pallets combinados — reimprimir etiquetas
        </span>
        <span className="ml-auto text-[10px] text-amber-500 font-bold">{visible.length} aviso{visible.length > 1 ? 's' : ''}</span>
      </div>

      {visible.map(g => {
        const mergedLabel  = g.merged.map(m => `P${m.seq ?? '?'} #${m.id}`).join(' + ');
        const resultLabel  = `${g.newTipo}${g.newSeq ?? '?'} #${g.newId}`;
        const otherReprints = g.reprints.filter(r => r.id !== g.newId);

        return (
          <div key={g.newId} className="px-4 pb-3">
            {/* Resumen */}
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-amber-800 leading-tight">
                  {mergedLabel} → {resultLabel}
                  {otherReprints.length > 0 && (
                    <span className="ml-2 text-[11px] font-normal text-amber-600">
                      · también: {otherReprints.map(r => `${r.tipo}${r.seq} #${r.id}`).join(', ')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-amber-600 mt-0.5">{g.storeCod}</div>
              </div>
              <button
                onClick={() => dismiss(g.newId)}
                className="flex-shrink-0 text-amber-400 hover:text-amber-700 text-[16px] leading-none cursor-pointer transition-colors"
                title="Descartar aviso"
              >
                ×
              </button>
            </div>

            {/* Botones de reimpresión */}
            <div className="flex flex-wrap gap-2">
              {g.reprints.map(r => (
                <button
                  key={r.id}
                  onClick={() => setPrintSlot(r)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer transition-all active:scale-95"
                  style={{ background: 'rgba(217,119,6,0.15)', color: '#92400E', border: '1px solid rgba(217,119,6,0.30)' }}
                >
                  🖨 {r.tipo}{r.seq} #{r.id}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Modal de reimpresión */}
      {printSlot && (
        <div
          className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPrintSlot(null)}
        >
          <div
            className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-navy flex items-center justify-between">
              <span className="font-barlow-condensed text-[15px] font-bold text-white uppercase tracking-wider">
                Reimprimir — {printSlot.tipo}{printSlot.seq} #{printSlot.id}
              </span>
              <button onClick={() => setPrintSlot(null)} className="text-white/50 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-4">
              <BarcodeCard
                value={`${printSlot.storeCod};${printSlot.pickerLabel};${printSlot.refs};${printSlot.tipo}${printSlot.seq};${printSlot.cats.join(',')}`}
                palletNum={printSlot.seq}
                total={1}
                storeCod={printSlot.storeCod}
                pickerLabel={printSlot.pickerLabel}
                responsibleKey=""
                allCategories={printSlot.cats}
                totalPickers={0}
                tipo={printSlot.tipo}
                slotId={printSlot.id}
                canonicalId={printSlot.canonical_id}
                compact
              />
              <button
                onClick={() => { window.print(); setPrintSlot(null); }}
                className="mt-3 w-full py-3 bg-navy text-white rounded-xl font-barlow-condensed text-[16px] font-bold cursor-pointer"
              >
                🖨 Imprimir etiqueta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
