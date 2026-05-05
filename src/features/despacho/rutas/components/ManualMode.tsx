'use client';
import { useEffect } from 'react';

interface CalData { on: boolean; p: number; b: number; g?: string; }

interface Props {
  value: string;
  onChange: (v: string) => void;
  calT: Record<string, CalData>;
  modo: string;
}

export default function ManualMode({ value, onChange, calT, modo }: Props) {
  const stores = Object.keys(calT || {})
    .filter(cod => {
      const grupo = calT[cod]?.g;
      return grupo === 'rm' || grupo === 'costa';
    })
    .sort();

  useEffect(() => {
    if (modo !== 'man') return;
    if (stores.length === 0) return;

    const hasUserInput = value.trim().length > 0 && value !== stores.join('\n');
    if (hasUserInput) return;

    const initialText = stores.join('\n');
    if (value !== initialText) {
      onChange(initialText);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, stores.join(','), value]);

  return (
    <div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={"LP: 3P 2B\nMQH 1P 2B\nTRE 5P"}
        className="w-full min-h-[120px] px-3 py-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-kios2 resize-y text-[13px] font-mono text-ktext leading-[1.7] transition-colors focus:border-kred focus:outline-none"
      />
      <div className="text-[11px] text-kmuted mt-1.5 leading-relaxed space-y-0.5">
        <div>Una tienda por línea: <code className="font-mono bg-kbg px-1 py-px rounded text-kred">CÓDIGO  Pallets P  Bultos B</code></div>
        <div className="text-kmuted/70">
          Acepta: <code className="font-mono">LP 3P 2B</code> · <code className="font-mono">LP 3P</code> · <code className="font-mono">LP: 3P + 2B</code> · <code className="font-mono">LP 3P - 2B</code>
        </div>
      </div>
    </div>
  );
}
