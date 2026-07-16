'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Tabs del módulo BODEGA, pensados para vivir DENTRO del banner navy (header) de cada
 * pantalla de bodega. Navega entre las rutas existentes (no fusiona las pantallas).
 * Estilo píldora sobre fondo oscuro; se estira para ocupar el centro del header.
 */
const TABS: { label: string; href: string }[] = [
  { label: 'Nacional',   href: '/despacho/regiones' },
  { label: 'RM / Costa', href: '/despacho/santiago' },
  { label: 'Actividad',  href: '/despacho/actividad' },
];

export function BodegaTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar print:hidden flex-1 min-w-0 justify-center">
      {TABS.map(tab => {
        const active = !!pathname && (pathname === tab.href || pathname.startsWith(tab.href + '/'));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`px-3.5 py-1.5 rounded-full font-barlow-condensed text-[13px] font-bold tracking-wide whitespace-nowrap no-underline transition-all ${
              active ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
            }`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
