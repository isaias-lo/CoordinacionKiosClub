'use client';

// «Peso del pallet»: el tercer casillero de la tarjeta de un pallet, a la derecha de Peso y Alto.
//
// Opcional pero distinto a la vista: borde punteado y fondo del color de pallet, para que se lea
// como "esto se resta" y no como un campo más que hay que llenar. Va SIN `data-campo` a propósito:
// así Enter en Alto sigue guardando directo (ver `siguienteCampo`) y la pistola no lo cuenta.

import { useId } from 'react';
import { avisoNetoPallet } from './pesoDelPallet';
import { limpiarTecleo } from './pesoIngresado';

export function CampoPesoPallet({ peso, valor, onChange, onFocus, onBlur, claseCampo }: {
  /** Lo escrito en Peso, para decir cuánto queda. */
  peso: string;
  valor: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** La clase de los otros campos grandes de la tarjeta, para que midan igual. */
  claseCampo: string;
}) {
  const id = useId();
  const aviso = avisoNetoPallet(peso, valor);
  const malo = aviso?.startsWith('⚠');
  return (
    <div>
      <label htmlFor={id} className="text-rotulo font-bold text-uni-pallet uppercase block mb-1 whitespace-nowrap">
        Peso del pallet
      </label>
      <input id={id} type="text" value={valor} onChange={e => onChange(limpiarTecleo(e.target.value))}
        onFocus={onFocus} onBlur={onBlur} placeholder="kg · opc." inputMode="decimal"
        aria-label="Peso del pallet en kilos, opcional: se resta del peso"
        className={`${claseCampo} !border-dashed !border-uni-pallet !bg-uni-pallet-suave placeholder:text-uni-pallet placeholder:text-apoyo placeholder:font-semibold`} />
      {aviso && (
        <div className={`text-rotulo font-bold mt-0.5 ${malo ? 'text-est-error' : 'text-uni-pallet'}`}>{aviso}</div>
      )}
    </div>
  );
}
