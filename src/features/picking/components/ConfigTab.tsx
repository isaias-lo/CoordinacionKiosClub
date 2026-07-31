'use client';

import React, { useState, useEffect } from 'react';
import { RotateCcw, Plus, X } from 'lucide-react';
import { LabelConfig, DEFAULT_LABEL_CONFIG, CFG_SLIDER_CSS, BarcodeCard, PropRow } from '@/features/despacho/shared/BarcodeCard';
import { buildPickerKeyList, isCustomPickerKey } from '../picking-utils';

// ─── PickerNameRow ────────────────────────────────────────────────────────────

function PickerNameRow({ pickerKey, savedValue, onSave, onRemove }: {
  pickerKey: string; savedValue: string;
  onSave: (key: string, val: string) => void;
  /** Solo para pickers agregados (custom): muestra la ✕ para eliminarlos. */
  onRemove?: (key: string) => void;
}) {
  const [draft,  setDraft]  = useState(savedValue);
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const isDirty = draft !== savedValue;

  useEffect(() => { setDraft(savedValue); }, [savedValue]);

  const save = () => {
    if (!isDirty) return;
    const oldLabel = savedValue || pickerKey;
    const newLabel = draft.trim() || '(sin nombre)';
    if (!window.confirm(`¿Cambiar nombre del picker?\n\n${pickerKey}\n"${oldLabel}"  →  "${newLabel}"\n\nEste cambio será visible para todos.`)) return;
    onSave(pickerKey, draft);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#F1F5F9' }}>
      <span className="font-mono text-[12px] font-bold w-24 shrink-0 truncate" style={{ color: '#1E293B' }} title={pickerKey}>
        {pickerKey}
      </span>
      <input
        type="text" value={draft} placeholder="Nombre…"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        className="flex-1 min-w-0 border rounded px-2.5 py-1.5 text-[13px] bg-white outline-none transition-colors"
        style={{ borderColor: isDirty ? '#D97706' : status === 'saved' ? '#16A34A' : '#E2E8F0', color: '#334155' }}
      />
      {isDirty ? (
        <button onClick={save}
          className="px-2.5 py-1 text-[12px] font-semibold rounded cursor-pointer shrink-0 border-none"
          style={{ background: '#1E40AF', color: '#fff' }}>
          Guardar
        </button>
      ) : status === 'saved' ? (
        <span className="text-[12px] font-semibold shrink-0" style={{ color: '#16A34A' }}>✓</span>
      ) : null}
      {onRemove && !isDirty && (
        <button onClick={() => onRemove(pickerKey)} title="Eliminar picker"
          className="shrink-0 flex items-center justify-center w-6 h-6 rounded cursor-pointer border-none"
          style={{ background: '#FEF2F2', color: '#DC2626' }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ─── ConfigTab ────────────────────────────────────────────────────────────────

interface Props {
  labelConfig:           LabelConfig;
  onLabelConfigChange:   (cfg: LabelConfig) => void;
  canonicalNames:        Record<string, string>;
  onCanonicalNamesChange:(names: Record<string, string>, changedKey?: string, changedVal?: string, byName?: string) => void;
  colsPerRow:            number;
  onColsPerRowChange:    (n: number) => void;
  currentUserName:       string;
}

export function ConfigTab({ labelConfig, onLabelConfigChange, canonicalNames, onCanonicalNamesChange, colsPerRow, onColsPerRowChange, currentUserName }: Props) {
  const previewScale = 0.50;
  // Altura base subida de 600→780: con la fila de Batch/Hora término y el código de tienda
  // más grande, el contenido real de la etiqueta ya no cabía en 600px y se recortaba por abajo.
  const previewH     = Math.round(780 * previewScale);

  const upd = (field: keyof LabelConfig, val: number | boolean) =>
    onLabelConfigChange({ ...labelConfig, [field]: val });

  function ToggleRow({ label, desc, field }: {
    label: string; desc?: string;
    field: 'showResponsable' | 'showCategories' | 'showStoreName' | 'showDate' | 'showBatch' | 'showFinishTime';
  }) {
    const val = labelConfig[field];
    return (
      <div className="flex items-center justify-between py-2.5 border-b last:border-0 gap-3" style={{ borderColor: '#F1F5F9' }}>
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-tight" style={{ color: '#334155' }}>{label}</div>
          {desc && <div className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>{desc}</div>}
        </div>
        <button onClick={() => upd(field, !val)}
          className="relative flex items-center rounded-full cursor-pointer transition-colors duration-200 shrink-0 border-none"
          style={{ width: 36, height: 20, background: val ? '#1E40AF' : '#CBD5E1' }}>
          <span className="absolute bg-white rounded-full transition-all duration-200"
            style={{ width: 14, height: 14, left: val ? '19px' : '3px', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }} />
        </button>
      </div>
    );
  }

  function SectionLabel({ label }: { label: string }) {
    return (
      <div className="flex items-center gap-2 pt-4 pb-2 first:pt-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#94A3B8' }}>{label}</span>
        <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
      </div>
    );
  }

  const [newPicker, setNewPicker] = useState('');
  const pickerKeys = buildPickerKeyList(canonicalNames);

  const handleNameSave = (key: string, val: string) => {
    const next = { ...canonicalNames };
    if (val.trim()) next[key] = val.trim(); else delete next[key];
    onCanonicalNamesChange(next, key, val.trim(), currentUserName);
  };

  const handleAddPicker = () => {
    const key = newPicker.trim();
    if (!key) return;
    if (pickerKeys.some(k => k.toLowerCase() === key.toLowerCase())) {
      window.alert(`Ya existe un picker o pistola con el nombre "${key}".`);
      return;
    }
    // Se crea con nombre inicial = la propia key (para que persista en Supabase y se vea);
    // luego se puede editar como cualquier otro. Se propaga a todos por realtime.
    onCanonicalNamesChange({ ...canonicalNames, [key]: key }, key, key, currentUserName);
    setNewPicker('');
  };

  const handleRemovePicker = (key: string) => {
    if (!window.confirm(`¿Eliminar el picker/pistola "${key}"?\n\nDesaparecerá para todos.`)) return;
    const next = { ...canonicalNames };
    delete next[key];
    onCanonicalNamesChange(next, key, '', currentUserName); // display_name '' → borra la fila en Supabase
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CFG_SLIDER_CSS }} />
      <div className="flex-1 overflow-y-auto px-4 pb-10">

        {/* ── Etiqueta de impresión ── */}
        <div className="mt-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-semibold leading-tight" style={{ color: '#1E293B' }}>
                Etiqueta de impresión
              </div>
              <div className="text-[12px] mt-0.5" style={{ color: '#94A3B8' }}>
                Personaliza el diseño de las etiquetas generadas
              </div>
            </div>
            <button onClick={() => onLabelConfigChange({ ...DEFAULT_LABEL_CONFIG })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded cursor-pointer border"
              style={{ color: '#64748B', background: '#fff', borderColor: '#E2E8F0' }}>
              <RotateCcw size={12} /> Restablecer
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 items-start">
            {/* Panel tipografía */}
            <div className="flex-1 rounded px-4 py-3 min-w-0"
              style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <SectionLabel label="Tipografía" />
              <PropRow label="Picker"         field="pickerFontSize"       min={20} max={50}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="N.º pallet"     field="palletNumSize"        min={50} max={120} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Código (#)"     field="slotIdFontSize"       min={10} max={28}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Cód. tienda"    field="storeFontSize"        min={80} max={240} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Nombre tienda"  field="storeNameFontSize"    min={24} max={72}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Categorías"     field="catFontSize"          min={12} max={30}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Fecha"          field="dateFontSize"         min={8}  max={48}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Batch"          field="batchFontSize"        min={14} max={60}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Hora término"   field="finishTimeFontSize"   min={12} max={48}  labelConfig={labelConfig} onUpdate={upd} />
            </div>

            {/* Vista previa */}
            <div className="lg:w-[380px] flex-shrink-0 self-start sticky top-4">
              <div className="rounded p-4 flex flex-col items-center gap-3"
                style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between self-stretch">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#1E40AF' }} />
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#94A3B8' }}>
                      Vista previa
                    </span>
                  </div>
                  <span className="text-[11px]" style={{ color: '#CBD5E1' }}>{Math.round(previewScale * 100)}%</span>
                </div>
                {/* overflow visible (no hidden): a alturas de contenido variables (sliders al
                    máximo) es mejor que el preview crezca fuera del panel a que se recorte
                    contenido real sin avisar. */}
                <div className="w-full overflow-visible rounded" style={{ height: previewH, background: '#F8FAFC', position: 'relative' }}>
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', width: 720, position: 'absolute', top: 0, left: '50%', marginLeft: -360, pointerEvents: 'none' }}>
                    <BarcodeCard
                      value="17MAI;JuanPerez;WH/PICK/1234;P1;Comida,Aseo"
                      palletNum={1} total={3} slotId={419}
                      storeCod="17MAI" pickerLabel="Juan Pérez" responsibleKey="Pickers 1"
                      allCategories={['Comida', 'Aseo']} totalPickers={4}
                      batch="BATCH/39934" finishedAt="2026-07-29 17:32:00"
                      compact={false} labelConfig={labelConfig}
                    />
                  </div>
                </div>
                <div className="self-stretch text-[11px] text-center" style={{ color: '#CBD5E1' }}>
                  Cambios en tiempo real
                </div>
              </div>
            </div>

            {/* Panel código de barras + visibilidad */}
            <div className="flex-1 rounded px-4 py-3 min-w-0"
              style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <SectionLabel label="Código de barras" />
              <PropRow label="Grosor barras"  field="barcodeBarWidth"       min={1}  max={4}   unit="" labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Altura"         field="barcodeHeight"         min={40} max={130}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Ancho"          field="barcodeContainerWidth" min={60} max={100} unit="%" labelConfig={labelConfig} onUpdate={upd} />
              <SectionLabel label="Forma" />
              <PropRow label="Borde grosor"   field="borderWidth"   min={0} max={4}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Radio esquinas" field="cornerRadius"  min={0} max={20} labelConfig={labelConfig} onUpdate={upd} />
              <SectionLabel label="Visibilidad" />
              <ToggleRow label="Responsable"     desc="ej. Pickers 3"         field="showResponsable" />
              <ToggleRow label="Categorías"      desc="Comida · Aseo · Hogar" field="showCategories" />
              <ToggleRow label="Nombre tienda"   desc="Texto bajo el código"  field="showStoreName" />
              <ToggleRow label="Fecha impresión"                              field="showDate" />
              <ToggleRow label="Batch"           desc="Transferir Agrupación de Odoo" field="showBatch" />
              <ToggleRow label="Hora término"    desc="Solo si el picking ya terminó" field="showFinishTime" />
            </div>
          </div>
        </div>

        {/* ── Nombres de pickers ── */}
        <div className="mb-6">
          <div className="mb-4">
            <div className="text-[15px] font-semibold leading-tight" style={{ color: '#1E293B' }}>
              Nombres de pickers
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: '#94A3B8' }}>
              Se aplican automáticamente al asignar operaciones · agrega pickers o pistolas nuevos
            </div>
          </div>
          <div className="rounded overflow-hidden max-w-full" style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            {/* Agregar picker / pistola nuevo */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}>
              <input
                type="text" value={newPicker}
                placeholder="Nuevo picker o pistola (ej. Pickers 19, Mario Patiño)…"
                onChange={e => setNewPicker(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPicker(); } }}
                className="flex-1 min-w-0 border rounded px-2.5 py-1.5 text-[13px] bg-white outline-none"
                style={{ borderColor: '#E2E8F0', color: '#334155' }}
              />
              <button onClick={handleAddPicker} disabled={!newPicker.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded cursor-pointer shrink-0 border-none disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#1E40AF', color: '#fff' }}>
                <Plus size={13} /> Agregar
              </button>
            </div>
            {/* Rejilla responsiva: se acomoda sola (3→2→1 columnas) según el ancho, nunca se corta. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {pickerKeys.map(key => (
                <PickerNameRow
                  key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''}
                  onSave={handleNameSave}
                  onRemove={isCustomPickerKey(key) ? handleRemovePicker : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Vista en pantalla ── */}
        <div className="mb-6">
          <div className="mb-4">
            <div className="text-[15px] font-semibold leading-tight" style={{ color: '#1E293B' }}>
              Vista en pantalla
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: '#94A3B8' }}>
              Ajusta la densidad del monitoreo
            </div>
          </div>
          <div className="rounded px-4 py-4"
            style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="text-[12px] font-medium mb-3" style={{ color: '#64748B' }}>
              Etiquetas por fila en monitoreo
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onColsPerRowChange(n)}
                  className="w-10 h-10 rounded text-[14px] font-bold cursor-pointer transition-all border"
                  style={{
                    background:  colsPerRow === n ? '#1E40AF' : '#fff',
                    color:       colsPerRow === n ? '#fff'    : '#94A3B8',
                    borderColor: colsPerRow === n ? '#1E40AF' : '#E2E8F0',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
