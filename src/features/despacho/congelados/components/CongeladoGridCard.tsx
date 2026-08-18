import { formatCod } from '../../rutas/utils/helpers';
import { StoreProgressBar } from '../../shared/StoreProgressBar';
import type { StoreStatus } from '../../shared/storeStatus';

// Punto de estado: mismos 3 estados que computeStoreStatus, en tonos hielo/verde (sin rojo —
// acento del módulo CONGELADOS es cyan, a diferencia del seco que usa rojo).
const STATUS_DOT_COLOR: Record<StoreStatus, string> = {
  none:     '#9CA3AF',           // gris — nada realizado todavía
  partial:  '#F08A00',           // ámbar — en progreso
  complete: 'var(--status-done)', // verde — todo realizado
};

interface Props {
  cod: string;
  nombre: string;
  cajas: number;
  congTotal: number;
  congDone: number;
  status: StoreStatus;
}

/**
 * Card de la grilla de CONGELADOS: código + nombre + ❄ N cajas + barra de progreso Odoo
 * (congTotal/congDone) + punto de estado. Read-only — sin click/detalle todavía (llega en el
 * PR siguiente junto con el registro CC/CN).
 */
export function CongeladoGridCard({ cod, nombre, cajas, congTotal, congDone, status }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-between px-2 py-3 rounded-xl select-none min-h-[92px] relative
        bg-[rgba(8,145,178,0.04)] border border-[rgba(8,145,178,0.20)]">
      <span
        className="absolute top-2 right-2 w-2 h-2 rounded-full"
        style={{ background: STATUS_DOT_COLOR[status] }}
        title={`Estado: ${status}`}
        aria-hidden="true"
      />
      <div className="font-barlow-condensed text-[15px] font-extrabold leading-none tracking-wide text-center text-[#0891B2]">
        {formatCod(cod)}
      </div>
      <div className="text-[10px] font-semibold text-text-2 w-full text-center leading-tight truncate px-0.5 mt-1 uppercase tracking-wide">
        {nombre}
      </div>
      <div className="flex items-center gap-1 mt-1.5 text-[12px] font-bold text-[#0891B2]">
        <span aria-hidden="true">❄</span>
        <span>{cajas} caja{cajas === 1 ? '' : 's'}</span>
      </div>
      <StoreProgressBar total={congTotal} done={congDone} variant="grid" showCount />
    </div>
  );
}
