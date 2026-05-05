'use client';

interface CalData { on: boolean; p: number; b: number; g?: string; }

interface Props {
  calT: Record<string, CalData>;
  grps: Set<string>;
  onToggleGroup: (gid: string) => void;
  onToggleChip: (cod: string) => void;
  onUpdateChip: (cod: string, key: 'p' | 'b', val: string) => void;
}

export default function CalendarMode({ calT, grps, onToggleGroup, onToggleChip, onUpdateChip }: Props) {
  const grupos: [string, string][] = [
    ['rm',    '🏙️ RM'],
    ['costa', '🌊 Costa'],
    ['fal',   '🏢 Falabella'],
  ];

  return (
    <div>
      <div className="flex gap-[7px] flex-wrap mb-3">
        {grupos.map(([id, lb]) => (
          <button
            key={id}
            onClick={() => onToggleGroup(id)}
            className={`h-[38px] px-4 rounded-full text-[14px] font-bold border-[2px] transition-all shadow-md hover:shadow-lg
              ${grps.has(id)
                ? 'bg-kred border-kred text-white shadow-red-200'
                : 'bg-white border-black/[0.12] text-kmuted hover:border-kred/[0.3]'}`}
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
        Toca una tienda para activar/desactivar. Ingresa P y B para cada una.
      </div>
    </div>
  );
}

function StoreChip({ cod, data, onToggle, onUpdate }: {
  cod: string;
  data: CalData;
  onToggle: (cod: string) => void;
  onUpdate: (cod: string, key: 'p' | 'b', val: string) => void;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-[12px] px-2 py-1.5 border-[1.5px] bg-kbg cursor-pointer transition-all h-[76px]
      ${data.on ? 'border-kred bg-kred/[0.05]' : 'opacity-40 border-black/[0.09]'}`}>
      <span
        className={`font-mono text-[14px] font-bold mb-1 ${data.on ? 'text-kred' : 'text-kmuted'}`}
        onClick={() => onToggle(cod)}
      >
        {cod}
      </span>
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <input
          type="number" min="0" max="20"
          value={data.p || ''}
          placeholder="P"
          onChange={e => onUpdate(cod, 'p', e.target.value)}
          className="w-11 h-9 rounded-[4px] border border-black/[0.12] bg-white text-[13px] font-bold text-center text-ktext placeholder:text-kmuted placeholder:font-bold focus:outline-none"
        />
        <input
          type="number" min="0" max="99"
          value={data.b || ''}
          placeholder="B"
          onChange={e => onUpdate(cod, 'b', e.target.value)}
          className="w-11 h-9 rounded-[4px] border border-black/[0.12] bg-white text-[13px] font-bold text-center text-ktext placeholder:text-kmuted placeholder:font-bold focus:outline-none"
        />
      </div>
    </div>
  );
}
