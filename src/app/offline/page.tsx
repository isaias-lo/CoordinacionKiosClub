import { WifiOff } from 'lucide-react';
import { ReintentarBoton } from './ReintentarBoton';

/**
 * Lo que se ve cuando la app no puede llegar al servidor.
 *
 * El service worker guarda esta página al instalarse y la sirve cuando una navegación falla, que
 * hasta ahora era la pantalla de error del navegador o, peor, nada.
 *
 * No muestra datos a propósito: se sirve desde el caché del service worker, sin red y sin sesión,
 * así que no hay forma de saber acá qué quedó pendiente. Prometer algo que no se puede verificar,
 * en una pantalla de error, es cómo se pierde la confianza en todos los demás avisos.
 *
 * (Se queda como `force-dynamic` heredado del layout raíz, que lo fuerza para todo el árbol. No
 * importa: el service worker la pide una vez al instalarse y guarda el resultado.)
 */

export default function OfflinePage() {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
    >
      <div className="w-full max-w-[400px] text-center">
        <div className="flex justify-center mb-6 text-white/40">
          <WifiOff size={56} strokeWidth={1.5} />
        </div>

        <div className="font-barlow-condensed text-3xl font-bold text-white mb-4">
          Sin conexión
        </div>

        <p className="text-white/50 text-sm mb-3">
          No se pudo llegar al servidor. Puede ser la señal del patio o de la bodega.
        </p>
        <p className="text-white/50 text-sm mb-10">
          Lo que alcanzaste a registrar quedó guardado en el dispositivo y se envía solo cuando
          vuelva la señal. No hace falta escribirlo de nuevo.
        </p>

        <ReintentarBoton />
      </div>
    </div>
  );
}
