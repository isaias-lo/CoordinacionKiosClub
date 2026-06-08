'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { todayISO as metricasTodayISO } from '../../utils/metricas';

export function ProduccionPanel({ onBack, pickerNombresList }: {
  onBack: () => void;
  pickerNombresList: string[];
}) {
  const todayStr = metricasTodayISO();
  const [fecha,        setFecha]        = useState(todayStr);
  const [produccion,   setProduccion]   = useState<Record<string, string>>({});
  const [saved,        setSaved]        = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [configPickers, setConfigPickers] = useState<string[]>([]);

  // Cargar pickers desde picker_config si no vienen por prop
  useEffect(() => {
    const list = pickerNombresList.length > 0 ? pickerNombresList : [];
    if (list.length > 0) { setConfigPickers(list); return; }
    supabase.from('picker_config').select('picker_nombres').eq('id', 1).single()
      .then(({ data }) => { if (Array.isArray(data?.picker_nombres)) setConfigPickers(data.picker_nombres as string[]); });
  }, [pickerNombresList]);

  // Cargar producción guardada para la fecha seleccionada
  useEffect(() => {
    supabase.from('produccion_diaria').select('picker_nombre, pallets_producidos').eq('fecha', fecha)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((r: { picker_nombre: string; pallets_producidos: number }) => {
          map[r.picker_nombre] = String(r.pallets_producidos);
        });
        setProduccion(map);
      });
  }, [fecha]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    const rows = Object.entries(produccion)
      .filter(([, v]) => v !== '' && !isNaN(parseInt(v)))
      .map(([picker_nombre, v]) => ({ picker_nombre, fecha, pallets_producidos: parseInt(v) }));
    if (rows.length === 0) { setSaving(false); setError('Ingresa al menos un valor.'); return; }
    const { error: err } = await supabase
      .from('produccion_diaria')
      .upsert(rows, { onConflict: 'picker_nombre,fecha' });
    if (err) { setError(err.message); } else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  };

  const pickers = configPickers.length > 0 ? configPickers : [];

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #92400E 0%, #D97706 100%)', boxShadow: '0 2px 16px rgba(146,64,14,0.35)' }}>
        <button onClick={onBack}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Producción diaria</div>
          <div className="text-[11px] text-white/50 uppercase tracking-widest">Pallets producidos por picker</div>
        </div>
        <button onClick={handleSave} disabled={saving || pickers.length === 0}
          className="px-4 py-2 rounded-xl font-barlow-condensed text-[15px] font-bold tracking-wider text-white uppercase cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
          style={{ background: saved ? 'rgba(22,163,74,0.9)' : 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>
          {saving ? '⏳' : saved ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto flex flex-col gap-4">

          {/* Selector de fecha */}
          <div className="bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
            <div className="text-[12px] font-bold text-text-2 uppercase tracking-wide mb-2">Fecha</div>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} max={todayStr}
              className="w-full border border-border rounded-btn px-3 py-2.5 text-[15px] text-text font-barlow outline-none focus:border-navy [-webkit-appearance:none]"
              style={{ background: 'white' }} />
          </div>

          {/* Tabla de pickers */}
          {pickers.length === 0 ? (
            <div className="text-center py-10 text-text-3">
              <div className="text-[36px] mb-2">👷</div>
              <div className="text-[14px] font-barlow-condensed">Sin pickers configurados.</div>
              <div className="text-[12px] mt-1">Agrega pickers en Configuración primero.</div>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
              <div className="px-4 py-3 border-b border-border">
                <div className="font-barlow-condensed text-[16px] font-bold text-navy">Pallets producidos · {fecha}</div>
                <div className="text-[11px] text-text-3 mt-0.5">Ingresa 0 o deja vacío si el picker no trabajó hoy</div>
              </div>
              <div className="divide-y divide-border/60">
                {pickers.map(nombre => (
                  <div key={nombre} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[13px]"
                      style={{ background: '#1a2550' }}>
                      {nombre.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <span className="flex-1 text-[14px] font-semibold text-text">{nombre}</span>
                    <input
                      type="number" inputMode="numeric" min="0" max="999"
                      value={produccion[nombre] ?? ''}
                      onChange={e => setProduccion(p => ({ ...p, [nombre]: e.target.value }))}
                      placeholder="0"
                      className="w-20 border border-border rounded-btn px-3 py-2 text-[16px] text-center font-barlow text-text font-bold outline-none focus:border-navy [-webkit-appearance:none]"
                      style={{ background: 'white' }}
                    />
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 bg-bg border-t border-border text-[11px] text-text-3">
                Total: <strong className="text-navy">{Object.values(produccion).reduce((s, v) => s + (parseInt(v) || 0), 0)} pallets</strong>
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
