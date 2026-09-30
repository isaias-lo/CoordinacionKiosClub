'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, Upload, AlertTriangle } from 'lucide-react';
import { resumenOffline, type ResumenOffline } from '@/lib/offline/resumen';

/** Cada cuánto se vuelve a contar la cola. */
const CADA_MS = 15_000;

/**
 * [PWA · fase 4] Barra de estado de conexión, para toda la app.
 *
 * Antes cada módulo resolvía lo suyo: el panel del conductor tenía su contador, picking mostraba un
 * toast al reconectar y recepción no mostraba nada. Así, quien confirmaba algo sin señal y se
 * cambiaba de pantalla se quedaba sin forma de saber que seguía colgando.
 *
 * Reglas de qué se muestra, en orden:
 *
 *  1. Algo bloqueado → rojo. Es lo único que pide una acción: el servidor lo rechazó de forma
 *     definitiva y hay que volver a registrarlo. Se muestra aunque haya señal.
 *  2. Sin señal → ámbar, con lo que haya guardado sin enviar.
 *  3. Con señal y cosas en la cola → ámbar discreto, porque se están yendo solas.
 *  4. Con señal y nada pendiente → no se muestra nada.
 *
 * El caso 4 es la mayoría del tiempo, y ahí esta barra tiene que desaparecer del todo: una app de
 * bodega que dedica una franja permanente a decir "todo bien" está gastando pantalla en una tablet
 * donde cada fila de la grilla cuenta.
 */
/**
 * Alto real de la barra, publicado en `--kc-barra-estado` para que lo que flota abajo se corra.
 *
 * Se mide en vez de fijarlo: en un teléfono angosto el mensaje se va a dos líneas, y un número
 * escrito a mano acá dejaría el aviso de versión nueva tapando media barra justo en las pantallas
 * más chicas, que son las que menos lugar tienen.
 */
const VAR_ALTO = '--kc-barra-estado';

export function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(true);
  const [resumen, setResumen] = useState<ResumenOffline>({ pendientes: 0, bloqueadas: 0 });
  const barraRef = useRef<HTMLDivElement>(null);

  const contar = useCallback(async () => {
    try { setResumen(await resumenOffline()); } catch { /* la cola nunca puede romper la pantalla */ }
  }, []);

  useEffect(() => {
    // `navigator.onLine` se lee acá y no en el useState inicial: en el render del servidor no
    // existe, y arrancar en "sin señal" haría parpadear la barra en cada carga.
    setEnLinea(navigator.onLine);

    const alCambiar = () => { setEnLinea(navigator.onLine); void contar(); };
    window.addEventListener('online', alCambiar);
    window.addEventListener('offline', alCambiar);

    void contar();
    const t = setInterval(() => void contar(), CADA_MS);
    // Al volver a la pestaña: el caso típico es la tablet de bodega que queda abierta todo el día,
    // y en el teléfono se dispara al desbloquear la pantalla.
    const alVolver = () => { if (document.visibilityState === 'visible') { setEnLinea(navigator.onLine); void contar(); } };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      window.removeEventListener('online', alCambiar);
      window.removeEventListener('offline', alCambiar);
      document.removeEventListener('visibilitychange', alVolver);
      clearInterval(t);
    };
  }, [contar]);

  const { pendientes, bloqueadas } = resumen;
  const visible = !enLinea || pendientes > 0 || bloqueadas > 0;

  // Va antes del `return null` porque los hooks no pueden quedar detrás de una salida temprana.
  useEffect(() => {
    const raiz = document.documentElement;
    const limpiar = () => raiz.style.removeProperty(VAR_ALTO);
    if (!visible) { limpiar(); return limpiar; }

    const medir = () => {
      const alto = barraRef.current?.offsetHeight;
      if (alto) raiz.style.setProperty(VAR_ALTO, `${alto}px`);
    };
    medir();
    // El alto cambia al girar el aparato o al pasar el mensaje a dos líneas.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (ro && barraRef.current) ro.observe(barraRef.current);
    return () => { ro?.disconnect(); limpiar(); };
  }, [visible]);

  if (!visible) return null;

  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

  let fondo: string, borde: string, texto: string, Icono: typeof CloudOff, mensaje: string;
  if (bloqueadas > 0) {
    fondo = '#FEE2E2'; borde = '#FCA5A5'; texto = '#991B1B'; Icono = AlertTriangle;
    mensaje = `${bloqueadas} ${plural(bloqueadas, 'registro rechazado', 'registros rechazados')} — hay que volver a registrarlo${bloqueadas === 1 ? '' : 's'}`;
  } else if (!enLinea) {
    fondo = '#FEF3C7'; borde = '#FCD34D'; texto = '#92400E'; Icono = CloudOff;
    mensaje = pendientes > 0
      ? `Sin conexión — ${pendientes} ${plural(pendientes, 'registro guardado', 'registros guardados')} sin enviar`
      : 'Sin conexión — lo que registres se guarda y se envía al volver la señal';
  } else {
    fondo = '#FEF3C7'; borde = '#FCD34D'; texto = '#92400E'; Icono = Upload;
    mensaje = `Enviando ${pendientes} ${plural(pendientes, 'registro guardado', 'registros guardados')}…`;
  }

  return (
    <div
      ref={barraRef}
      role="status"
      aria-live="polite"
      // El enrutador y el panel de combinaciones imprimen LA PÁGINA con `window.print()`, no una
      // ventana aparte, así que sin esto la barra sale impresa en cada manifiesto.
      className="no-print print:hidden"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        background: fondo, borderTop: `1px solid ${borde}`, color: texto,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '9px 14px', fontSize: 13, fontWeight: 700, lineHeight: 1.3, textAlign: 'center',
      }}
    >
      <Icono size={16} style={{ flexShrink: 0 }} />
      <span>{mensaje}</span>
    </div>
  );
}
