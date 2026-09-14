'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { badgeZona, CONTEO_VACIO, type ConteoCongelados } from '../congelados/utils/conteoPorZona';
import type { ZonaCongelados } from '../congelados/utils/congeladosGrid';

/**
 * Barra de tabs del módulo BODEGA (barra blanca bajo el banner). Navega entre las rutas
 * existentes (no fusiona las pantallas). Cada tab bien separado (divisor + subrayado activo).
 */
interface Tab { label: string; href: string; zona?: ZonaCongelados }

const SECO_TABS: Tab[] = [
  { label: 'Nacional',   href: '/despacho/regiones' },
  { label: 'RM / Costa', href: '/despacho/santiago' },
  { label: 'Actividad',  href: '/despacho/actividad' },
];

// Tabs del módulo CONGELADOS — mismo patrón de navegación que el seco, pero con acento
// hielo/cyan en vez de rojo (para diferenciarlo visualmente a simple vista).
const CONGELADOS_TABS: Tab[] = [
  { label: 'Nacional',   href: '/despacho/congelados',          zona: 'nacional' },
  { label: 'RM / Costa', href: '/despacho/congelados/santiago', zona: 'rmcosta'  },
];

const TONO_BADGE: Record<string, string> = {
  pendiente: 'bg-[rgba(217,119,6,0.14)] text-[#B45309]',
  listo:     'bg-[rgba(22,163,74,0.14)] text-[#15803D]',
};

export function BodegaTabs() {
  const pathname = usePathname();
  // '/despacho/congelados/santiago' es hijo de '/despacho/congelados': mode-aware, no fusiona
  // con el seco (rutas hermanas, sin este problema de anidado).
  const isCongelados = !!pathname && pathname.startsWith('/despacho/congelados');
  const TABS = isCongelados ? CONGELADOS_TABS : SECO_TABS;

  // El conteo lo publica CongeladosPage, que ya tiene los datos de LAS DOS zonas (los slots de
  // picking no vienen filtrados por zona y el calendario llega entero). Mismo patrón que
  // `enrutador-status`: así los tabs no necesitan su propio fetch ni saber qué día está abierto.
  const [conteo, setConteo] = useState<ConteoCongelados>(CONTEO_VACIO);
  useEffect(() => {
    if (!isCongelados) return;
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { conteo?: ConteoCongelados } | undefined;
      if (d?.conteo) setConteo(d.conteo);
    };
    window.addEventListener('congelados-conteo', h);
    return () => window.removeEventListener('congelados-conteo', h);
  }, [isCongelados]);

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
                    // [Un solo significado por color] El rojo queda reservado para
                    // eliminar/peligro (ver design_system.md) — la tab activa usa navy, el
                    // acento de marca real (`knavy`/`#1B2A6B`), no rojo.
                    : 'text-navy border-b-navy bg-[rgba(27,42,107,0.04)]')
                : 'text-text-3 border-b-transparent hover:text-text-2 hover:bg-bg/50'
              }`}>
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {isCongelados && (() => {
                if (!tab.zona) return null;
                const b = badgeZona(conteo[tab.zona]);
                if (!b.texto) return null;
                return (
                  <span title={b.detalle} aria-label={b.detalle}
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold ${TONO_BADGE[b.tono] ?? ''}`}>
                    {b.texto}
                  </span>
                );
              })()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
