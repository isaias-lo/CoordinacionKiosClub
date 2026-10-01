'use client';

// El botón «Traer Odoo del día». Solo dibuja: la escritura vive en `avisarCruce.ts`.
//
// ── QUÉ RESUELVE ───────────────────────────────────────────────────────────────────────────────
//
// La hoja CRUCE PESOS se escribía SOLO al apretar REGISTRAR, que es al final de la jornada. Pero
// el lado de Odoo —qué despachó abastecimiento a cada tienda, con sus referencias— no depende de
// Bodega: existe desde temprano.
//
// El coordinador lo preguntó así: «ya es la tarde y no veo nada, al menos la parte del total de
// Odoo, la tienda y demás, ¿o debo dar clic en registrar para que esto pase?». Debía, y esa es la
// respuesta que este botón cambia.
//
// Con las filas puestas temprano, el cuadro de control sirve DURANTE el día: se ve qué tienda ya
// cuadra y cuál va corta mientras todavía se puede hacer algo. Después, al registrar, las mismas
// filas se completan con el peso de Bodega — no se duplican, porque la hoja busca cada fila por
// (FECHA, CÓDIGO) y la actualiza en su lugar.
//
// ── POR QUÉ UN BOTÓN Y NO AUTOMÁTICO ───────────────────────────────────────────────────────────
//
// Esta hoja la mira Jefatura. Escribir en ella tiene que ser una decisión de alguien, no un efecto
// secundario de abrir una pantalla. Un botón explícito también deja claro CUÁNDO se trajo el dato,
// que es justo lo que se pierde cuando algo se escribe solo.
//
// Solo admin, igual que el bloque de cruce de la tarjeta (`veElCruce`): compara el andén contra
// Odoo y no es información de operación.

import { useState } from 'react';
import { traerOdooDelDia, resumenDeCruce } from './avisarCruce';
import { veElCruce } from './cruceTienda';

interface Props {
  /** El rol de quien mira. Solo `admin` ve el botón. */
  rol?: string | null;
  /** El día a traer, `YYYY-MM-DD`. */
  fechaISO: string;
  /** Para avisar el resultado. */
  showToast: (msg: string, color?: string) => void;
  className?: string;
}

export function TraerOdooButton({ rol, fechaISO, showToast, className }: Props) {
  const [cargando, setCargando] = useState(false);
  if (!veElCruce(rol)) return null;

  return (
    <button
      type="button"
      disabled={cargando}
      title="Escribe en CRUCE PESOS las tiendas del día con lo que Odoo despachó, sin esperar al registro. Volver a apretarlo actualiza, no duplica."
      onClick={async () => {
        if (cargando) return;
        setCargando(true);
        try {
          const r = await traerOdooDelDia(fechaISO);
          // El fallo manda: si no se escribió, no se dice cuántas filas se tocaron.
          showToast(r.aviso ?? resumenDeCruce(r), r.aviso ? '#D97706' : '#16A34A');
        } finally {
          setCargando(false);
        }
      }}
      className={`h-[34px] px-3 rounded-full border border-white/25 bg-white/10 text-white font-barlow-condensed text-[13px] font-bold tracking-wide whitespace-nowrap transition-all flex items-center gap-1.5 ${
        cargando ? 'opacity-60 cursor-wait' : 'cursor-pointer active:scale-95 hover:bg-white/20'
      } ${className ?? ''}`}
    >
      {cargando ? 'Trayendo…' : 'Traer Odoo del día'}
    </button>
  );
}
