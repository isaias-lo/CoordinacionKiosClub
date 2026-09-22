import { Wifi, WifiOff } from 'lucide-react';

/**
 * [Bodega · uso simultáneo] Indicador visible del canal de tiempo real — antes esto era
 * completamente invisible: si el canal quedaba unido y MUDO (sin avisar — reinicio/rebalanceo del
 * servidor, throttle), el respaldo por polling lo cubre en máximo 1 minuto (`lib/ritmoDePoll.ts`),
 * pero nadie en pantalla se enteraba de que eso estaba pasando. "Ciego y no se nota" era
 * justamente lo que hacía que alguien volviera a pesar un pallet que un compañero ya había
 * cargado — medido el 17/09 (ver el commit que arregló el respaldo).
 *
 * Deliberadamente discreto cuando todo está bien — un puntito, no un banner — y solo se convierte
 * en un aviso real cuando hay algo que decir. `canalSano` viene de `useApp()`/`useSantiago()`,
 * nunca se calcula de nuevo acá: este componente solo muestra, no decide.
 */
export function IndicadorCanalSano({ canalSano }: { canalSano: boolean }) {
  if (canalSano) {
    return (
      <span title="Tiempo real conectado" className="inline-flex items-center text-[#94A3B8]">
        <Wifi size={12} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      title="El canal en vivo no responde — se está actualizando cada 15 s como respaldo, puede demorar hasta 1 minuto en notarse un cambio de un compañero"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
      style={{ background: '#FEF3C7', color: '#92400E' }}>
      <WifiOff size={11} aria-hidden="true" />
      Sin tiempo real — usando respaldo
    </span>
  );
}
