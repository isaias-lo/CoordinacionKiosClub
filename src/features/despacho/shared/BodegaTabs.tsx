'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Barra de tabs del módulo BODEGA: permite pasar de Nacional a RM/Costa (y a Actividad)
 * sin ir al sidebar. Navega entre las rutas existentes (no fusiona las pantallas).
 * Se monta arriba del cuerpo en cada pantalla de bodega.
 */
const TABS: { label: string; href: string }[] = [
  { label: 'Nacional',   href: '/despacho/regiones' },
  { label: 'RM / Costa', href: '/despacho/santiago' },
  // { label: 'Actividad', href: '/despacho/actividad' },  // se agrega en el módulo Actividad
];

export function BodegaTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-stretch bg-white border-b-2 border-bg-2 flex-shrink-0 print:hidden overflow-x-auto">
      <div className="flex items-center px-3 font-barlow-condensed text-[11px] font-extrabold tracking-widest uppercase text-navy/70 border-r border-bg-2 select-none flex-shrink-0">
        Bodega
      </div>
      {TABS.map(tab => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 min-w-[110px] py-3 px-1 text-center font-barlow-condensed text-sm font-semibold tracking-wide cursor-pointer transition-all border-b-[3px] -mb-0.5 no-underline ${
              active ? 'text-red border-red' : 'text-text-3 border-transparent hover:text-text-2'
            }`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
