'use client';

// El botón REGISTRAR de UNA tienda, al lado de MARCAR TERMINADA. Solo dibuja: las reglas viven en
// `registroPorTienda.ts`, con sus tests.
//
// Para quien no es admin el botón NO SE DIBUJA. No se muestra una puerta cerrada — misma decisión
// que con las pestañas de Bodega en el #577.

import { useState } from 'react';
import { puedeRegistrarTienda, rotuloBoton } from './registroPorTienda';

interface Props {
  rol?: string | null;
  terminada: boolean;
  unidades: number;
  /** La hora en que ya se registró, o `null`. */
  yaRegistrada?: string | null;
  /** Hace la escritura. Devuelve `true` si salió bien. */
  onRegistrar: () => Promise<boolean>;
  /** `navy` sobre el encabezado oscuro; `claro` en el menú ⋯ de la tienda abierta. */
  variante?: 'navy' | 'claro';
}

export function RegistrarTiendaButton({ rol, terminada, unidades, yaRegistrada, onRegistrar, variante = 'navy' }: Props) {
  const [enviando, setEnviando] = useState(false);
  const estado = puedeRegistrarTienda({ rol, terminada, unidades, yaRegistrada });

  if (!estado.visible) return null;

  const hecho = !!yaRegistrada;
  const apagado = !estado.puede || enviando;

  return (
    <button
      type="button"
      disabled={apagado}
      // El motivo se MUESTRA. Un botón apagado sin explicación hace que la gente lo apriete tres
      // veces y después pregunte.
      title={estado.motivo ?? (hecho
        ? 'Ya se registró. Volver a apretarlo actualiza los pesos, no duplica.'
        : 'Registra SOLO esta tienda, sin cerrar el día.')}
      onClick={async e => {
        e.stopPropagation();
        if (apagado) return;
        setEnviando(true);
        try { await onRegistrar(); } finally { setEnviando(false); }
      }}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      className={variante === 'claro'
        ? `w-full min-h-[44px] px-3 rounded-btn border font-barlow-condensed text-cuerpo font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
            apagado ? 'bg-bg-2 text-text-3 border-border cursor-not-allowed'
              : hecho ? 'bg-card text-text-2 border-border cursor-pointer active:scale-[0.98]'
                : 'bg-navy text-white border-navy cursor-pointer active:scale-[0.98]'}`
        : `h-[38px] px-4 rounded-full border-none font-barlow-condensed text-[15px] font-bold tracking-wide whitespace-nowrap transition-all flex items-center gap-1.5 ${
        apagado
          ? 'bg-white/10 text-white/35 cursor-not-allowed'
          : hecho
            ? 'bg-white/15 text-white/80 cursor-pointer active:scale-95'
            : 'bg-white text-navy cursor-pointer active:scale-95'
      }`}
    >
      {enviando ? 'Registrando…' : rotuloBoton(yaRegistrada)}
    </button>
  );
}
