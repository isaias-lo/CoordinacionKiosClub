import { useApp } from '../../../../context/AppContext';

interface Props { onClear: () => void; }

export function BottomBar({ onClear }: Props) {
  const { state } = useApp();
  const { selectedTienda, dispatch: dispatchData, activeTab } = state;
  if (activeTab !== 0) return null;
  if (!selectedTienda) return null;

  const items = dispatchData[selectedTienda] || [];
  if (!items.length) return null;

  const pallets = items.filter(i => i.pkg === 'pallet').length;
  const bultos  = items.filter(i => i.pkg === 'box').length;
  const peso    = items.reduce((s, i) => s + i.peso, 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 px-4 py-2.5 z-[150] flex items-center gap-3"
         style={{ background: 'var(--surface-header)', borderTop: '1px solid var(--line)' }}>
      <div className="flex gap-4 flex-1">
        {[
          { v: pallets, l: 'P' },
          { v: bultos,  l: 'B' },
          { v: peso.toLocaleString('es-CL'), l: 'kg' },
        ].map(({ v, l }) => (
          <div key={l} className="flex items-baseline gap-1">
            <span className="font-mono text-[18px] font-bold leading-none"
                  style={{ color: 'var(--text-hi)' }}>{v}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest"
                  style={{ color: 'var(--text-lo)' }}>{l}</span>
          </div>
        ))}
      </div>
      <button onClick={onClear}
        className="px-3 py-1.5 cursor-pointer font-mono text-[11px] uppercase tracking-widest transition-all active:opacity-70"
        style={{ background: 'var(--surface-inset)', border: '1px solid var(--line-2)', borderRadius: 6, color: 'var(--text-lo)' }}>
        limpiar
      </button>
    </div>
  );
}
