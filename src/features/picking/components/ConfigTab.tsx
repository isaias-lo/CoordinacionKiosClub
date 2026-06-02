'use client';

import React, { useState, useEffect } from 'react';
import { LabelConfig, DEFAULT_LABEL_CONFIG, CFG_SLIDER_CSS, BarcodeCard, PropRow } from '@/features/despacho/shared/BarcodeCard';
import { CANONICAL_PICKER_KEYS } from '../picking-types';

// ─── PickerNameRow ────────────────────────────────────────────────────────────

function PickerNameRow({ pickerKey, savedValue, onSave }: {
  pickerKey: string; savedValue: string;
  onSave: (key: string, val: string) => void;
}) {
  const [draft, setDraft]   = useState(savedValue);
  const [status, setStatus] = useState<'idle' | 'saved'>('idle');
  const isDirty = draft !== savedValue;

  useEffect(() => { setDraft(savedValue); }, [savedValue]);

  const save = () => {
    if (!isDirty) return;
    const oldLabel = savedValue || pickerKey;
    const newLabel = draft.trim() || '(sin nombre)';
    const confirmed = window.confirm(
      `¿Cambiar nombre del picker?\n\n${pickerKey}\n"${oldLabel}"  →  "${newLabel}"\n\nEste cambio será visible para todos los usuarios.`
    );
    if (!confirmed) return;
    onSave(pickerKey, draft);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#F1F5F9] last:border-b-0">
      <span className="font-mono text-[13px] font-bold text-navy w-24 shrink-0 truncate">{pickerKey}</span>
      <input
        type="text" value={draft} placeholder="Nombre…"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        className="flex-1 min-w-0 border rounded-lg px-2.5 py-1.5 text-[13px] bg-white outline-none transition-colors"
        style={{ borderColor: isDirty ? '#D97706' : status === 'saved' ? '#16A34A' : '#E2E8F0' }}
      />
      {isDirty ? (
        <button onClick={save}
          className="px-2.5 py-1 text-[12px] font-bold rounded-lg cursor-pointer transition-all active:scale-95 shrink-0"
          style={{ background: 'linear-gradient(135deg,#92400E,#D97706)', color: '#fff' }}>✓</button>
      ) : status === 'saved' ? (
        <span className="text-[12px] font-bold shrink-0" style={{ color: '#16A34A' }}>✓</span>
      ) : <span className="w-8 shrink-0" />}
    </div>
  );
}

// ─── ConfigTab ────────────────────────────────────────────────────────────────

interface Props {
  labelConfig: LabelConfig;
  onLabelConfigChange: (cfg: LabelConfig) => void;
  canonicalNames: Record<string, string>;
  onCanonicalNamesChange: (names: Record<string, string>, changedKey?: string, changedVal?: string, byName?: string) => void;
  colsPerRow: number;
  onColsPerRowChange: (n: number) => void;
  currentUserName: string;
}

