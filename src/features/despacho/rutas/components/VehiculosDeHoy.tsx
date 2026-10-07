'use client';

// [Vista nueva · Flota] La columna «Vehículos de hoy» junto a «Quién maneja»: encender o apagar
// un vehículo sin ir a la sección Vehículos. Cada interruptor llama al mismo `onToggle` que la
// tarjeta de FlotaGrid; acá solo se dibuja distinto.

import type { Vehiculo } from '../data/flota';
import { agruparCamionesPorEmpresa } from '../utils/empresaFlota';
import { etiquetaTipoVehiculo } from '../utils/tipoVehiculo';

export default function VehiculosDeHoy({ flota, onToggle }: { flota: Vehiculo[]; onToggle: (idx: number) => void }) {
  const grupos = agruparCamionesPorEmpresa(flota.map((v, i) => ({ v, i })), x => x.v.empresa);
  const encendidos = flota.filter(v => v.on).length;
  return (
    <aside className="bg-white border border-black/[0.09] rounded-[16px] overflow-hidden">
      <div className="px-4 pt-3.5 pb-3 border-b border-black/[0.07] flex items-baseline gap-2 flex-wrap">
        <span className="text-cuerpo font-bold text-ktext">Vehículos de hoy</span>
        <span className="text-apoyo text-kmuted">{encendidos} de {flota.length} encendidos</span>
      </div>
      <div className="p-2.5 flex flex-col gap-3">
        {grupos.map(g => (
          <div key={g.empresa} className="flex flex-col gap-1">
            <span className="px-1.5 text-rotulo font-bold uppercase" style={{ color: g.color }}>{g.empresa}</span>
            {g.items.map(({ v, i }) => {
              const tipo = etiquetaTipoVehiculo(v.t);
              const detalle = [tipo.texto, `${v.c} P`, v.porton ? 'portón' : '', v.refrigerado ? 'frío' : '', v.tlbd ? '2ª vuelta' : '']
                .filter(Boolean).join(' · ');
              return (
                <div key={v.p} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 min-h-[44px] hover:bg-kbg">
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className={`font-mono font-bold text-apoyo ${v.on ? 'text-ktext' : 'text-kmuted'}`}>{v.p}</span>
                    <span className="text-rotulo tracking-normal text-kmuted truncate">{detalle}</span>
                  </span>
                  <button type="button" role="switch" aria-checked={v.on} aria-label={`${v.on ? 'Apagar' : 'Encender'} ${v.p}`}
                    onClick={() => onToggle(i)}
                    className={`w-[42px] h-6 rounded-full p-[3px] flex flex-shrink-0 transition-colors ${v.on ? 'bg-knavy justify-end' : 'bg-black/[0.18] justify-start'}`}>
                    <span className="w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
