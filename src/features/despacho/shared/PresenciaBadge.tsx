'use client';

import type { ViendoInfo } from './usePresenciaTienda';

function iniciales(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Avatar(es) con punto verde — quién más tiene esta tienda (o, con `contexto="tarjeta"`, este
 * PALLET puntual) abierto AHORA. Mismo componente en la tarjeta de la grilla (Santiago y
 * Regiones), en el header de detalle, y en cada tarjeta de peso/medidas. Sin esto, dos personas
 * podían editar lo mismo a la vez sin ninguna señal de que la otra estaba ahí.
 */
export function PresenciaBadge({ viendo, contexto = 'tienda' }: { viendo?: ViendoInfo[]; contexto?: 'tienda' | 'tarjeta' }) {
  if (!viendo?.length) return null;
  const extra = viendo.length - 1;
  const nombres = viendo.map(v => v.name).join(', ');
  const verbo = viendo.length > 1 ? 'están viendo' : 'está viendo';
  const donde = contexto === 'tarjeta' ? 'esta tarjeta' : 'esta tienda';
  return (
    <div
      className="absolute -top-1.5 -left-1.5 flex items-center z-10"
      title={`${nombres} ${verbo} ${donde} ahora`}
    >
      <div className="relative w-[18px] h-[18px] rounded-full bg-[#1E40AF] text-white text-[9px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
        {iniciales(viendo[0].name)}
        <span className="absolute -bottom-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-[#16A34A] border border-white" />
      </div>
      {extra > 0 && (
        <span className="ml-0.5 text-[9px] font-bold text-white bg-[#1E40AF] rounded-full w-[16px] h-[16px] flex items-center justify-center border-2 border-white">
          +{extra}
        </span>
      )}
    </div>
  );
}