export function ConfigTab({ labelConfig, onLabelConfigChange, canonicalNames, onCanonicalNamesChange, colsPerRow, onColsPerRowChange, currentUserName }: Props) {
  const previewScale = 0.50;
  const previewH     = Math.round(600 * previewScale);

  const upd = (field: keyof LabelConfig, val: number | boolean) =>
    onLabelConfigChange({ ...labelConfig, [field]: val });

  function ToggleRow({ label, desc, field }: {
    label: string; desc?: string;
    field: 'showResponsable' | 'showCategories' | 'showStoreName' | 'showDate';
  }) {
    const val = labelConfig[field];
    return (
      <div className="flex items-center justify-between py-2 border-b border-[#F8FAFC] last:border-0 gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-[#334155] leading-tight">{label}</div>
          {desc && <div className="text-[10px] text-[#94A3B8] mt-0.5">{desc}</div>}
        </div>
        <button onClick={() => upd(field, !val)}
          className="relative flex items-center rounded-full cursor-pointer transition-colors duration-200 shrink-0"
          style={{ width: 36, height: 20, background: val ? '#D97706' : '#CBD5E1' }}>
          <span className="absolute bg-white rounded-full shadow-sm transition-all duration-200"
            style={{ width: 14, height: 14, left: val ? '19px' : '3px' }} />
        </button>
      </div>
    );
  }

  function PanelLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
      <div className="flex items-center gap-2 pt-3 pb-1.5 first:pt-0">
        <span className="text-[#94A3B8] flex items-center">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">{label}</span>
        <div className="flex-1 h-px bg-[#F1F5F9]" />
      </div>
    );
  }

  const handleNameSave = (key: string, val: string) => {
    const next = { ...canonicalNames };
    if (val.trim()) next[key] = val.trim(); else delete next[key];
    onCanonicalNamesChange(next, key, val.trim(), currentUserName);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CFG_SLIDER_CSS }} />
      <div className="flex-1 overflow-y-auto px-4 pb-10">

        <div className="mt-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[16px] font-bold text-navy leading-tight">Etiqueta de impresión</div>
              <div className="text-[12px] text-[#94A3B8] mt-0.5">Personaliza el diseño de las etiquetas generadas</div>
            </div>
            <button onClick={() => onLabelConfigChange({ ...DEFAULT_LABEL_CONFIG })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-xl cursor-pointer transition-all active:scale-95"
              style={{ color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0' }}>
              ↺ Restablecer
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 items-start">
            <div className="flex-1 bg-white rounded-2xl px-4 py-3 min-w-0" style={{ border: '1px solid #E2E8F0' }}>
              <PanelLabel icon={<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2h3v8H2zM7 5h3v5H7z" fill="currentColor"/></svg>} label="Tipografía" />
              <PropRow label="Picker"         field="pickerFontSize"       min={20} max={50}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="N.º pallet"     field="palletNumSize"        min={50} max={120} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Código (#)"     field="slotIdFontSize"       min={10} max={28}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Cód. tienda"    field="storeFontSize"        min={80} max={200} labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Nombre tienda"  field="storeNameFontSize"    min={24} max={72}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Categorías"     field="catFontSize"          min={12} max={30}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Fecha"          field="dateFontSize"         min={8}  max={20}  labelConfig={labelConfig} onUpdate={upd} />
            </div>

            <div className="lg:w-[380px] flex-shrink-0 self-start sticky top-4">
              <div className="bg-white rounded-2xl p-4 flex flex-col items-center gap-3" style={{ border: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(26,37,80,0.07)' }}>
                <div className="flex items-center justify-between self-stretch">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#D97706' }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#94A3B8]">Vista previa</span>
                  </div>
                  <span className="text-[10px] text-[#CBD5E1]">{Math.round(previewScale * 100)}%</span>
                </div>
                <div className="w-full overflow-hidden rounded-lg" style={{ height: previewH, background: '#F8FAFC', position: 'relative' }}>
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top center', width: 720, position: 'absolute', top: 0, left: '50%', marginLeft: -360, pointerEvents: 'none' }}>
                    <BarcodeCard
                      value="17MAI;JuanPerez;WH/PICK/1234;P1;Comida,Aseo"
                      palletNum={1} total={3} slotId={419}
                      storeCod="17MAI" pickerLabel="Juan Pérez" responsibleKey="Pickers 1"
                      allCategories={['Comida', 'Aseo']} totalPickers={4}
                      compact={false} labelConfig={labelConfig}
                    />
                  </div>
                </div>
                <div className="self-stretch text-[10px] text-[#CBD5E1] text-center">Cambios en tiempo real</div>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl px-4 py-3 min-w-0" style={{ border: '1px solid #E2E8F0' }}>
              <PanelLabel icon={<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="0" y="1" width="1.5" height="10"/><rect x="2.5" y="1" width="1" height="10"/><rect x="4.5" y="1" width="2" height="10"/><rect x="7.5" y="1" width="1" height="10"/><rect x="9.5" y="1" width="1.5" height="10"/></svg>} label="Código de barras" />
              <PropRow label="Grosor barras"  field="barcodeBarWidth"       min={1}  max={4}   unit="" labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Altura"         field="barcodeHeight"         min={40} max={130}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Ancho"          field="barcodeContainerWidth" min={60} max={100} unit="%" labelConfig={labelConfig} onUpdate={upd} />
              <PanelLabel icon={<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>} label="Forma" />
              <PropRow label="Borde grosor"   field="borderWidth"   min={0} max={4}  labelConfig={labelConfig} onUpdate={upd} />
              <PropRow label="Radio esquinas" field="cornerRadius"  min={0} max={20} labelConfig={labelConfig} onUpdate={upd} />
              <PanelLabel icon={<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><ellipse cx="6" cy="6" rx="5" ry="3.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg>} label="Visibilidad" />
              <ToggleRow label="Responsable"   desc="ej. Pickers 3"          field="showResponsable" />
              <ToggleRow label="Categorías"    desc="Comida · Aseo · Hogar"  field="showCategories" />
              <ToggleRow label="Nombre tienda" desc="Texto bajo el código"   field="showStoreName" />
              <ToggleRow label="Fecha impresión" field="showDate" />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-4">
            <div className="text-[16px] font-bold text-navy leading-tight">Nombres de pickers</div>
            <div className="text-[12px] text-[#94A3B8] mt-0.5">Se aplican automáticamente al asignar operaciones</div>
          </div>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex flex-col sm:flex-row">
              <div className="flex-1 sm:border-r" style={{ borderColor: '#E2E8F0' }}>
                {CANONICAL_PICKER_KEYS.slice(0, 7).map(key => (
                  <PickerNameRow key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''} onSave={handleNameSave} />
                ))}
              </div>
              <div className="flex-1 sm:border-r" style={{ borderColor: '#E2E8F0' }}>
                {CANONICAL_PICKER_KEYS.slice(7, 14).map(key => (
                  <PickerNameRow key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''} onSave={handleNameSave} />
                ))}
              </div>
              <div className="flex-1">
                {CANONICAL_PICKER_KEYS.slice(14).map(key => (
                  <PickerNameRow key={key} pickerKey={key} savedValue={canonicalNames[key] ?? ''} onSave={handleNameSave} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="mb-4">
            <div className="text-[16px] font-bold text-navy leading-tight">Vista en pantalla</div>
            <div className="text-[12px] text-[#94A3B8] mt-0.5">Ajusta la densidad del monitoreo</div>
          </div>
          <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #E2E8F0' }}>
            <div className="text-[12px] font-semibold text-[#64748B] mb-3">Etiquetas por fila en monitoreo</div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onColsPerRowChange(n)}
                  className="w-10 h-10 rounded-xl text-[14px] font-bold cursor-pointer transition-all active:scale-95"
                  style={{
                    background: colsPerRow === n ? 'linear-gradient(135deg,#1E3A8A,#2563EB)' : '#F1F5F9',
                    color: colsPerRow === n ? '#fff' : '#94A3B8',
                    border: `1.5px solid ${colsPerRow === n ? 'rgba(37,99,235,0.4)' : '#E2E8F0'}`,
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
