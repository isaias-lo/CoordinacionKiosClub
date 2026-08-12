'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X, Navigation, GripVertical, Sparkles, Trash2, Building2, Clock } from 'lucide-react';
import { CD_INICIAL, type TiendaInfo } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';
import { nn, type Ruta } from '../utils/routing';
import { dkm } from '../utils/helpers';
import { cargarGMaps } from '../utils/maps';
import { buscarTiendas, virtualStops, googleMapsDeepLink } from '../utils/planificador';
import { tipoTienda, grupoTienda, type TipoTiendaKey } from '../utils/tipoTienda';

// Vehículo "virtual" — el planificador es solo visual (una ruta, sin carga ni patente real).
const PLAN_VEHICLE: Vehiculo = { p: 'PLAN', c: 0, b: 0, t: 'Planificador', tlbd: false, on: true, porton: null, refrigerado: false, empresa: '' };

interface Props {
  gps: Record<string, number[]>;
  tiendas: Record<string, TiendaInfo>;
  /** Reporta la ruta ordenada + el punto de partida, para dibujarla en el MapSection fijo.
   *  rutas = [] y cd = CD por defecto cuando no hay paradas. */
  onPlanRutas?: (rutas: Ruta[], cd: number[]) => void;
}

type StartMode = 'cd' | 'tienda' | 'custom';

/** Badge de tipo (Mall/Strip/Street/…) + ventana horaria de una tienda. */
function MetaTienda({ tienda }: { tienda?: TiendaInfo }) {
  if (!tienda) return null;
  const tp = tipoTienda(tienda.tipo, tienda.d, tienda.z);
  const ventana = (tienda.v ?? '').trim();
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap mt-0.5">
      <span className="text-[10px] font-bold px-1.5 py-px rounded"
        style={{ color: tp.color, background: `${tp.color}1A`, border: `1px solid ${tp.color}40` }}>
        {tp.label}
      </span>
      {ventana && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-kmuted">
          <Clock size={10} aria-hidden="true" /> {ventana}
        </span>
      )}
    </span>
  );
}

