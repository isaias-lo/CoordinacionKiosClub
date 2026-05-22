'use client';
import { formatCod } from '../utils/helpers';

interface CalData { on: boolean; p: number; b: number; c: number; g?: string; }

interface Props {
  calT: Record<string, CalData>;
  grps: Set<string>;
  onToggleGroup: (gid: string) => void;
  onToggleChip: (cod: string) => void;
  onUpdateChip: (cod: string, key: 'p' | 'b' | 'c', val: string) => void;
}

export default function CalendarMode({ calT, grps, onToggleGroup, onToggleChip, onUpdateChip }: Props) {
  const grupos: [string, string][] = [
    ['rm',    'RM'],
    ['costa', 'Costa'],
    ['fal',   'Regiones'],
  ];

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {grupos.map(([id, lb]) => (
          <button
            key={id}
            onClick={() => onToggleGroup(id)}
            style={grps.has(id)
              ? { boxShadow: '0 3px 10px rgba(212,43,43,0.30), inset 0 1px 0 rgba(255,255,255,0.18)' }
              : { boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 1px 1px rgba(0,0,0,0.04)' }}
            className={`h-[40px] px-5 rounded-[13px] text-[13px] font-bold uppercase tracking-widest border transition-all
              ${grps.has(id)
                ? 'bg-kred border-kred text-white'
                : 'bg-white border-black/[0.07] text-kmuted hover:border-kred/[0.25] hover:text-kred'}`}
          >
            {lb}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {Object.keys(calT).map(cod => (
          <StoreChip
            key={cod}
            cod={cod}
            data={calT[cod]}
            onToggle={onToggleChip}
            onUpdate={onUpdateChip}
          />
        ))}
      </div>

      <div className="mt-2 text-[11px] text-kmuted">
        Toca una tienda para activar/desactivar. Ingresa P, B y C para cada una.
      </div>
    </div>
  );
}

function StoreChip({ cod, data, onToggle, onUpdate }: {
  cod: string;
  data: CalData;
  onToggle: (cod: string) => void;
  onUpdate: (cod: string, key: 'p' | 'b' | 'c', val: string) => void;
}) {
  return (
    <div
      style={{ boxShadow: data.on ? '0 1px 4px rgba(212,43,43,0.12)' : '0 1px 3px rgba(0,0,0,0.06)' }}
      className={`flex flex-col items-center justify-center rounded-[12px] px-1.5 py-2 border cursor-pointer transition-all h-[90px]
        ${data.on
          ? 'border-kred/[0.35] bg-kred/[0.04]'
          : 'opacity-40 border-black/[0.07] bg-white'}`}
    >
      <span
        className={`font-mono text-[14px] font-bold mb-1.5 ${data.on ? 'text-kred' : 'text-kmuted'}`}
        onClick={() => onToggle(cod)}
      >
        {formatCod(cod)}
      </span>
      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
        <input
          type="number" min="0" max="20"
          value={data.p || ''}
          placeholder="P"
          onChange={e => onUpdate(cod, 'p', e.target.value)}
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
          className="w-8 h-[26px] rounded-[6px] border border-black/[0.09] bg-white text-[12px] font-bold text-center text-ktext placeholder:text-kmuted/50 focus:outline-none focus:border-kred"
        />
        <input
          type="number" min="0" max="99"
          value={data.b || ''}
          placeholder="B"
          onChange={e => onUpdate(cod, 'b', e.target.value)}
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
          className="w-8 h-[26px] rounded-[6px] border border-black/[0.09] bg-white text-[12px] font-bold text-center text-ktext placeholder:text-kmuted/50 focus:outline-none focus:border-kred"
        />
        <input
          type="number" min="0" max="99"
          value={data.c || ''}
          placeholder="C"
          onChange={e => onUpdate(cod, 'c', e.target.value)}
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
          className="w-8 h-[26px] rounded-[6px] border border-black/[0.09] bg-white text-[12px] font-bold text-center text-ktext placeholder:text-kmuted/50 focus:outline-none focus:border-kred"
        />
      </div>
    </div>
  );
}
