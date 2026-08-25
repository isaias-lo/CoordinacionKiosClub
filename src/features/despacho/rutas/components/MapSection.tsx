'use client';
import { useEffect, useRef, useState } from 'react';
import { dibMapa, cargarGMaps } from '../utils/maps';
import { COLS } from '../data/tiendas';
import type { Ruta } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';

interface Props {
  rutas: Ruta[];
  gps: Record<string, number[]>;
  cd: number[];
  tiendas: Record<string, TiendaInfo>;
  onKmReady: (kmMap: Record<number, number>, legMap: Record<number, {dist: string; dur: string; durSec?: number}[]>) => void;
  onCdUpdate: (coords: number[]) => void;
  // 'load' (DESPACHO): la leyenda muestra "{pallets}P · {n} tiendas". 'stops' (PLANIFICADOR): muestra
  // "{n} paradas" (el plan no tiene carga). El nombre de cada ruta sale de `r.v.p` en ambos casos.
  statMode?: 'load' | 'stops';
  // [D] Filtro CONTROLADO por patente: si se pasa `onSelectPatente`, el filtro del mapa lo maneja el
  // padre (la patente = `v.p`). Así tocar la tarjeta del camión y el chip del mapa quedan sincronizados.
  selectedPatente?: string | null;
  onSelectPatente?: (patente: string | null) => void;
}

