'use client';

import { Check } from 'lucide-react';
import { formatCod } from '../../rutas/utils/helpers';
import { textoSinCarga, type ResumenCongelados } from '../utils/resumenCongelados';

/**
 * Columna izquierda: las tiendas del calendario del día elegido.
 *
 * Es el equivalente de la lista de tiendas de Bodega. Antes esto era una grilla de tarjetas que
 * ocupaba toda la pantalla, con las tiendas en cero mezcladas entre las que sí tenían carga.
 * Acá el orden lo decide `resumenCongelados`: primero lo que falta registrar.
 *
 * Las tiendas en cero NO se esconden — siguen siendo parte del día y a veces la pregunta es
 * justamente "¿y esta por qué no tiene nada?" — pero van plegadas para no competir por la vista.
 */
export function CongeladosListaTiendas({
  resumen, cajasPorTienda, registradas, seleccionada, nombreDeTienda,
  verSinCarga, onToggleSinCarga, onSelect,
}: {
  resumen: ResumenCongelados;
  cajasPorTienda: Record<string, { total: number } | undefined>;
  registradas: ReadonlySet<string>;
  seleccionada: string | null;
  nombreDeTienda: (cod: string) => string;
  verSinCarga: boolean;
  onToggleSinCarga: () => void;
  onSelect: (cod: string) => void;
}) {
  const fila = (cod: string) => {
    const cajas   = cajasPorTienda[cod]?.total ?? 0;
    const lista   = registradas.has(cod);
    const activa  = seleccionada === cod;
    const sinCarga = cajas === 0;

    return (
      <button
        key={cod}
        type="button"
        onClick={() => onSelect(cod)}
        aria-current={activa ? 'true' : undefined}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-colors border-l-[3px]"
        style={{
          borderLeftColor: activa ? '#0891B2' : 'transparent',
          background: activa ? 'rgba(8,145,178,0.09)' : 'transparent',
          opacity: sinCarga ? 0.6 : 1,
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="font-barlow-condensed text-[11px] font-extrabold tracking-wide" style={{ color: '#0891B2' }}>
            {formatCod(cod)}
          </div>
          <div className="text-[13px] font-semibold text-text-2 truncate" title={nombreDeTienda(cod)}>
            {nombreDeTienda(cod)}
          </div>
        </div>

        {cajas > 0 && (
          <span className="font-barlow-condensed text-[15px] font-bold text-navy flex-shrink-0 tabular-nums">
            {cajas}
          </span>
        )}

        {/* El check no es decoración: registrar es lo que manda la carga al Enrutador. */}
        {lista
          ? <Check size={16} strokeWidth={3} className="flex-shrink-0" style={{ color: '#15803D' }} aria-label="Registrada" />
          : cajas > 0
            ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#D97706' }} aria-label="Sin registrar" />
            : <span className="w-2 h-2 flex-shrink-0" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {resumen.conCarga.map(fila)}

      {resumen.sinCarga.length > 0 && (
        <div className="mt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={onToggleSinCarga}
            aria-expanded={verSinCarga}
            className="w-full text-left px-3 py-2 text-[12px] font-semibold text-text-3 hover:text-text-2 cursor-pointer"
          >
            {verSinCarga ? '▾' : '▸'} {textoSinCarga(resumen)}
          </button>
          {verSinCarga && resumen.sinCarga.map(fila)}
        </div>
      )}
    </div>
  );
}
