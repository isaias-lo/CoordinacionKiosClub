'use client';
import { useEffect } from 'react';
import { Check, AlertTriangle, ArrowLeft } from 'lucide-react';
import { fechaTxt } from '../utils/helpers';
import { textoPreflight, type Preflight, type TipoHallazgo } from '../utils/preflightCierre';

interface Props {
  isOpen: boolean;
  preflight: Preflight | null;
  supervisor: string;
  /** Volver al tablero a arreglar lo que se encontró. No escribe nada. */
  onRevisar: () => void;
  /** Registrar igual. El coordinador sabe cosas que el sistema no. */
  onConfirmar: () => void;
}

// Que nadie lleve una tienda, o que un camión haya salido sin papeles, no es lo mismo que
// que salga sin dimensiones: lo primero se arregla hoy, lo segundo se completa después.
const GRAVE: TipoHallazgo[] = ['sin-camion', 'cerrado-sin-manifiesto'];

export default function PreflightCierrePanel({ isOpen, preflight, supervisor, onRevisar, onConfirmar }: Props) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Escape = revisar. Cerrar con Escape nunca debe registrar: es la acción irreversible.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRevisar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onRevisar]);

  if (!isOpen || !preflight) return null;

  const { fecha, hallazgos, hayHallazgos } = preflight;

  return (
    <div className="fixed inset-0 z-[320] flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-knavy text-white flex-shrink-0">
        <div>
          <div className="font-barlow-condensed text-[20px] font-bold tracking-widest uppercase">Antes de registrar</div>
          <div className="text-white/50 text-[11px] mt-0.5">
            {fechaTxt(fecha)} · {supervisor || 'Supervisor'}
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto bg-kbg px-4 py-5">
        <div className="max-w-[560px] mx-auto">

          <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">Esto se va a registrar</div>
          <div className="bg-white rounded-kios shadow-kios px-4 py-4 text-center mb-4">
            <div className="text-[22px] font-extrabold text-knavy leading-none tracking-tight">
              {textoPreflight(preflight)}
            </div>
            <div className="text-[11px] text-kmuted mt-1.5">
              Se emiten los manifiestos, se generan los QR y se escribe el registro del día.
            </div>
          </div>

          {hayHallazgos ? (
            <>
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">
                {hallazgos.length === 1 ? 'Una cosa que mirar' : `${hallazgos.length} cosas que mirar`}
              </div>
              {hallazgos.map(h => {
                const grave = GRAVE.includes(h.tipo);
                return (
                  <div
                    key={h.tipo}
                    className={`bg-white rounded-kios shadow-kios px-4 py-3.5 mb-2.5 border-2 ${grave ? 'border-kred/25' : 'border-amber-400/40'}`}
                  >
                    <div className={`text-[13px] font-bold mb-1 inline-flex items-center gap-1.5 ${grave ? 'text-kred' : 'text-amber-700'}`}>
                      <AlertTriangle size={15} aria-hidden="true" /> {h.titulo}
                    </div>
                    <div className="text-[12px] text-kmuted leading-relaxed mb-2.5">{h.consecuencia}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {h.items.map(it => (
                        <span
                          key={it}
                          className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[6px] border ${
                            grave
                              ? 'bg-kred/[0.08] text-kred border-kred/20'
                              : 'bg-amber-50 text-amber-700 border-amber-300'
                          }`}
                        >
                          {it}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="bg-white rounded-kios shadow-kios px-4 py-4 text-center mb-3 border border-[#34C759]/30">
              <div className="text-[13px] font-bold text-[#34C759] inline-flex items-center gap-1">
                <Check size={15} aria-hidden="true" /> Todo calza
              </div>
              <div className="text-[12px] text-kmuted mt-0.5">
                Cada tienda con carga va en un camión, y cada camión cerrado dejó su manifiesto.
              </div>
            </div>
          )}

          {/* Acciones. «Revisar» primero y en el lugar cómodo: si algo se encontró, lo esperable
              es volver, no seguir. Registrar igual sigue siendo un clic, no un laberinto. */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onRevisar}
              className="flex-1 h-[50px] rounded-kios2 border-2 border-knavy text-knavy bg-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Revisar
            </button>
            <button
              onClick={onConfirmar}
              className={`flex-1 h-[50px] rounded-kios2 text-white text-[14px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform ${
                hayHallazgos ? 'bg-amber-600' : 'bg-knavy'
              }`}
            >
              <Check size={16} aria-hidden="true" /> {hayHallazgos ? 'Registrar de todos modos' : 'Confirmar y registrar'}
            </button>
          </div>
          <div className="text-[10px] text-kmuted text-center mt-1.5">
            {hayHallazgos
              ? 'Registrar de todos modos es válido: puede que ya lo tengas resuelto fuera del sistema.'
              : 'Esto marca el cierre del día.'}
          </div>
        </div>
      </div>
    </div>
  );
}
