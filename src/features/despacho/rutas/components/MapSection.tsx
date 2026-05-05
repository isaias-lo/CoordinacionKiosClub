'use client';
import { useEffect, useRef } from 'react';
import { dibMapa, cargarGMaps } from '../utils/maps';
import { COLS } from '../data/tiendas';
import type { Ruta } from '../utils/routing';
import type { TiendaInfo } from '../data/tiendas';

interface Props {
  rutas: Ruta[];
  gps: Record<string, number[]>;
  cd: number[];
  tiendas: Record<string, TiendaInfo>;
  onKmReady: (kmMap: Record<number, number>, legMap: Record<number, {dist: string; dur: string}[]>) => void;
  onCdUpdate: (coords: number[]) => void;
}

export default function MapSection({ rutas, gps, cd, tiendas, onKmReady, onCdUpdate }: Props) {
  const elRef         = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<unknown>(null);
  const overlaysRef   = useRef<unknown[]>([]);
  const cdGeocodedRef = useRef<{lat: number; lng: number} | null>(null);
  const cdRef         = useRef(cd);

  useEffect(() => { cdRef.current = cd; }, [cd]);

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

  useEffect(() => {
    cargarGMaps();
    const timer = setTimeout(() => dibujar(rutas), 200);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutas]);

  function handleTab(rutasFiltradas: Ruta[], btn: HTMLButtonElement) {
    document.querySelectorAll('.mtab2').forEach(t => t.classList.remove('on','bg-knavy','text-white'));
    btn.classList.add('on','bg-knavy','text-white');
    dibujar(rutasFiltradas);
  }

  return (
    <div className="mt-3.5 no-print">
      <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-1">03 — Mapa de rutas</div>
      <div className="bg-white rounded-kios shadow-kios overflow-hidden">

        <div className="px-3 py-2.5 border-b border-black/[0.09] flex gap-1.5 flex-wrap">
          <button
            onClick={e => handleTab(rutas, e.currentTarget)}
            className="mtab2 on h-[28px] px-3 rounded-[7px] text-[11px] font-bold font-mono border-[1.5px] border-knavy bg-knavy text-white transition-all"
          >
            Todas las rutas
          </button>
          {rutas.map((r, i) => {
            const col = COLS[i % COLS.length];
            return (
              <button
                key={r.v.p}
                onClick={e => handleTab([r], e.currentTarget)}
                className="mtab2 h-[28px] px-3 rounded-[7px] text-[11px] font-bold font-mono border-[1.5px] bg-kbg text-kmuted transition-all"
                style={{ borderColor: col }}
              >
                <span style={{ color: col }}>{r.v.p}</span>
              </button>
            );
          })}
        </div>

        <div className="px-3.5 py-2 border-b border-black/[0.09] flex flex-wrap gap-[9px]">
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

        <div ref={elRef} className="w-full h-[260px] sm:h-[380px]" style={{ background: '#e8eaed' }} />
      </div>
    </div>
  );
}
