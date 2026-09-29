/**
 * Alta, baja y actualización del service worker.
 *
 * La parte decisoria está separada en funciones puras (`queHacerConElSW`, `haySWEsperando`) porque
 * es la que hay que poder probar: lo demás son llamadas al navegador.
 */

export const SW_URL = '/sw.js';

/** Cada cuánto se le pregunta al navegador si hay un service worker nuevo publicado. */
export const REVISAR_CADA_MS = 5 * 60_000;

export type AccionSW = 'registrar' | 'desinstalar' | 'nada';

/**
 * Qué hacer al cargar la app.
 *
 * `desinstalar` existe como salida de emergencia. Un service worker mal publicado no se arregla
 * publicando otro: se queda pegado en los dispositivos, sirviendo lo que guardó, y en bodega no hay
 * nadie que vaya tablet por tablet a limpiar el navegador. Con `NEXT_PUBLIC_SW_DISABLED=1` en
 * Vercel y un redespliegue, la próxima vez que cada dispositivo abra la app se da de baja solo y
 * borra lo que tenía guardado.
 *
 * Por eso la baja NO depende de que el service worker viejo se porte bien: la decisión la toma esta
 * función, que viaja en el bundle de la página, no en el worker.
 */
export function queHacerConElSW(
  { soportado, deshabilitado }: { soportado: boolean; deshabilitado: boolean },
): AccionSW {
  if (!soportado) return 'nada';
  return deshabilitado ? 'desinstalar' : 'registrar';
}

/** ¿Hay una versión nueva ya descargada, esperando su turno para tomar el control? */
export function haySWEsperando(registro: { waiting: unknown | null } | null | undefined): boolean {
  return !!registro?.waiting;
}

function swDeshabilitado(): boolean {
  return process.env.NEXT_PUBLIC_SW_DISABLED === '1';
}

/** Da de baja todo service worker de este origen y borra sus cachés. */
export async function desinstalarSW(): Promise<void> {
  try {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map(r => r.unregister()));
    if ('caches' in window) {
      const nombres = await caches.keys();
      await Promise.all(nombres.map(n => caches.delete(n)));
    }
  } catch {
    // Sin permisos, en modo incógnito o con el almacenamiento bloqueado. No hay nada que rescatar
    // acá: la app funciona igual sin service worker, que es justo lo que se estaba buscando.
  }
}

/**
 * Registra el service worker y avisa cuando queda uno nuevo esperando.
 *
 * Devuelve una función para soltar los listeners. El aviso puede llegar varias veces; quien
 * escucha decide qué hacer con eso.
 */
export function registrarSW(alHaberVersionNueva: () => void): () => void {
  const soportado = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const accion = queHacerConElSW({ soportado, deshabilitado: swDeshabilitado() });

  if (accion === 'nada') return () => {};
  if (accion === 'desinstalar') { void desinstalarSW(); return () => {}; }

  let vivo = true;
  let registro: ServiceWorkerRegistration | null = null;
  let intervalo: ReturnType<typeof setInterval> | null = null;

  const revisarSiHayEsperando = () => {
    if (vivo && haySWEsperando(registro)) alHaberVersionNueva();
  };

  void navigator.serviceWorker.register(SW_URL, { scope: '/' })
    .then((reg) => {
      if (!vivo) return;
      registro = reg;

      // Ya había uno esperando de antes (la pestaña se abrió después de un despliegue).
      revisarSiHayEsperando();

      reg.addEventListener('updatefound', () => {
        const entrante = reg.installing;
        if (!entrante) return;
        entrante.addEventListener('statechange', () => {
          // `installed` con un controlador ya activo = hay versión nueva esperando. Sin controlador
          // es la primera instalación en este dispositivo, que no es novedad para nadie.
          if (entrante.state === 'installed' && navigator.serviceWorker.controller) alHaberVersionNueva();
        });
      });

      // El navegador revisa si hay service worker nuevo por su cuenta, pero con una pestaña abierta
      // todo el día puede pasar horas sin hacerlo — y ese es exactamente el caso de bodega. Se le
      // pregunta al mismo ritmo al que ya se consultaba /api/version, y al volver a la pestaña.
      intervalo = setInterval(() => { void reg.update().catch(() => {}); }, REVISAR_CADA_MS);
    })
    .catch(() => {
      // Falló el registro (sin HTTPS, almacenamiento bloqueado, Safari en privado). La app sigue
      // funcionando como hasta ahora: el aviso de versión por /api/version no depende de esto.
    });

  const alVolverALaPestana = () => {
    if (document.visibilityState !== 'visible') return;
    revisarSiHayEsperando();
    void registro?.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', alVolverALaPestana);

  return () => {
    vivo = false;
    if (intervalo) clearInterval(intervalo);
    document.removeEventListener('visibilitychange', alVolverALaPestana);
  };
}

/**
 * Pasa a la versión nueva y recarga.
 *
 * Importante: con un service worker esperando, un `location.reload()` a secas NO alcanza. El worker
 * viejo sigue siendo el que controla la pestaña, así que la recarga vuelve a servir el código
 * viejo, el aviso aparece de nuevo y la persona queda apretando Recargar sin que pase nada. Hay que
 * pedirle al que espera que tome el control, y recargar cuando eso ocurrió.
 */
export async function activarVersionNueva(): Promise<void> {
  const recargar = () => { window.location.reload(); };

  if (!('serviceWorker' in navigator)) { recargar(); return; }

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.waiting) { recargar(); return; }

    // Si el cambio de controlador no llega (el worker no respondió al mensaje), se recarga igual:
    // más vale una recarga que quizá no traiga lo nuevo que un botón que no hace nada.
    const red = setTimeout(recargar, 2_000);
    navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(red); recargar(); }, { once: true });
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  } catch {
    recargar();
  }
}
