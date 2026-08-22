'use client';
import { FASES, type FaseInfo } from '../utils/faseEnrutador';

/** [E4·4c] Indicador de fase del Enrutador: Pool → Asignado → Revisar → Registrar → Cierre.
 *  Muestra siempre en qué etapa del día está el despacho (mata "el limbo" de Calcular/Terminar). */
export function FaseEnrutador({ fase }: { fase: FaseInfo }) {
  return (
    <div className="rounded-[12px] border border-black/[0.08] bg-white px-3 py-2.5 mb-2.5" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.05)' }}>
      <div className="flex items-center gap-1 flex-wrap">
        {FASES.map((f, i) => {
          const n = i + 1;
          const active = n === fase.step;
          const done = n < fase.step;
          return (
            <div key={f} className="flex items-center gap-1">
              <span
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-extrabold transition-all"
                style={{
                  background: active ? '#1B2A6B' : done ? 'rgba(27,42,107,0.15)' : '#EEF1F6',
                  color: active ? '#fff' : done ? '#1B2A6B' : '#94A3B8',
                }}>
                {done ? '✓' : n}
              </span>
              <span className="text-[11px] font-bold tracking-tight" style={{ color: active ? '#1B2A6B' : done ? '#64748B' : '#B4BCCB' }}>
                {f}
              </span>
              {i < FASES.length - 1 && <span className="w-3 h-px mx-0.5" style={{ background: done ? 'rgba(27,42,107,0.30)' : '#E2E8F0' }} />}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 text-[12.5px]">
        <span className="font-bold text-ktext">{fase.titulo}</span>
        <span className="text-kmuted"> · {fase.detalle}</span>
      </div>
    </div>
  );
}