export default function PlanificadorTab({ gps, tiendas, onPlanRutas }: Props) {
  const [startMode,   setStartMode]   = useState<StartMode>('cd');
  const [startTienda, setStartTienda] = useState('');
  const [customCoord, setCustomCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [customAddr,  setCustomAddr]  = useState('');
  const [geoStatus,   setGeoStatus]   = useState<'idle' | 'loading' | 'error'>('idle');
  const [selected,    setSelected]    = useState<string[]>([]);
  const [orderMode,   setOrderMode]   = useState<'cercania' | 'manual'>('cercania');
  const [search,      setSearch]      = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'rm' | 'costa' | 'fal'>('all');
  const [tipoFilter,   setTipoFilter]   = useState<'all' | TipoTiendaKey>('all');
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);

  // GMaps se carga para el geocoder de "Dirección" (el mapa lo dibuja el MapSection fijo).
  useEffect(() => { cargarGMaps(); }, []);

  // Punto de partida resuelto (coord).
  const startCoord = useMemo<{ lat: number; lng: number }>(() => {
    if (startMode === 'tienda' && startTienda && gps[startTienda]) return { lat: gps[startTienda][0], lng: gps[startTienda][1] };
    if (startMode === 'custom' && customCoord) return customCoord;
    return { lat: CD_INICIAL[0], lng: CD_INICIAL[1] };
  }, [startMode, startTienda, customCoord, gps]);

  // Orden de las paradas: por cercanía (nn desde la partida) o manual (orden de `selected`).
  const orderedCods = useMemo<string[]>(() => {
    if (orderMode === 'cercania') {
      return nn(virtualStops(selected), gps, [startCoord.lat, startCoord.lng]).map(s => s.c);
    }
    return selected;
  }, [orderMode, selected, gps, startCoord]);

  // km aproximado (haversine) desde la partida por las paradas en orden.
  const kmAprox = useMemo<number>(() => {
    let k = 0, prev: number[] = [startCoord.lat, startCoord.lng];
    for (const c of orderedCods) { const g = gps[c]; if (g) { k += dkm(prev, g); prev = g; } }
    return Math.round(k);
  }, [orderedCods, gps, startCoord]);

  // Levantar la ruta ordenada al padre (RutasScreen → MapSection). El callback llega inline
  // (uno nuevo en cada render de RutasScreen); si estuviera en las deps, el efecto se dispararía
  // en CADA render → planRutas cambiaría siempre → el mapa (debounce 400ms) nunca terminaría de
  // dibujar. Por eso usamos un ref y lo dejamos FUERA de las deps: el efecto corre solo cuando
  // cambian las paradas o el punto de partida.
  const onPlanRutasRef = useRef(onPlanRutas);
  onPlanRutasRef.current = onPlanRutas;
  useEffect(() => {
    const ruta: Ruta = { v: PLAN_VEHICLE, ts: virtualStops(orderedCods), tp: 0, tb: 0 };
    onPlanRutasRef.current?.(orderedCods.length ? [ruta] : [], [startCoord.lat, startCoord.lng]);
  }, [orderedCods, startCoord]);

  const resultados = useMemo(() => buscarTiendas(tiendas, gps, search), [tiendas, gps, search]);
  // Filtros del buscador: por región (RM/Costa/Nacional) y por tipo (Mall/Strip/Street/…).
  const resultadosFiltrados = useMemo(() => resultados.filter(t => {
    const inf = tiendas[t.cod];
    if (regionFilter !== 'all' && grupoTienda(inf?.z) !== regionFilter) return false;
    if (tipoFilter !== 'all' && tipoTienda(inf?.tipo, inf?.d, inf?.z).key !== tipoFilter) return false;
    return true;
  }), [resultados, tiendas, regionFilter, tipoFilter]);
  const startTiendaOpts = useMemo(() => buscarTiendas(tiendas, gps, ''), [tiendas, gps]);
  const fseg = 'px-2.5 py-1 rounded-[7px] text-[11px] font-bold cursor-pointer transition-colors border';
  const fon  = 'bg-knavy text-white border-knavy';
  const foff = 'bg-white text-kmuted border-black/[0.12] hover:border-knavy/40';

  function toggle(cod: string) {
    setSelected(prev => prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]);
  }
  function quitar(cod: string) { setSelected(prev => prev.filter(c => c !== cod)); }
  function limpiar() { setSelected([]); }

  function geocodeAddr() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const G = (window as any).google?.maps;
    if (!G || !customAddr.trim()) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    new G.Geocoder().geocode({ address: customAddr, region: 'cl' }, (res: unknown[], status: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (status === 'OK' && res[0]) { const loc = (res[0] as any).geometry.location; setCustomCoord({ lat: loc.lat(), lng: loc.lng() }); setStartMode('custom'); setGeoStatus('idle'); }
      else setGeoStatus('error');
    });
  }

  // Reordenar manual (drag): opera sobre el orden mostrado (orderedCods) y fija modo manual.
  function reordenar(from: number, to: number) {
    if (from === to) return;
    const base = [...orderedCods];
    const [m] = base.splice(from, 1);
    base.splice(to, 0, m);
    setSelected(base); setOrderMode('manual');
  }

  const nombre = (cod: string) => tiendas[cod]?.n ?? cod;
  const comuna = (cod: string) => tiendas[cod]?.z ?? '';
  const startLabel = startMode === 'cd' ? 'CD KiosClub'
    : startMode === 'tienda' ? (startTienda ? `${startTienda} · ${nombre(startTienda)}` : 'Elegir tienda…')
    : (customCoord ? (customAddr || 'Punto personalizado') : 'Ingresar dirección…');

  const seg = 'flex-1 py-1.5 rounded-[8px] text-[12px] font-semibold cursor-pointer transition-colors';

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4 max-w-[640px] mx-auto w-full">
      <div>
        <div className="flex items-center gap-2 text-ktext font-bold text-[15px]"><MapPin size={16} className="text-knavy" /> Planificador de rutas</div>
        <div className="text-[12px] text-kmuted mt-0.5">Elegí punto de partida y tiendas; la ruta se ordena por cercanía y se dibuja en el mapa de la derecha.</div>
      </div>

      {/* Punto de partida */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Punto de partida</div>
        <div className="flex gap-1 bg-kbg rounded-[10px] p-1">
          <button onClick={() => setStartMode('cd')}     className={`${seg} ${startMode === 'cd' ? 'bg-knavy text-white' : 'text-kmuted'}`}>CD</button>
          <button onClick={() => setStartMode('tienda')} className={`${seg} ${startMode === 'tienda' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Tienda</button>
          <button onClick={() => setStartMode('custom')} className={`${seg} ${startMode === 'custom' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Dirección</button>
        </div>
        {startMode === 'tienda' && (
          <select value={startTienda} onChange={e => setStartTienda(e.target.value)}
            className="w-full border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none">
            <option value="">— Elegir tienda —</option>
            {startTiendaOpts.map(t => <option key={t.cod} value={t.cod}>{t.cod} · {t.nombre}</option>)}
          </select>
        )}
        {startMode === 'custom' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <input value={customAddr} onChange={e => { setCustomAddr(e.target.value); setGeoStatus('idle'); }}
                onKeyDown={e => { if (e.key === 'Enter') geocodeAddr(); }}
                placeholder="Dirección (ej: Av. Vitacura 2909)"
                className="flex-1 border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none" />
              <button onClick={geocodeAddr} className="px-3 rounded-[8px] bg-knavy text-white text-[12px] font-semibold cursor-pointer">Buscar</button>
            </div>
            <div className="text-[11px] text-kmuted">{geoStatus === 'loading' ? 'Buscando…' : geoStatus === 'error' ? '⚠ No se encontró la dirección' : 'Escribe una dirección y toca Buscar.'}</div>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[12px] text-ktext bg-kbg rounded-[8px] px-2.5 py-1.5">
          <Navigation size={13} className="text-[#D42B2B] flex-shrink-0" /> <span className="font-semibold truncate">{startLabel}</span>
        </div>
      </div>

      {/* Buscar tiendas */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Agregar tiendas</div>
        <div className="flex items-center gap-2 border border-black/[0.12] rounded-[8px] px-2.5 py-2 bg-white">
          <Search size={14} className="text-kmuted flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, nombre o comuna…"
            className="flex-1 text-[13px] outline-none bg-transparent text-ktext" />
        </div>
        {/* Filtro por región */}
        <div className="flex flex-wrap gap-1.5">
          <button className={`${fseg} ${regionFilter === 'all' ? fon : foff}`} onClick={() => setRegionFilter('all')}>Todas</button>
          <button className={`${fseg} ${regionFilter === 'rm' ? fon : foff}`} onClick={() => setRegionFilter('rm')}>RM</button>
          <button className={`${fseg} ${regionFilter === 'costa' ? fon : foff}`} onClick={() => setRegionFilter('costa')}>Costa</button>
          <button className={`${fseg} ${regionFilter === 'fal' ? fon : foff}`} onClick={() => setRegionFilter('fal')}>Nacional</button>
        </div>
        {/* Filtro por tipo de tienda */}
        <div className="flex flex-wrap gap-1.5">
          <button className={`${fseg} ${tipoFilter === 'all' ? fon : foff}`} onClick={() => setTipoFilter('all')}>Todos</button>
          <button className={`${fseg} ${tipoFilter === 'mall' ? fon : foff}`} onClick={() => setTipoFilter('mall')}>Mall</button>
          <button className={`${fseg} ${tipoFilter === 'strip' ? fon : foff}`} onClick={() => setTipoFilter('strip')}>Strip</button>
          <button className={`${fseg} ${tipoFilter === 'street' ? fon : foff}`} onClick={() => setTipoFilter('street')}>Street</button>
        </div>
        <div className="max-h-[240px] overflow-y-auto flex flex-col gap-0.5">
          {resultadosFiltrados.map(t => {
            const on = selected.includes(t.cod);
            return (
              <button key={t.cod} onClick={() => toggle(t.cod)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-left cursor-pointer transition-colors ${on ? 'bg-knavy/10' : 'hover:bg-kbg'}`}>
                <span className={`w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0 border ${on ? 'bg-knavy border-knavy' : 'border-black/20'}`}>
                  {on && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                </span>
                <Building2 size={13} className="text-kmuted flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-ktext">{t.cod}</span>
                  <span className="text-[12px] text-kmuted"> · {t.nombre}</span>
                  {t.comuna && <span className="block text-[11px] text-kmuted truncate">{t.comuna}</span>}
                  <MetaTienda tienda={tiendas[t.cod]} />
                </span>
              </button>
            );
          })}
          {resultadosFiltrados.length === 0 && <div className="text-[12px] text-kmuted text-center py-3">Sin resultados.</div>}
        </div>
      </div>

      {/* Paradas seleccionadas */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Paradas ({selected.length}){selected.length > 0 ? ` · ~${kmAprox} km` : ''}</div>
          {selected.length > 0 && (
            <button onClick={limpiar} className="text-[11px] text-[#D42B2B] font-semibold cursor-pointer flex items-center gap-1"><Trash2 size={11} /> Limpiar</button>
          )}
        </div>
        {selected.length > 0 && (
          <div className="flex gap-1 bg-kbg rounded-[10px] p-1">
            <button onClick={() => setOrderMode('cercania')} className={`${seg} flex items-center justify-center gap-1 ${orderMode === 'cercania' ? 'bg-knavy text-white' : 'text-kmuted'}`}><Sparkles size={12} /> Cercanía</button>
            <button onClick={() => setOrderMode('manual')}   className={`${seg} ${orderMode === 'manual' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Manual</button>
          </div>
        )}
        <div className="flex flex-col gap-1">
          {orderedCods.map((cod, i) => (
            <div key={cod} draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) reordenar(dragIdx, i); setDragIdx(null); }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-white border border-black/[0.09]">
              <GripVertical size={13} className="text-black/20 cursor-grab flex-shrink-0" />
              <span className="w-5 h-5 rounded-full bg-knavy text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="text-[13px] font-semibold text-ktext">{cod}</span>
                <span className="text-[11px] text-kmuted"> · {nombre(cod)}{comuna(cod) ? ` · ${comuna(cod)}` : ''}</span>
                <MetaTienda tienda={tiendas[cod]} />
              </span>
              <button onClick={() => quitar(cod)} className="text-kmuted hover:text-[#D42B2B] cursor-pointer flex-shrink-0"><X size={14} /></button>
            </div>
          ))}
          {selected.length === 0 && <div className="text-[12px] text-kmuted text-center py-3 border border-dashed border-black/10 rounded-[8px]">Agregá tiendas para armar la ruta.</div>}
        </div>
        {selected.length > 0 && (
          <a href={googleMapsDeepLink(startCoord, orderedCods, gps)} target="_blank" rel="noopener noreferrer"
            className="mt-1 flex items-center justify-center gap-2 py-2 rounded-[10px] bg-[#1B2A6B] text-white text-[13px] font-bold cursor-pointer no-underline">
            <Navigation size={14} /> Abrir en Google Maps
          </a>
        )}
      </div>
    </div>
  );
}
