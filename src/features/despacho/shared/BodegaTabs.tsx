'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Barra de tabs del módulo BODEGA (barra blanca bajo el banner). Navega entre las rutas
 * existentes (no fusiona las pantallas). Cada tab bien separado (divisor + subrayado activo).
 */
const SECO_TABS: { label: string; href: string }[] = [
  { label: 'Nacional',   href: '/despacho/regiones' },
  { label: 'RM / Costa', href: '/despacho/santiago' },
  { label: 'Actividad',  href: '/despacho/actividad' },
];

// Tabs del módulo CONGELADOS — mismo patrón de navegación que el seco, pero con acento
// hielo/cyan en vez de rojo (para diferenciarlo visualmente a simple vista).
const CONGELADOS_TABS: { label: string; href: string }[] = [
  { label: 'Nacional',   href: '/despacho/congelados' },
  { label: 'RM / Costa', href: '/despacho/congelados/santiago' },
];

export function BodegaTabs() {
  const pathname = usePathname();
  // '/despacho/congelados/santiago' es hijo de '/despacho/congelados': mode-aware, no fusiona
  // con el seco (rutas hermanas, sin este problema de anidado).
  const isCongelados = !!pathname && pathname.startsWith('/despacho/congelados');
  const TABS = isCongelados ? CONGELADOS_TABS : SECO_TABS;

  return (
    <div className="mobile-menu-safe flex bg-white border-b-2 border-bg-2 flex-shrink-0 print:hidden">
      {TABS.map((tab, i) => {
        // Congelados: match exacto (evita que '/despacho/congelados/santiago' active también
        // el tab 'Nacional' por ser prefijo). Seco: comportamiento original sin cambios.
        const active = isCongelados
          ? pathname === tab.href
          : !!pathname && (pathname === tab.href || pathname.startsWith(tab.href + '/'));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 text-center py-3 px-2 font-barlow-condensed text-[14px] font-bold tracking-wide no-underline transition-all border-b-[3px] -mb-0.5 ${
              i > 0 ? 'border-l border-bg-2' : ''
            } ${active
                ? (isCongelados
                    ? 'text-[#0891B2] border-b-[#0891B2] bg-[rgba(8,145,178,0.04)]'
                    : 'text-red border-b-red bg-[rgba(211,47,47,0.04)]')
                : 'text-text-3 border-b-transparent hover:text-text-2 hover:bg-bg/50'
              }`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
