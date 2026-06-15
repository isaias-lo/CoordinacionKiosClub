import { useApp } from '../../../../context/AppContext';

export function StatsBar() {
  const { getStats } = useApp();
  const { pallets, bultos, contenedores, tiendas } = getStats();
  const stats = [
    { v: pallets,     l: 'Pallets' },
    { v: bultos,      l: 'Bultos' },
    ...(contenedores > 0 ? [{ v: contenedores, l: 'Cont.' }] : []),
    { v: tiendas,     l: 'Tiendas' },
  ];

  return (
    <div className="flex justify-center flex-shrink-0"
         style={{ background: 'var(--surface-header)', borderBottom: '4px solid #D42B2B' }}>
      {stats.map(({ v, l }, i) => (
        <div key={l}
             className={`flex-1 py-2 px-1 text-center max-w-[120px] ${i < stats.length - 1 ? 'border-r border-line' : ''}`}>
          <div className="font-barlow-condensed text-[22px] font-bold leading-none"
               style={{ color: 'var(--text-hi)' }}>{v}</div>
          <div className="text-[10px] uppercase tracking-widest mt-0.5"
               style={{ color: 'var(--text-lo)' }}>{l}</div>
        </div>
      ))}
    </div>
  );
}
