'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { hayVersionNueva, debeMostrarAviso, resumenDeVersiones, VERSION_DESCONOCIDA, POSPONER_MS } from '@/lib/versionApp';
import { registrarSW, activarVersionNueva } from '@/lib/sw/registrarSW';

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
  // La versión que responde el servidor. Se guarda SIEMPRE, coincida o no, para poder decir cuál
  // es cuál en el aviso. Ver `resumenDeVersiones`.
  const [remota, setRemota] = useState<string | null>(null);
  // Solo existe para volver a dibujar cuando vence el aplazamiento.
  const [tic, setTic] = useState(0);
  // Una vez detectada, no se vuelve a preguntar: la respuesta ya no puede cambiar sin recargar.
  const yaDetectada = useRef(false);
  // El sondeo vive en su propio efecto; el service worker necesita poder dispararlo.
  const revisarRef = useRef<((forzar?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!local || local === VERSION_DESCONOCIDA) return; // en desarrollo no hay con qué comparar
    let vivo = true;

    // `forzar` lo usa el service worker: ya decidió que hay versión nueva, pero hace falta
    // preguntar igual para saber CUÁL está publicada y poder nombrarla en el aviso.
    const revisar = async (forzar = false) => {
      if ((yaDetectada.current && !forzar) || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok || !vivo) return;
        const { version } = await res.json() as { version?: string };
        if (!vivo || !version) return;
        setRemota(version);
        if (!hayVersionNueva(local, version)) return;
        yaDetectada.current = true;
        setHayNueva(true);
      } catch {
        // Sin red o servidor caído: se reintenta en el próximo ciclo, sin molestar a nadie.
      }
    };

    revisarRef.current = revisar;
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    const id = setInterval(() => { void revisar(); }, CADA_MS);
    void revisar();
    return () => { vivo = false; clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [local]);

  // Segunda fuente de la misma señal: el service worker.
  //
  // El sondeo de arriba se queda porque no depende de nada — si el service worker no llega a
  // registrarse (Safari en privado, almacenamiento bloqueado, `NEXT_PUBLIC_SW_DISABLED`), el aviso
  // tiene que seguir apareciendo igual que hasta hoy. Con service worker hay además una señal
  // directa: el navegador ya descargó la versión nueva y la dejó esperando.
  // Esta rama NO compara versiones: avisa porque el navegador ya descargó algo y lo dejó
  // esperando. Por eso pide la publicada aparte — si resulta ser la MISMA que la cargada, el aviso
  // lo dice, y eso explica un botón Recargar que no trae nada nuevo.
  useEffect(() => registrarSW(() => {
    yaDetectada.current = true;
    setHayNueva(true);
    void revisarRef.current?.(true);
  }), []);

  // Mientras está pospuesto, un temporizador lo trae de vuelta al vencer.
  useEffect(() => {
    if (!hayNueva || pospuestoHasta <= Date.now()) return;
    const id = setTimeout(() => setTic(t => t + 1), pospuestoHasta - Date.now() + 100);
    return () => clearTimeout(id);
  }, [hayNueva, pospuestoHasta]);

  // No es un `location.reload()` a secas: con un service worker esperando, el viejo sigue
  // controlando la pestaña y la recarga volvería a servir el código viejo, dejando a la persona
  // apretando Recargar sin que pase nada. `activarVersionNueva` le cede el paso primero.
  const recargar = useCallback(() => { void activarVersionNueva(); }, []);
  const posponer = useCallback(() => { setPospuestoHasta(Date.now() + POSPONER_MS); }, []);

  if (!debeMostrarAviso(hayNueva, pospuestoHasta, Date.now())) return null;
  const resumen = resumenDeVersiones(local, remota);
  void tic;  // la dependencia real es el temporizador de abajo

  return (
    // `--kc-barra-estado` lo publica EstadoConexion cuando su barra está abajo; sin ella vale 0.
    // Los dos avisos pueden salir juntos —sin señal y con una versión nueva esperando— y antes
    // este quedaba encima del otro tapándolo.
    <div className="fixed left-1/2 -translate-x-1/2 z-[1000] print:hidden max-w-[94vw]"
      style={{ bottom: 'calc(1rem + var(--kc-barra-estado, 0px))' }}>
      <div className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-card2"
        style={{ background: '#1A2550', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
        <div className="text-[13px] leading-tight">
          <div className="font-bold">Hay una versión nueva del sistema</div>
          <div className="opacity-75">Recarga cuando termines lo que estás haciendo. Lo guardado no se pierde.</div>
          {resumen && (
            // Cuál tiene la pestaña y cuál está publicada. Es lo que permite saber, sin consola y
            // sin reproducirlo, por qué un Recargar podría no estar trayendo nada. Ver `versionApp`.
            <div className="opacity-60 font-mono" style={{ fontSize: 11, marginTop: 3 }}>{resumen}</div>
          )}
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
