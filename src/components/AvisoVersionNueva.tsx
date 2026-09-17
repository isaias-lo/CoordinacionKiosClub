'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { hayVersionNueva, debeMostrarAviso, VERSION_DESCONOCIDA, POSPONER_MS } from '@/lib/versionApp';

/** Cada cuánto se le pregunta al servidor qué versión está publicada. */
const CADA_MS = 5 * 60_000;

/**
 * Aviso "hay una versión nueva" con botón para recargar.
 *
 * No recarga solo ni bloquea nada: quien está cargando una tienda decide cuándo. Además del ciclo
 * cada 5 minutos, revisa al volver a la pestaña — el caso típico es el equipo de Bodega que la deja
 * abierta todo el día, y en el celular se dispara al desbloquear la pantalla.
 *
 * La X POSPONE media hora; no silencia. Cerrarlo para toda la sesión daba igual con un cambio de
 * color, pero con el arreglo que evita que se borren los pallets entre compañeros significaba
 * quedarse con el código viejo el resto del día —perdiendo trabajo— sin volver a enterarse.
 */
export function AvisoVersionNueva() {
  const local = process.env.NEXT_PUBLIC_APP_VERSION;
  const [hayNueva, setHayNueva] = useState(false);
  const [pospuestoHasta, setPospuestoHasta] = useState(0);
  // Solo existe para volver a dibujar cuando vence el aplazamiento.
  const [tic, setTic] = useState(0);
  // Una vez detectada, no se vuelve a preguntar: la respuesta ya no puede cambiar sin recargar.
  const yaDetectada = useRef(false);

  useEffect(() => {
    if (!local || local === VERSION_DESCONOCIDA) return; // en desarrollo no hay con qué comparar
    let vivo = true;

    const revisar = async () => {
      if (yaDetectada.current || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok || !vivo) return;
        const { version } = await res.json() as { version?: string };
        if (!vivo || !hayVersionNueva(local, version)) return;
        yaDetectada.current = true;
        setHayNueva(true);
      } catch {
        // Sin red o servidor caído: se reintenta en el próximo ciclo, sin molestar a nadie.
      }
    };

    const alVolver = () => { if (document.visibilityState === 'visible') void revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    const id = setInterval(() => { void revisar(); }, CADA_MS);
    void revisar();
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [local]);

  // Mientras está pospuesto, un temporizador lo trae de vuelta al vencer.
  useEffect(() => {
    if (!hayNueva || pospuestoHasta <= Date.now()) return;
    const id = setTimeout(() => setTic(t => t + 1), pospuestoHasta - Date.now() + 100);
    return () => clearTimeout(id);
  }, [hayNueva, pospuestoHasta]);

  const recargar = useCallback(() => { window.location.reload(); }, []);
  const posponer = useCallback(() => { setPospuestoHasta(Date.now() + POSPONER_MS); }, []);

  if (!debeMostrarAviso(hayNueva, pospuestoHasta, Date.now())) return null;
  void tic;  // la dependencia real es el temporizador de abajo

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] print:hidden max-w-[94vw]">
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-card2"
        style={{ background: '#1A2550', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
        <div className="text-[13px] leading-tight">
          <div className="font-bold">Hay una versión nueva del sistema</div>
          <div className="opacity-75">Recarga cuando termines lo que estás haciendo. Lo guardado no se pierde.</div>
        </div>
        <button onClick={recargar}
          className="text-[13px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 flex-shrink-0"
          style={{ background: '#fff', color: '#1A2550' }}>
          <RefreshCw size={13} /> Recargar
        </button>
        <button onClick={posponer} aria-label="Recordarme en 30 minutos" title="Recordarme en 30 minutos"
          className="cursor-pointer opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
