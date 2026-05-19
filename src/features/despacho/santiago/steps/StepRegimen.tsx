'use client';
import { useState, useEffect } from 'react';
import { useSantiago, SANTIAGO_TERMINADO_KEY } from '../context/SantiagoContext';
import type { RegimenCarga } from '../types';

const OPCIONES: { value: RegimenCarga; emoji: string; desc: string }[] = [
  { value: 'Seco',      emoji: '📦', desc: 'Temperatura ambiente' },
  { value: 'Congelado', emoji: '❄️', desc: 'Cadena de frío' },
];

export function StepRegimen() {
  const { state, dispatch } = useSantiago();
  const [terminatedAt, setTerminatedAt] = useState('');

  useEffect(() => {
    const val = localStorage.getItem(SANTIAGO_TERMINADO_KEY);
    if (val) setTerminatedAt(val);
  }, []);

  const handleReopen = () => {
    if (!confirm('¿Reabrir el despacho del día?')) return;
    localStorage.removeItem(SANTIAGO_TERMINADO_KEY);
    setTerminatedAt('');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 gap-8 bg-bg">

      {/* Completed banner */}
      {terminatedAt && (
        <div
          onClick={handleReopen}
          className="w-full max-w-sm flex items-center gap-3 px-4 py-3 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.98]"
          style={{ background: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.40)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: 'linear-gradient(145deg,#22C55E,#15803D)', boxShadow: '0 3px 8px rgba(34,197,94,0.40)' }}>
            <span className="text-white text-[18px] font-bold">✓</span>
          </div>
          <div className="flex-1">
            <div className="font-barlow-condensed text-[16px] font-bold text-[#15803D] tracking-wide uppercase">Despacho completado</div>
            <div className="text-[12px] text-text-3">Registrado a las {terminatedAt} · Toca para reabrir</div>
          </div>
        </div>
      )}

      <div className="text-center">
        <div className="font-barlow-condensed text-[11px] uppercase tracking-widest text-text-3 mb-1">
          Paso 1 de 3
        </div>
        <div className="font-barlow-condensed text-[32px] font-bold text-navy leading-tight">
          Régimen de Carga
        </div>
        <div className="text-[14px] text-text-3 mt-1">Selecciona para continuar</div>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        {OPCIONES.map(({ value, emoji, desc }) => (
          <button
            key={value}
            onClick={() => dispatch({ type: 'SET_REGIMEN', payload: value })}
            className={`w-full rounded-2xl px-5 py-6 flex items-center gap-5 cursor-pointer transition-all active:scale-[0.98] border-2 text-left ${
              state.regimen === value
                ? 'bg-[rgba(37,99,235,0.10)] border-info shadow-[0_8px_24px_rgba(37,99,235,0.18)]'
                : 'bg-white border-border shadow-card hover:border-info/40'
            }`}>
            <div className="text-[42px] leading-none flex-shrink-0">{emoji}</div>
            <div>
              <div className={`font-barlow-condensed text-[26px] font-extrabold tracking-wide leading-tight ${state.regimen === value ? 'text-info' : 'text-navy'}`}>
                {value.toUpperCase()}
              </div>
              <div className="text-[13px] text-text-3 mt-0.5">{desc}</div>
            </div>
            {state.regimen === value && (
              <div className="ml-auto text-info text-[22px] flex-shrink-0">✓</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
