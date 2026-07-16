'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { BodegaTabs } from './BodegaTabs';

/**
 * Header unificado del módulo BODEGA: banner navy con el título "BODEGA" + subtítulo
 * (usuario · fecha, como Abastecimiento) y un slot a la derecha (REGISTRAR / contador),
 * y debajo la barra de tabs (Nacional / RM-Costa / Actividad). Lo comparten las 3 pantallas.
 */
export function BodegaHeader({ right }: { right?: ReactNode }) {
  const { profile } = useAuth();
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const subtitle = [profile?.full_name, fecha].filter(Boolean).join(' · ');

  return (
    <>
      <div className="mobile-menu-safe flex items-center px-4 py-2.5 bg-navy gap-2 flex-shrink-0"
           style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="font-barlow-condensed text-[16px] font-extrabold text-white tracking-widest uppercase leading-tight">
            Bodega
          </div>
          {subtitle && (
            <div className="font-barlow-condensed text-[11px] text-white/50 tracking-wide capitalize leading-none mt-0.5 truncate">
              {subtitle}
            </div>
          )}
        </div>
        {right}
      </div>

      <BodegaTabs />
    </>
  );
}
