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
}

export default function MapSection({ rutas, gps, cd, tiendas, onKmReady, onCdUpdate }: Props) {
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

  // Un filtro de una ruta puntual que ya no existe (recalculó, cambió el camión
  // previsualizado) no tiene sentido — vuelve a "Todas las rutas".
  useEffect(() => { setActiveFilter('all'); }, [rutas]);

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
    const filtradas = activeFilter === 'all' ? rutas : rutas.filter((_, i) => i === activeFilter);
    const sig = JSON.stringify({ r: filtradas.map(rt => [rt.v.p, rt.ts.map(t => t.c)]), cd: cdRef.current });
    if (sig === lastDrawnRef.current) return; // idéntico a lo ya dibujado → no re-llamar a Directions
    // 400ms — cada dibujo llama a Google Directions (facturable). Debounce para no disparar una
    // llamada por cada click intermedio (el timeout se cancela si `rutas` vuelve a cambiar antes).
    const timer = setTimeout(() => { lastDrawnRef.current = sig; dibujar(filtradas); }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas, activeFilter]);

  return (
    <div className="h-full flex flex-col bg-white no-print overflow-hidden">

      {/* Filtro de rutas — solo cuando hay más de una (con 0/1 no hay nada que filtrar). */}
      {rutas.length > 1 && (
        <div className="px-3 py-2 border-b border-black/[0.09] flex-shrink-0 flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveFilter('all')}
            className={`h-[28px] px-3 rounded-[7px] text-[11px] font-bold font-mono border-[1.5px] transition-all ${
              activeFilter === 'all' ? 'border-knavy bg-knavy text-white' : 'border-black/[0.12] bg-kbg text-kmuted'}`}
          >
            Todas
          </button>
          {rutas.map((r, i) => {
            const col = COLS[i % COLS.length];
            const active = activeFilter === i;
            return (
              <button
                key={r.v.p}
                onClick={() => setActiveFilter(i)}
                className="h-[28px] px-3 rounded-[7px] text-[11px] font-bold font-mono border-[1.5px] transition-all"
                style={active ? { borderColor: col, background: col, color: '#fff' } : { borderColor: col, background: '#F8FAFC', color: col }}
              >
                {r.v.p}
              </button>
            );
          })}
        </div>
      )}

      {rutas.length > 0 && (
        <div className="px-3.5 py-2 border-b border-black/[0.09] flex flex-wrap gap-[9px] flex-shrink-0">
          {rutas.map((r, i) => {
            const col = COLS[i % COLS.length];
            return (
              <div key={r.v.p} className="flex items-center gap-[5px] text-[11px] font-mono">
                <div className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ background: col }} />
                <span className="font-bold" style={{ color: col }}>{r.v.p}</span>
                <span className="text-kmuted">{r.tp}P · {r.ts.length} tiendas</span>
              </div>
            );
          })}
        </div>
      )}

      <div ref={elRef} className="w-full flex-1 min-h-0" style={{ background: '#e8eaed' }} />
    </div>
  );
}
