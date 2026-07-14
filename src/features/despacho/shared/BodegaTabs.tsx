'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Barra de tabs del módulo BODEGA (barra blanca bajo el banner). Navega entre las rutas
 * existentes (no fusiona las pantallas). Cada tab bien separado (divisor + subrayado activo).
 */
const TABS: { label: string; href: string }[] = [
  { label: 'Nacional',   href: '/despacho/regiones' },
  { label: 'RM / Costa', href: '/despacho/santiago' },
  { label: 'Actividad',  href: '/despacho/actividad' },
];

export function BodegaTabs() {
  const pathname = usePathname();

  return (
    <div className="flex bg-white border-b-2 border-bg-2 flex-shrink-0 print:hidden">
      {TABS.map((tab, i) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 text-center py-3 px-2 font-barlow-condensed text-[14px] font-bold tracking-wide no-underline transition-all border-b-[3px] -mb-0.5 ${
              i > 0 ? 'border-l border-bg-2' : ''
            } ${active ? 'text-red border-b-red bg-[rgba(211,47,47,0.04)]' : 'text-text-3 border-b-transparent hover:text-text-2 hover:bg-bg/50'}`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