export default function MapSection({ rutas, gps, cd, tiendas, onKmReady, onCdUpdate, statMode = 'load', selectedPatente, onSelectPatente }: Props) {
  const elRef         = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<unknown>(null);
  const overlaysRef   = useRef<unknown[]>([]);
  const cdGeocodedRef = useRef<{lat: number; lng: number} | null>(null);
  const cdRef         = useRef(cd);
  // Filtro de tab: 'all' o el índice de una ruta puntual. Antes se manejaba pisando
  // classList a mano (document.querySelectorAll('.mtab2')) — funcionaba, pero dejaba el
  // botón "Todas las rutas" con estado visual desincronizado si `rutas` cambiaba sin que
  // el usuario volviera a tocar un tab (React nunca vuelve a aplicar un className que no
  // cambió en el JSX, así que una mutación de classList hecha por fuera de React persiste
  // "mintiéndole" al render siguiente).
  const [activeFilter, setActiveFilter] = useState<number | 'all'>('all');

  useEffect(() => { cdRef.current = cd; }, [cd]);

  // [Fix divisor] Cuando el contenedor del mapa cambia de tamaño (al arrastrar el divisor
  // contenido↔mapa), Google Maps no re-dibuja las tiles en el área nueva y deja una franja en
  // blanco. Un ResizeObserver le avisa al mapa que se redimensionó y re-centra para que se rellene.
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = mapRef.current as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const G = (window as any).google?.maps;
        if (!map || !G?.event) return;
        const center = map.getCenter?.();
        G.event.trigger(map, 'resize');
        if (center) map.setCenter(center); // el trigger recorta el centro → lo restauramos
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // Un filtro de una ruta puntual que ya no existe (recalculó, cambió el camión
  // previsualizado) no tiene sentido — vuelve a "Todas las rutas".
  useEffect(() => { setActiveFilter('all'); }, [rutas]);

  // [D] Filtro EFECTIVO: si es controlado (onSelectPatente), deriva de la patente seleccionada por el
  // padre (tarjeta del camión); si no, usa el estado interno de los chips. Un solo origen de verdad.
  const controlado = onSelectPatente != null;
  const selIdx = selectedPatente ? rutas.findIndex(r => r.v.p === selectedPatente) : -1;
  const activeIdx: number | 'all' = controlado ? (selIdx >= 0 ? selIdx : 'all') : activeFilter;
  const setFiltro = (idx: number | 'all') => {
    if (controlado) onSelectPatente!(idx === 'all' ? null : (rutas[idx as number]?.v.p ?? null));
    else setActiveFilter(idx);
  };

  function dibujar(rutasFiltradas: Ruta[]) {
    if (!elRef.current) return;
    dibMapa({
      el: elRef.current,
      rutas: rutasFiltradas,
      gps,
      cd: cdRef.current,
      tiendas,
      mapRef,
      overlaysRef,
      cdGeocodedRef,
      onKmReady: (kmPorRuta, legDataPorRuta) => {
        if (cdGeocodedRef.current) onCdUpdate([cdGeocodedRef.current.lat, cdGeocodedRef.current.lng]);
        if (typeof onKmReady === 'function') onKmReady(kmPorRuta, legDataPorRuta);
      },
    });
  }

  // Firma de lo ÚLTIMO dibujado — evita re-llamar a Directions (facturable) si la ruta a dibujar
  // es IDÉNTICA (mismas paradas + CD + filtro). Clave con la persistencia del plan: volver al tab
  // PLAN con la misma ruta ya NO gasta otra llamada a Google.
  const lastDrawnRef = useRef<string>('');
  useEffect(() => {
    cargarGMaps();
    const filtradas = activeIdx === 'all' ? rutas : rutas.filter((_, i) => i === activeIdx);
    const sig = JSON.stringify({ r: filtradas.map(rt => [rt.v.p, rt.ts.map(t => t.c)]), cd: cdRef.current });
    if (sig === lastDrawnRef.current) return; // idéntico a lo ya dibujado → no re-llamar a Directions
    // 400ms — cada dibujo llama a Google Directions (facturable). Debounce para no disparar una
    // llamada por cada click intermedio (el timeout se cancela si `rutas` vuelve a cambiar antes).
    const timer = setTimeout(() => { lastDrawnRef.current = sig; dibujar(filtradas); }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas, activeIdx]);

  // Rutas realmente DIBUJADAS (con paradas), conservando el índice original para el color. Las rutas
  // ocultas/vacías (que el Planificador pasa con ts:[] para preservar el color por índice) no se
  // listan — así no aparece "Ruta 1 · 0 paradas" cuando en el panel tiene paradas pero está oculta.
  const dibujadas = rutas.map((r, i) => ({ r, i })).filter(({ r }) => r.ts.length > 0);
  const unidad = statMode === 'stops' ? 'paradas' : 'tiendas';

  return (
    <div className="h-full flex flex-col bg-white no-print overflow-hidden">

      {/* Filtro de rutas — solo cuando hay más de una dibujada (con 0/1 no hay nada que filtrar). */}
      {dibujadas.length > 1 && (
        <div className="px-3 py-2 border-b border-black/[0.09] flex-shrink-0 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFiltro('all')}
            className={`h-[28px] px-3 rounded-[7px] text-[11px] font-bold border-[1.5px] transition-all ${
              activeIdx === 'all' ? 'border-knavy bg-knavy text-white' : 'border-black/[0.12] bg-kbg text-kmuted'}`}
          >
            Todas
          </button>
          {dibujadas.map(({ r, i }) => {
            const col = COLS[i % COLS.length];
            const active = activeIdx === i;
            return (
              <button
                key={r.v.p}
                onClick={() => setFiltro(i)}
                className="h-[28px] px-3 rounded-[7px] text-[11px] font-bold border-[1.5px] transition-all"
                style={active ? { borderColor: col, background: col, color: '#fff' } : { borderColor: col, background: '#F8FAFC', color: col }}
              >
                {r.v.p}
              </button>
            );
          })}
        </div>
      )}

      {dibujadas.length > 0 && (
        <div className="px-3.5 py-2 border-b border-black/[0.09] flex flex-wrap gap-[9px] flex-shrink-0">
          {dibujadas.map(({ r, i }) => {
            const col = COLS[i % COLS.length];
            return (
              <div key={r.v.p} className="flex items-center gap-[5px] text-[11px]">
                <div className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ background: col }} />
                <span className="font-bold" style={{ color: col }}>{r.v.p}</span>
                <span className="text-kmuted">{statMode === 'load' ? `${r.tp}P · ${r.ts.length} ${unidad}` : `${r.ts.length} ${unidad}`}</span>
              </div>
            );
          })}
        </div>
      )}

      <div ref={elRef} className="w-full flex-1 min-h-0" style={{ background: '#e8eaed' }} />
    </div>
  );
}
