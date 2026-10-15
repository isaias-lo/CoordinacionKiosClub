'use client';

// La banda de «estás trabajando otro día», arriba del todo y siempre visible.
//
// No es un aviso que se cierra: mientras la pantalla no esté en hoy, esto se ve. Quien pesa un
// pallet tiene que poder levantar la vista y saber a qué día le está escribiendo, sin acordarse
// de nada y sin mirar la URL.
//
// Dice además dónde quedan los camiones, porque es la pregunta que sigue: el tablero del
// Enrutador es el de HOY, así que la carga de un día anterior se asigna desde 2ª vuelta.

import { RotateCcw } from 'lucide-react';
import { diaEnPalabras, urlConDia } from './diaDeTrabajo';

export function BandaDiaDeTrabajo({ dia, ruta }: { dia: string; ruta: string }) {
  const volver = () => { window.location.href = urlConDia(ruta, null); };
  return (
    <div className="flex items-center gap-3 px-3 py-2 flex-shrink-0 print:hidden bg-aviso-pantalla text-aviso-pantalla-letra">
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-apoyo font-bold uppercase tracking-wide">
          Estás trabajando el {diaEnPalabras(dia)}
        </span>
        <span className="block text-rotulo opacity-80 normal-case tracking-normal">
          Lo que peses se guarda en ese día. Los camiones salen por 2ª vuelta en el Enrutador.
        </span>
      </span>
      <button type="button" onClick={volver}
        className="text-apoyo font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 flex-shrink-0 bg-aviso-pantalla-letra text-aviso-pantalla">
        <RotateCcw size={14} aria-hidden="true" /> Volver a hoy
      </button>
    </div>
  );
}
