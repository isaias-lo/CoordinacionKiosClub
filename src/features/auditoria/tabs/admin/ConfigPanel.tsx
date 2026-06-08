'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Users, UserCheck, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { fetchParametros, saveParametros, calcMinimo } from '../../utils/metricas';
import type { Parametros } from '../../utils/metricas';

export function ConfigPanel({ onBack, onSaved, userRole }: {
  onBack: () => void;
  onSaved: (pickerNombresList: string[], auditores: string[]) => void;
  userRole?: string;
}) {
  const [pickerList,   setPickerList]   = useState<string[]>([]);
  const [newPicker,    setNewPicker]    = useState('');
  const [auditores,    setAuditores]    = useState<string[]>([]);
  const [newAuditor,   setNewAuditor]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [error,        setError]        = useState('');

  // Parámetros de métricas
  const [params,       setParams]       = useState<Parametros | null>(null);
  const [savingParams, setSavingParams] = useState(false);
  const [savedParams,  setSavedParams]  = useState(false);
  const [minimoCalc,   setMinimoCalc]   = useState(73);
  const [minimoModo,   setMinimoModo]   = useState<'auto' | 'manual'>('auto');

  useEffect(() => {
    supabase.from('picker_config').select('nombres, auditores, picker_nombres').eq('id', 1).single()
      .then(({ data }) => {
        if (Array.isArray(data?.picker_nombres) && (data.picker_nombres as string[]).length > 0) {
          setPickerList(data.picker_nombres as string[]);
        } else if (data?.nombres && typeof data.nombres === 'object' && !Array.isArray(data.nombres)) {
          const vals = Object.values(data.nombres as Record<string, string>).filter(Boolean);
          if (vals.length > 0) setPickerList(Array.from(new Set(vals)).sort());
        }
        if (Array.isArray(data?.auditores)) setAuditores(data.auditores as string[]);
      });
    fetchParametros().then(p => { setParams(p); setMinimoCalc(calcMinimo(p.nivel_confianza_z, p.margen_error)); });
  }, []);

  const addPicker = () => {
    const name = newPicker.trim();
    if (!name || pickerList.includes(name)) return;
    setPickerList(prev => [...prev, name].sort());
    setNewPicker('');
  };
  const removePicker = (name: string) => setPickerList(prev => prev.filter(p => p !== name));

  const addAuditor = () => {
    const name = newAuditor.trim();
    if (!name || auditores.includes(name)) return;
    setAuditores(prev => [...prev, name].sort());
    setNewAuditor('');
  };

  const removeAuditor = (name: string) => setAuditores(prev => prev.filter(a => a !== name));

  const handleSave = async () => {
    setSaving(true); setError('');
    const { error: err } = await supabase
      .from('picker_config')
      .upsert({ id: 1, picker_nombres: pickerList, auditores, updated_at: new Date().toISOString() });
    if (err) {
      setError(err.message);
    } else {
      onSaved(pickerList, auditores);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', boxShadow: '0 2px 16px rgba(15,118,110,0.35)' }}>
        <button onClick={onBack}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Configuración</div>
          <div className="text-[11px] text-white/50 uppercase tracking-widest">{userRole === 'admin' ? 'Admin' : 'Admin Auditoría'}</div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
          style={{ background: saved ? 'rgba(22,163,74,0.9)' : 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
          {saving ? '⏳ Guardando…' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-5">

          {/* Picker names section */}
          <div className="bg-white border border-border rounded-card overflow-hidden"
            style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.06)' }}>
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: 'linear-gradient(145deg, rgba(26,37,80,0.12), rgba(26,37,80,0.06))', border: '1px solid rgba(26,37,80,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                <Users size={15} color="#1a2550" strokeWidth={2} />
              </div>
              <div>
                <div className="font-barlow-condensed text-[17px] font-bold text-navy">Pickers (armadores de pallet)</div>
                <div className="text-[11px] text-text-3">Nombres disponibles para seleccionar en el formulario · Odoo asigna el número</div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {/* Add new */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newPicker}
                  onChange={e => setNewPicker(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPicker(); } }}
                  placeholder="Nombre del picker…"
                  className="flex-1 bg-white border border-border rounded-btn px-3 py-2 text-[14px] text-text outline-none focus:border-navy transition-colors [-webkit-appearance:none]"
                />
                <button
                  onClick={addPicker}
                  disabled={!newPicker.trim()}
                  className="px-4 py-2 rounded-btn font-barlow-condensed text-[14px] font-bold text-white cursor-pointer disabled:opacity-40 active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg,#0f766e,#0d9488)' }}>
                  + Agregar
                </button>
              </div>
              {/* List */}
              {pickerList.length === 0 && (
                <div className="text-center text-text-3 text-[12px] py-3 italic">Sin pickers configurados aún</div>
              )}
              {pickerList.map(name => (
                <div key={name} className="flex items-center justify-between px-3 py-2.5 bg-bg rounded-btn border border-border">
                  <span className="text-[14px] font-semibold text-text">{name}</span>
                  <button onClick={() => removePicker(name)}
                    className="border-none bg-transparent text-text-3 hover:text-red cursor-pointer text-[18px] leading-none px-1 transition-colors">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Auditor list section */}
          <div className="bg-white border border-border rounded-card overflow-hidden"
            style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.06)' }}>
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: 'linear-gradient(145deg, rgba(26,37,80,0.12), rgba(26,37,80,0.06))', border: '1px solid rgba(26,37,80,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                <UserCheck size={15} color="#1a2550" strokeWidth={2} />
              </div>
              <div>
                <div className="font-barlow-condensed text-[17px] font-bold text-navy">Auditores</div>
                <div className="text-[11px] text-text-3">Lista de auditores disponibles para seleccionar en el formulario</div>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {/* Add new */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAuditor}
                  onChange={e => setNewAuditor(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAuditor(); } }}
                  placeholder="Nombre del auditor…"
                  className="flex-1 bg-white border border-border rounded-btn px-3 py-2 text-[14px] text-text outline-none focus:border-navy transition-colors [-webkit-appearance:none]"
                />
                <button
                  onClick={addAuditor}
                  disabled={!newAuditor.trim()}
                  className="px-4 py-2 rounded-btn font-barlow-condensed text-[14px] font-bold text-white cursor-pointer disabled:opacity-40 active:scale-95 transition-all"
                  style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)' }}>
                  + Agregar
                </button>
              </div>
              {/* List */}
              {auditores.length === 0 && (
                <div className="text-center text-text-3 text-[12px] py-3 italic">Sin auditores configurados aún</div>
              )}
              {auditores.map(name => (
                <div key={name} className="flex items-center justify-between px-3 py-2.5 bg-bg rounded-btn border border-border">
                  <span className="text-[14px] font-semibold text-text">{name}</span>
                  <button onClick={() => removeAuditor(name)}
                    className="border-none bg-transparent text-text-3 hover:text-red cursor-pointer text-[18px] leading-none px-1 transition-colors">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Parámetros de métricas */}
          {params && (
            <div className="bg-white border border-border rounded-card overflow-hidden"
              style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.06)' }}>
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: 'linear-gradient(145deg, rgba(26,37,80,0.12), rgba(26,37,80,0.06))', border: '1px solid rgba(26,37,80,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
                    <SlidersHorizontal size={15} color="#1a2550" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="font-barlow-condensed text-[17px] font-bold text-navy">Parámetros de métricas</div>
                    <div className="text-[11px] text-text-3">Sistema de bono y auditoría estadística</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setSavingParams(true);
                    await saveParametros(params);
                    setSavingParams(false); setSavedParams(true);
                    setTimeout(() => setSavedParams(false), 2500);
                  }}
                  disabled={savingParams}
                  className="px-3 py-1.5 rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
                  style={{ background: savedParams ? 'rgba(22,163,74,0.15)' : 'rgba(26,37,80,0.08)', color: savedParams ? '#16A34A' : '#1a2550', border: '1px solid', borderColor: savedParams ? '#16A34A' : 'rgba(26,37,80,0.15)' }}>
                  {savingParams ? '⏳' : savedParams ? '✓ Guardado' : 'Guardar'}
                </button>
              </div>
              <div className="p-4 flex flex-col gap-4">
                {/* Nivel de confianza */}
                <div>
                  <div className="text-[12px] font-bold text-text-2 mb-1.5">Nivel de confianza</div>
                  <div className="flex gap-2">
                    {([['1.645', '90%'], ['1.96', '95%'], ['2.576', '99%']] as const).map(([z, lbl]) => (
                      <button key={z} onClick={() => { const newZ = parseFloat(z); const newMin = calcMinimo(newZ, params.margen_error); setMinimoCalc(newMin); setParams({ ...params, nivel_confianza_z: newZ, ...(minimoModo === 'auto' ? { minimo_auditorias: newMin } : {}) }); }}
                        className="flex-1 py-2 rounded-btn border text-[13px] font-bold cursor-pointer transition-all"
                        style={params.nivel_confianza_z === parseFloat(z) ? { background: '#1a2550', color: '#fff', borderColor: '#1a2550' } : { background: 'white', color: '#374151', borderColor: '#E5E7EB' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margen de error */}
                <div>
                  <div className="text-[12px] font-bold text-text-2 mb-1.5">Margen de error</div>
                  <div className="flex gap-2">
                    {([['0.03', '±3%'], ['0.05', '±5%'], ['0.10', '±10%']] as const).map(([e, lbl]) => (
                      <button key={e} onClick={() => { const newE = parseFloat(e); const newMin = calcMinimo(params.nivel_confianza_z, newE); setMinimoCalc(newMin); setParams({ ...params, margen_error: newE, ...(minimoModo === 'auto' ? { minimo_auditorias: newMin } : {}) }); }}
                        className="flex-1 py-2 rounded-btn border text-[13px] font-bold cursor-pointer transition-all"
                        style={params.margen_error === parseFloat(e) ? { background: '#1a2550', color: '#fff', borderColor: '#1a2550' } : { background: 'white', color: '#374151', borderColor: '#E5E7EB' }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mínimo de auditorías por picker */}
                <div className="px-3 py-2.5 rounded-btn border"
                  style={{ background: minimoModo === 'auto' ? 'rgba(37,99,235,0.05)' : 'rgba(217,119,6,0.06)', borderColor: minimoModo === 'auto' ? 'rgba(37,99,235,0.3)' : 'rgba(217,119,6,0.35)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: minimoModo === 'auto' ? '#2563eb' : '#d97706' }}>
                      Mínimo por picker
                    </div>
                    <div className="flex rounded-full overflow-hidden border font-barlow-condensed text-[11px] font-bold" style={{ borderColor: 'rgba(26,37,80,0.18)' }}>
                      <button
                        onClick={() => { setMinimoModo('auto'); setParams(p => p ? { ...p, minimo_auditorias: minimoCalc } : p); }}
                        className="px-2.5 py-1 transition-all cursor-pointer tracking-wider"
                        style={minimoModo === 'auto' ? { background: '#1a2550', color: '#fff' } : { background: 'transparent', color: '#9ca3af' }}>
                        AUTO
                      </button>
                      <button
                        onClick={() => setMinimoModo('manual')}
                        className="px-2.5 py-1 transition-all cursor-pointer tracking-wider"
                        style={minimoModo === 'manual' ? { background: '#d97706', color: '#fff' } : { background: 'transparent', color: '#9ca3af' }}>
                        MANUAL
                      </button>
                    </div>
                  </div>
                  {minimoModo === 'auto' ? (
                    <>
                      <div className="font-barlow-condensed text-[24px] font-extrabold text-navy">{minimoCalc} <span className="text-[14px] font-normal text-text-3">pallets por picker</span></div>
                      <div className="text-[10px] text-text-3 mt-0.5">CEIL((Z² × 0.95 × 0.05) / e²) con Z={params.nivel_confianza_z}, e={params.margen_error}</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={params.minimo_auditorias}
                          onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 1); setParams(p => p ? { ...p, minimo_auditorias: v } : p); }}
                          className="w-24 bg-white border border-border rounded-btn px-3 py-1.5 font-barlow-condensed text-[22px] font-bold text-navy outline-none transition-colors text-center [-webkit-appearance:none]"
                          style={{ focusBorderColor: '#d97706' } as React.CSSProperties}
                        />
                        <span className="text-[13px] text-text-3">pallets por picker</span>
                      </div>
                      <div className="text-[10px] mt-1.5" style={{ color: '#d97706' }}>Valor manual · Fórmula estadística: {minimoCalc} pallets</div>
                    </>
                  )}
                </div>

                {/* Umbral bono */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <div className="text-[12px] font-bold text-text-2">Efectividad mínima para bono (%)</div>
                    <div className="font-barlow-condensed text-[16px] font-bold text-navy">{params.umbral_bono_pct}%</div>
                  </div>
                  <input type="range" min={70} max={100} step={1} value={params.umbral_bono_pct}
                    onChange={e => setParams(p => p ? { ...p, umbral_bono_pct: parseInt(e.target.value) } : p)}
                    className="w-full" style={{ accentColor: '#1a2550' }} />
                  <div className="flex justify-between text-[10px] text-text-3 mt-0.5"><span>70%</span><span>100%</span></div>
                </div>

                {/* Meta cobertura diaria */}
                <div>
                  <div className="flex justify-between mb-1.5">
                    <div className="text-[12px] font-bold text-text-2">Meta de cobertura diaria (%)</div>
                    <div className="font-barlow-condensed text-[16px] font-bold text-navy">{params.cobertura_diaria_meta}%</div>
                  </div>
                  <input type="range" min={10} max={100} step={5} value={params.cobertura_diaria_meta}
                    onChange={e => setParams(p => p ? { ...p, cobertura_diaria_meta: parseInt(e.target.value) } : p)}
                    className="w-full" style={{ accentColor: '#1a2550' }} />
                  <div className="flex justify-between text-[10px] text-text-3 mt-0.5"><span>10%</span><span>100%</span></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red text-center px-3 py-2.5 rounded-card border border-red/20"
              style={{ background: 'rgba(211,47,47,0.06)' }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
