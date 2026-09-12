'use client';

import { Minus, Plus, Loader2 } from 'lucide-react';
import { formatCod } from '../../rutas/utils/helpers';
import { textoRegistrar } from '../utils/textoRegistrar';

/* ── Stepper +/− para las cantidades de caja ── */
export function StepperRow({ label, value, onChange, disabled }: {
  label: string; value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px] font-semibold text-text-2">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Restar ${label}`}
          className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(8,145,178,0.35)', color: '#0891B2' }}
        >
          <Minus size={16} />
        </button>
        <span className="w-6 text-center font-barlow-condensed text-[19px] font-bold text-navy">{value}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          aria-label={`Sumar ${label}`}
          className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(8,145,178,0.35)', color: '#0891B2' }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * El cuerpo del detalle de una tienda: las dos cuentas de caja y el botón de registrar.
 *
 * Vive aparte porque ahora se muestra en DOS lugares con el mismo contenido: la columna del
 * medio en escritorio (como en Bodega) y el modal de siempre en celular, donde no hay ancho
 * para tres columnas. Duplicarlo sería garantizar que se desincronicen.
 */
export function CongeladosDetalle({
  cod, nombre, cc, cn, saving, registrada, onChangeCC, onChangeCN, onRegistrar,
}: {
  cod: string; nombre: string; cc: number; cn: number;
  saving: boolean; registrada: boolean;
  onChangeCC: (v: number) => void; onChangeCN: (v: number) => void; onRegistrar: () => void;
}) {
  return (
    <>
      <div className="space-y-4">
        <StepperRow label="Caja Cartón (CC)" value={cc} onChange={onChangeCC} disabled={saving} />
        <StepperRow label="Caja Negra (CN)"  value={cn} onChange={onChangeCN} disabled={saving} />
        <p className="text-[11px] text-text-3 text-center">desde Picking · sin pesar/medir</p>
      </div>

      <button
        type="button"
        onClick={onRegistrar}
        disabled={saving || (cc === 0 && cn === 0)}
        className="w-full mt-4 py-3.5 rounded-btn font-barlow-condensed text-[17px] font-bold text-white cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: '#0891B2' }}
      >
        {saving
          ? <><Loader2 size={18} className="animate-spin" /> Registrando…</>
          : registrada ? `Volver a registrar ${formatCod(cod)}` : textoRegistrar(cc, cn, cod)}
      </button>

      {registrada && (
        <p className="text-[11px] text-text-3 text-center mt-2">
          {nombre} ya está registrada. Volver a registrar actualiza las cantidades.
        </p>
      )}
    </>
  );
}
