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
    <div className="flex justify-center bg-navy-dark border-b-4 border-red flex-shrink-0">
      {stats.map(({ v, l }, i) => (
        <div key={l}
             className={`flex-1 py-2 px-1 text-center max-w-[120px] ${i < stats.length - 1 ? 'border-r border-white/8' : ''}`}>
          <div className="font-barlow-condensed text-[22px] font-bold text-white leading-none">{v}</div>
          <div className="text-[10px] text-white/50 uppercase tracking-widest mt-0.5">{l}</div>
        </div>
      ))}
    </div>
  );
}
