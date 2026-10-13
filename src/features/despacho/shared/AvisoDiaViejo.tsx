'use client';

// El aviso de que esta pantalla de Bodega quedó abierta de un día para otro.
//
// Por qué hace falta verlo y no solo corregir el dato: con la pantalla vieja, la lista de tiendas,
// el calendario y los conteos son los del día en que se abrió. Alguien puede pasar horas
// trabajando sobre el día equivocado sin que nada se lo diga. Ver `diaDeLaSesion.ts`.
//
// No recarga solo: quien está pesando un pallet decide cuándo. Igual que `AvisoVersionNueva`, del
// que copia la forma a propósito — es el mismo gesto y conviene que se vea igual.

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fechaChile } from '@/lib/fechaChile';
import { avisoDeDiaViejo } from './diaDeLaSesion';

/** Cada cuánto se vuelve a mirar el reloj. El día cambia una vez; no hace falta apurarse. */
const CADA_MS = 60_000;

export function AvisoDiaViejo({ diaDeLaSesion }: { diaDeLaSesion: string }) {
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    const revisar = () => setTexto(avisoDeDiaViejo(diaDeLaSesion, fechaChile()));
    revisar();
    const id = setInterval(revisar, CADA_MS);
    // Al volver a la pestaña, que es cuando de verdad se nota: la bodega deja la pantalla abierta
    // toda la noche y vuelve a la mañana siguiente.
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [diaDeLaSesion]);

  if (!texto) return null;

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[1000] print:hidden max-w-[94vw]"
      style={{ bottom: 'calc(1rem + var(--kc-barra-estado, 0px))' }}>
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-card2 bg-aviso-pantalla text-aviso-pantalla-letra"
        style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
        <div className="text-apoyo leading-tight">
          <div className="font-bold">Esta pantalla es de otro día</div>
          <div className="opacity-80">{texto}</div>
        </div>
        <button type="button" onClick={() => window.location.reload()}
          className="text-apoyo font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 flex-shrink-0 bg-aviso-pantalla-letra text-aviso-pantalla">
          <RefreshCw size={13} /> Recargar
        </button>
      </div>
    </div>
  );
}
