'use client';
import { useSantiago } from '../context/SantiagoContext';
import type { RegimenCarga } from '../types';

const OPCIONES: { value: RegimenCarga; emoji: string; desc: string }[] = [
  { value: 'Seco',      emoji: '📦', desc: 'Temperatura ambiente' },
  { value: 'Congelado', emoji: '❄️', desc: 'Cadena de frío' },
];

export function StepRegimen() {
  const { state, dispatch } = useSantiago();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 gap-8 bg-bg">
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
