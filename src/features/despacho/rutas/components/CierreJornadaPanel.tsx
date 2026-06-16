'use client';
import { useEffect } from 'react';
import type { Ruta } from '../utils/routing';
import { fechaTxt } from '../utils/helpers';

interface PendienteV2 { c: string; p: number; b: number; ch: number }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rutas: Ruta[];
  fecha: string;
  supervisor: string;
  pendientesV2: PendienteV2[];
  onCargarPendientes: () => void;
  onListoPorHoy: () => void;
}

interface Resumen { rutas: number; tiendas: number; pallets: number; bultos: number }

function resumenVuelta(rutas: Ruta[], esV2: boolean): Resumen {
  const sel = rutas.filter(r => Boolean(r.v.tlbd) === esV2);
  const tiendas = new Set(sel.flatMap(r => r.ts.map(t => t.c)));
  return {
    rutas:   sel.length,
    tiendas: tiendas.size,
    pallets: sel.reduce((s, r) => s + r.tp, 0),
    bultos:  sel.reduce((s, r) => s + r.tb, 0),
  };
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-white rounded-kios shadow-kios px-3 py-3 text-center">
      <div className="text-[26px] font-extrabold text-kred leading-none tracking-tight">{n}</div>
      <div className="text-[10px] font-semibold text-kmuted uppercase tracking-[0.6px] mt-0.5">{label}</div>
    </div>
  );
}

function BloqueVuelta({ titulo, r, accent }: { titulo: string; r: Resumen; accent: string }) {
  if (r.rutas === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[11px] font-bold uppercase tracking-[1px] mb-1.5" style={{ color: accent }}>{titulo}</div>
      <div className="grid grid-cols-4 gap-2">
        <Stat n={r.rutas}   label="Rutas" />
        <Stat n={r.tiendas} label="Tiendas" />
        <Stat n={r.pallets} label="Pallets" />
        <Stat n={r.bultos}  label="Bultos" />
      </div>
    </div>
  );
}

export default function CierreJornadaPanel({
  isOpen, onClose, rutas, fecha, supervisor, pendientesV2, onCargarPendientes, onListoPorHoy,
}: Props) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const v1 = resumenVuelta(rutas, false);
  const v2 = resumenVuelta(rutas, true);
  const hayPendientes = pendientesV2.length > 0;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-knavy text-white flex-shrink-0"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.4)' }}>
        <div>
          <div className="font-barlow-condensed text-[20px] font-bold tracking-widest uppercase">Cierre de jornada</div>
          <div className="text-white/50 text-[11px] mt-0.5">
            {fechaTxt(fecha)} · {supervisor || 'Supervisor'}
          </div>
        </div>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
          ✕
        </button>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto bg-kbg px-4 py-5">
        <div className="max-w-[560px] mx-auto">

          <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">Resumen despachado</div>
          <BloqueVuelta titulo="1ª Vuelta" r={v1} accent="#1B2A6B" />
          <BloqueVuelta titulo="2ª Vuelta" r={v2} accent="#FF3B30" />
          {v1.rutas === 0 && v2.rutas === 0 && (
            <div className="text-[13px] text-kmuted bg-white rounded-kios shadow-kios px-4 py-5 text-center mb-3">
              Aún no hay rutas registradas para hoy.
            </div>
          )}

          {/* Pendientes */}
          <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mt-4 mb-2">Pendientes</div>
          {hayPendientes ? (
            <div className="bg-white rounded-kios shadow-kios border-2 border-kred/25 px-4 py-3.5 mb-3">
              <div className="text-[13px] font-bold text-kred mb-1">
                {pendientesV2.length} tienda{pendientesV2.length !== 1 ? 's' : ''} sin despachar
              </div>
              <div className="text-[12px] text-kmuted leading-relaxed mb-2.5">
                Quedaron fuera de ruta. Puedes cargarlas para una 2ª vuelta hoy o dejarlas para mañana.
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {pendientesV2.map(s => (
                  <span key={s.c} className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-[6px] bg-kred/[0.08] text-kred border border-kred/20">
                    {s.c} · {s.p}P{s.b + s.ch > 0 ? `+${s.b + s.ch}B` : ''}
                  </span>
                ))}
              </div>
              <button
                onClick={() => { onCargarPendientes(); onClose(); }}
                className="w-full h-[42px] rounded-kios2 border-2 border-kred text-kred bg-kred/[0.06] text-[13px] font-bold hover:bg-kred/[0.12] transition-colors active:scale-[0.99]"
              >
                ⚠ Cargar pendientes para 2ª vuelta
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-kios shadow-kios px-4 py-4 text-center mb-3 border border-[#34C759]/30">
              <div className="text-[13px] font-bold text-[#34C759]">✓ Sin pendientes</div>
              <div className="text-[12px] text-kmuted mt-0.5">Todas las tiendas quedaron asignadas a una ruta.</div>
            </div>
          )}

          {/* Carga extra después de imprimir */}
          <div className="bg-white rounded-kios shadow-kios px-4 py-3 mb-3 border border-black/[0.07]">
            <div className="text-[12px] font-bold text-ktext mb-0.5">¿Llegó carga extra tras imprimir?</div>
            <div className="text-[11px] text-kmuted leading-relaxed">
              Carga la tienda (o usa los pendientes de arriba), marca el vehículo como
              <strong className="text-knavy"> 2ª Vuelta</strong>, recalcula y registra de nuevo:
              las filas ya despachadas en 1ª vuelta se conservan. Luego reimprime solo el manifiesto afectado
              desde <strong className="text-knavy">Generar Manifiestos de Ruta</strong>.
            </div>
          </div>

          {/* Listo por hoy */}
          <button
            onClick={() => { onListoPorHoy(); onClose(); }}
            className="w-full h-[50px] mt-2 rounded-kios2 bg-knavy text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(27,42,107,0.3)] active:scale-[0.99] transition-transform"
          >
            ✓ Listo por hoy
          </button>
          <div className="text-[10px] text-kmuted text-center mt-1.5">
            El despacho ya quedó registrado (historial, control y seguimiento). Esto marca el cierre del día.
          </div>
        </div>
      </div>
    </div>
  );
}
