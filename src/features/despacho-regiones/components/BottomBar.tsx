import { useApp } from '../../../context/AppContext';

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
    <div className="fixed bottom-0 left-0 right-0 bg-navy border-t-[3px] border-red px-4 py-2.5 z-[150] flex items-center gap-3"
         style={{ boxShadow: '0 -4px 20px rgba(26,37,80,0.2)' }}>
      <div className="flex gap-3.5 flex-1">
        {[
          { v: pallets, l: 'pallets' },
          { v: bultos,  l: 'bultos' },
          { v: peso.toLocaleString('es-CL'), l: 'kg' },
        ].map(({ v, l }) => (
          <div key={l}>
            <div className="font-barlow-condensed text-xl font-bold text-white leading-none">{v}</div>
            <div className="text-[10px] text-white/50 uppercase tracking-widest">{l}</div>
          </div>
        ))}
      </div>
      <button onClick={onClear}
        className="px-3 py-1.5 bg-white/10 text-white/70 border border-white/15 rounded-btn font-barlow text-xs cursor-pointer">
        🗑 Limpiar
      </button>
    </div>
  );
}
