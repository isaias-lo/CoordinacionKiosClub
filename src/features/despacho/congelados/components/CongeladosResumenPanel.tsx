'use client';

import { Loader2 } from 'lucide-react';
import { fechaLargaCL, conMayusculaInicial } from '@/lib/fechaTexto';
import { diaDespachoCongelados } from '../utils/diaDespachoCongelados';
import { textoRegistrarTodo, cajasPendientes, type ResumenCongelados } from '../utils/resumenCongelados';

function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wide text-text-3">{etiqueta}</span>
      <span className="font-barlow-condensed text-[20px] font-bold tabular-nums" style={{ color: tono ?? 'var(--color-text)' }}>
        {valor}
      </span>
    </div>
  );
}

/**
 * Columna derecha: el resumen del día y el botón que registra todo lo que falta.
 *
 * Dos cosas que antes no estaban en ninguna pantalla:
 *
 * 1. **Armado vs salida.** El calendario de congelados marca el día de ARMADO, pero la ruta, el
 *    manifiesto y el Enrutador razonan sobre el día de SALIDA — y no son el mismo día. El panel
 *    los muestra juntos para que no haya que hacer la cuenta de cabeza (ver diaDespachoCongelados).
 *
 * 2. **Registrar todo.** Las bodegas de seco tienen un botón que manda el día entero; acá había
 *    que abrir tienda por tienda. Registrar es lo que manda la carga al despacho: si no se hace,
 *    las cajas existen en Picking y para nadie más.
 */
export function CongeladosResumenPanel({
  resumen, cajasPorTienda, fechaArmado, saving, onRegistrarTodo,
}: {
  resumen: ResumenCongelados;
  cajasPorTienda: Record<string, { total: number } | undefined>;
  fechaArmado: string;
  saving: boolean;
  onRegistrarTodo: () => void;
}) {
  const salida    = diaDespachoCongelados(fechaArmado);
  const pendCajas = cajasPendientes(resumen, cajasPorTienda);
  const textoBoton = textoRegistrarTodo(resumen);

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-l" style={{ borderColor: 'var(--color-border)' }}>
      <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)', background: 'rgba(8,145,178,0.05)' }}>
        <h2 className="font-barlow-condensed text-[16px] font-bold tracking-wide text-navy">Resumen del día</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-3">Armado</div>
            <div className="text-[13px] font-semibold text-text-2">{conMayusculaInicial(fechaLargaCL(`${fechaArmado}T12:00:00`))}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-3">Sale</div>
            <div className="text-[13px] font-semibold" style={{ color: '#0891B2' }}>
              {conMayusculaInicial(fechaLargaCL(`${salida}T12:00:00`))}
            </div>
          </div>
          <p className="text-[11px] text-text-3 leading-snug mt-0.5">
            Congelados va con flota interna: sale el día hábil siguiente al armado.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <Dato etiqueta="Cajas" valor={String(resumen.totalCajas)} />
          <Dato etiqueta="Tiendas con carga" valor={String(resumen.conCarga.length)} />
          <Dato etiqueta="Sin carga" valor={String(resumen.sinCarga.length)} />
          <Dato
            etiqueta="Sin registrar"
            valor={String(resumen.pendientes)}
            tono={resumen.pendientes > 0 ? '#B45309' : '#15803D'}
          />
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        {textoBoton ? (
          <>
            <button
              type="button"
              onClick={onRegistrarTodo}
              disabled={saving}
              className="w-full py-3.5 rounded-btn font-barlow-condensed text-[16px] font-bold text-white cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: '#0891B2' }}
            >
              {saving ? <><Loader2 size={18} className="animate-spin" /> Registrando…</> : textoBoton}
            </button>
            <p className="text-[11px] text-text-3 text-center mt-2 leading-snug">
              Manda {pendCajas} {pendCajas === 1 ? 'caja' : 'cajas'} al despacho y al Enrutador.
            </p>
          </>
        ) : resumen.conCarga.length > 0 ? (
          <div className="text-center py-2 rounded-btn font-barlow-condensed text-[15px] font-bold"
            style={{ background: 'rgba(22,163,74,0.10)', color: '#15803D' }}>
            ✓ Todo registrado
          </div>
        ) : (
          <p className="text-[12px] text-text-3 text-center">Sin cajas que registrar.</p>
        )}
      </div>
    </div>
  );
}
