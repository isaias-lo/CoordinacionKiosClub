'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Pencil, Check, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { rowToEntry } from '../utils/converters';
import type { AuditEntry, CorreccionAuditoria, ResultadoAuditoria } from '../types';

const CORR_OPTS: { value: CorreccionAuditoria; label: string }[] = [
  { value: 'correcto',  label: 'Correcto'  },
  { value: 'faltante',  label: 'Faltante'  },
  { value: 'sobrante',  label: 'Sobrante'  },
  { value: 'cruce',     label: 'Cruce'     },
];

const RESULT_OPTS: { value: ResultadoAuditoria; label: string; color: string }[] = [
  { value: 'bueno', label: '✓ Bueno', color: '#16A34A' },
  { value: 'malo',  label: '✗ Malo',  color: '#D32F2F' },
];

function isEditable(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;
}

function timeAgo(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  if (h >= 24) return '';
  if (h > 0) return `hace ${h}h ${m}m`;
  return `hace ${m}m`;
}

interface EditState {
  observaciones: string;
  correccion: CorreccionAuditoria;
  resultado: ResultadoAuditoria;
  pallets: string;
}

interface EntryWithMeta extends AuditEntry {
  created_at: string;
}

export function MiHistorialModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [entries, setEntries]   = useState<EntryWithMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(150);
    if (data) {
      setEntries(data.map(r => ({ ...rowToEntry(r as Record<string, unknown>), created_at: r.created_at as string })));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Agrupar por fecha
  const grouped = entries.reduce<Record<string, EntryWithMeta[]>>((acc, e) => {
    const key = e.fecha;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const fechas = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function startEdit(e: EntryWithMeta) {
    setEditingId(e.id);
    setSaveError('');
    setEditState({
      observaciones: e.observaciones || '',
      correccion: e.correccion,
      resultado: e.resultado,
      pallets: String(e.pallets),
    });
  }

  async function saveEdit(e: EntryWithMeta) {
    if (!editState) return;
    const pallets = parseInt(editState.pallets);
    if (!pallets || pallets <= 0) { setSaveError('Pallets debe ser mayor a 0'); return; }
    setSaving(true); setSaveError('');
    const { error } = await supabase
      .from('audit_entries')
      .update({
        observaciones: editState.observaciones.trim(),
        correccion:    editState.correccion,
        resultado:     editState.resultado,
        pallets,
      })
      .eq('id', e.id)
      .eq('user_id', userId);
    setSaving(false);
    if (error) { setSaveError('Error al guardar. Inténtalo de nuevo.'); return; }
    setEntries(prev => prev.map(x => x.id === e.id
      ? { ...x, observaciones: editState.observaciones.trim(), correccion: editState.correccion, resultado: editState.resultado, pallets }
      : x
    ));
    setEditingId(null);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: '#0d1528' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer border-none"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <X size={18} color="rgba(255,255,255,0.8)" />
        </button>
        <div>
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/30">Mi cuenta</div>
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase leading-none">Mi historial</div>
        </div>
        <div className="ml-auto text-[12px] text-white/30">{entries.length} registros</div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-20">
            <div className="text-[48px] mb-3">📋</div>
            <div className="font-barlow-condensed text-[20px] font-bold text-white/50">Sin auditorías registradas</div>
          </div>
        )}

        {!loading && fechas.map(fecha => (
          <div key={fecha}>
            <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-white/30 mb-2 px-1">{fecha}</div>
            <div className="space-y-2">
              {grouped[fecha].map(e => {
                const editable = isEditable(e.created_at);
                const isEditing = editingId === e.id;
                const isExpanded = expanded.has(e.id);
                const ago = timeAgo(e.created_at);
                const isGood = e.resultado === 'bueno';

                return (
                  <div key={e.id} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    {/* Card header */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-barlow-condensed text-[17px] font-bold text-white leading-tight truncate">{e.tiendaNombre}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-white/40">{e.hora}</span>
                          {ago && (
                            <span className="flex items-center gap-1 text-[10px] text-white/30">
                              <Clock size={9} />
                              {ago} · editable
                            </span>
                          )}
                          <span className="text-[10px] text-white/30">{e.pallets} pallets</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isGood ? 'bg-[rgba(22,163,74,0.20)] text-green-400' : 'bg-[rgba(211,47,47,0.20)] text-red-400'}`}>
                          {isGood ? '✓ Bueno' : '✗ Malo'}
                        </span>
                        {editable && !isEditing && (
                          <button onClick={() => startEdit(e)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer border-none"
                            style={{ background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(37,99,235,0.4)' }}>
                            <Pencil size={13} color="#60a5fa" />
                          </button>
                        )}
                        <button onClick={() => toggleExpand(e.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer border-none"
                          style={{ background: 'rgba(255,255,255,0.07)' }}>
                          {isExpanded ? <ChevronUp size={14} color="rgba(255,255,255,0.5)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.5)" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && !isEditing && (
                      <div className="px-4 pb-3 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="pt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                          <div><span className="text-white/35">Tipo:</span> <span className="text-white/70 capitalize">{e.tipo}</span></div>
                          <div><span className="text-white/35">Corrección:</span> <span className="text-white/70 capitalize">{e.correccion}</span></div>
                          <div><span className="text-white/35">Errores:</span> <span className={e.tieneErrores ? 'text-red-400' : 'text-green-400'}>{e.tieneErrores ? 'Sí' : 'No'}</span></div>
                          <div><span className="text-white/35">Picker:</span> <span className="text-white/70 truncate">{e.pickerNombre || e.picker || '—'}</span></div>
                        </div>
                        {e.observaciones && (
                          <div className="mt-2 px-2.5 py-2 rounded-lg text-[11px] text-white/60 italic" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            {e.observaciones}
                          </div>
                        )}
                        {e.operaciones?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {e.operaciones.map((op, i) => <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>{op.subTipo}: {op.codigo}</span>)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit form */}
                    {isEditing && editState && (
                      <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="pt-3 text-[11px] font-bold tracking-wider uppercase text-white/30">Editar auditoría</div>

                        {/* Pallets */}
                        <div>
                          <label className="text-[11px] text-white/40 block mb-1">Pallets</label>
                          <input
                            type="number" inputMode="numeric" min="1" max="999"
                            value={editState.pallets}
                            onChange={v => setEditState(s => s ? { ...s, pallets: v.target.value } : s)}
                            className="w-full px-3 py-2 rounded-xl text-[15px] font-bold text-white outline-none"
                            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)' }}
                          />
                        </div>

                        {/* Corrección */}
                        <div>
                          <label className="text-[11px] text-white/40 block mb-1">Corrección</label>
                          <div className="grid grid-cols-2 gap-2">
                            {CORR_OPTS.map(opt => (
                              <button key={opt.value} onClick={() => setEditState(s => s ? { ...s, correccion: opt.value } : s)}
                                className="py-2 rounded-xl text-[13px] font-semibold cursor-pointer border transition-all"
                                style={editState.correccion === opt.value
                                  ? { background: 'rgba(37,99,235,0.30)', borderColor: 'rgba(37,99,235,0.70)', color: '#93c5fd' }
                                  : { background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.50)' }}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Resultado */}
                        <div>
                          <label className="text-[11px] text-white/40 block mb-1">Resultado</label>
                          <div className="grid grid-cols-2 gap-2">
                            {RESULT_OPTS.map(opt => (
                              <button key={opt.value} onClick={() => setEditState(s => s ? { ...s, resultado: opt.value } : s)}
                                className="py-2 rounded-xl text-[13px] font-semibold cursor-pointer border transition-all"
                                style={editState.resultado === opt.value
                                  ? { background: `${opt.color}33`, borderColor: `${opt.color}aa`, color: opt.value === 'bueno' ? '#86efac' : '#fca5a5' }
                                  : { background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.50)' }}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Observaciones */}
                        <div>
                          <label className="text-[11px] text-white/40 block mb-1">Observaciones</label>
                          <textarea
                            rows={3} value={editState.observaciones}
                            onChange={v => setEditState(s => s ? { ...s, observaciones: v.target.value } : s)}
                            placeholder="Añade una observación…"
                            className="w-full px-3 py-2 rounded-xl text-[13px] text-white outline-none resize-none placeholder:text-white/25"
                            style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)' }}
                          />
                        </div>

                        {saveError && <div className="text-[12px] text-red-400 font-semibold">{saveError}</div>}

                        <div className="flex gap-2">
                          <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl text-[14px] font-bold cursor-pointer border-none"
                            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>
                            Cancelar
                          </button>
                          <button onClick={() => saveEdit(e)} disabled={saving} className="flex-1 py-2.5 rounded-xl text-[14px] font-bold cursor-pointer border-none flex items-center justify-center gap-2"
                            style={{ background: saving ? 'rgba(37,99,235,0.40)' : 'rgba(37,99,235,0.80)', color: 'white' }}>
                            {saving ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Check size={15} />}
                            {saving ? 'Guardando…' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
