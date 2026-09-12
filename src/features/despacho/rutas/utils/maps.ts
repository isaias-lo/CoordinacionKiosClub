// @ts-nocheck
import { dkm } from './helpers';
import { GMAPS_KEY, COLS } from '../data/tiendas';
import type { Ruta } from './routing';
import type { TiendaInfo } from '../data/tiendas';
import { calcularETAs, estadoVentana, minAHHMM } from './planificador';

let _gmapsLoaded  = false;
let _gmapsLoading = false;
let _pendingMap: (() => void) | null = null;
const _readyCbs: (() => void)[] = [];
let _authFailed = false;

/** true si Google Maps falló la autenticación (key inválida / sin billing / API no habilitada).
 *  Cuando esto pasa, Google mostraría el cartel "¿eres el dueño de este sitio?"; lo interceptamos
 *  (ver `gm_authFailure` abajo) para no mostrarlo y, en su lugar, degradar con un aviso claro. */
export function isGmapsAuthFailed(): boolean { return _authFailed; }

export function cargarGMaps() {
  if (typeof window === 'undefined') return;
  if (_gmapsLoading || _gmapsLoaded) return;
  _gmapsLoading = true;

  (window as Record<string, unknown>)['gmapsReady'] = function () {
    _gmapsLoaded  = true;
    _gmapsLoading = false;
    if (_pendingMap) { _pendingMap(); _pendingMap = null; }
    while (_readyCbs.length) { const cb = _readyCbs.shift(); try { cb?.(); } catch (e) {} }
  };

  // Google llama a window.gm_authFailure cuando la key no está autorizada (billing/API/restricciones).
  // Sin este handler, inyecta un overlay "This page can't load Google Maps correctly / ¿eres el dueño
  // de este sitio?". Lo interceptamos para no asustar al usuario y dejar registro claro en consola.
  (window as Record<string, unknown>)['gm_authFailure'] = function () {
    _authFailed = true;
    console.error('[gmaps] Autenticación fallida: revisar la API key (billing, APIs habilitadas — Maps JavaScript API + Places API — y restricciones de la key).');
    while (_readyCbs.length) { const cb = _readyCbs.shift(); try { cb?.(); } catch (e) {} } // desbloquea a quien espera (mostrará el fallback)
  };

  // libraries=places → habilita el autocompletado de direcciones (Autocomplete) del Planificador.
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&callback=gmapsReady&loading=async&libraries=places`;
  s.async = true; s.defer = true;
  s.onerror = () => { _gmapsLoading = false; };
  document.head.appendChild(s);
}

/** Ejecuta `cb` cuando la API de Google Maps ya está cargada (ahora si ya lo está, o al terminar
 *  de cargar). La usa el autocompletado para adjuntarse recién cuando `google.maps.places` existe. */
export function onGmapsReady(cb: () => void) {
  if (typeof window === 'undefined') return;
  if (_authFailed) { cb(); return; }              // auth ya falló → resolver ya (el caller muestra el fallback)
  if (_gmapsLoaded && gm()) { cb(); return; }
  _readyCbs.push(cb);
  cargarGMaps();
}

interface DibMapaParams {
  el: HTMLElement;
  rutas: Ruta[];
  gps: Record<string, number[]>;
  cd: number[];
  tiendas: Record<string, TiendaInfo>;
  mapRef: React.MutableRefObject<unknown>;
  overlaysRef: React.MutableRefObject<unknown[]>;
  cdGeocodedRef: React.MutableRefObject<{lat: number; lng: number} | null>;
  onKmReady?: (kmPorRuta: Record<number, number>, legData: Record<number, {dist: string; dur: string; durSec?: number}[]>) => void;
  /**
   * Con qué reloj calcular la hora de llegada de cada parada. Sin esto, la tarjeta del pin sigue
   * mostrando lo de siempre (distancia y duración del tramo) pero no la hora — que es el dato que
   * de verdad decide si esa parada está bien puesta.
   *
   * Se calcula acá y no en el padre a propósito: el mapa ya tiene los tiempos REALES por calle que
   * devolvió Directions, que son mejores que cualquier estimación.
   */
  getHorario?: () => { salidaMin: number; servicioMin: number } | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gm = () => (window as any).google?.maps;

export function dibMapa({ el, rutas, gps, cd, tiendas, mapRef, overlaysRef, cdGeocodedRef, onKmReady, getHorario }: DibMapaParams) {
  if (!_gmapsLoaded || !gm()) {
    _pendingMap = () => dibMapa({ el, rutas, gps, cd, tiendas, mapRef, overlaysRef, cdGeocodedRef, onKmReady, getHorario });
    cargarGMaps();
    return;
  }
  if (!el) return;
  // El alto lo controla el contenedor (panel fijo de MapSection, flex-1) — antes se
  // forzaba a 420px, lo que pisaba cualquier CSS pensado para llenar el panel.
  el.style.height = '100%';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const G = gm() as any;
  const cdLL = { lat: cd[0], lng: cd[1] };
  const COLORS = COLS;

  if (!mapRef.current) {
    mapRef.current = new G.Map(el, {
      center: cdLL, zoom: 11,
      mapTypeId: G.MapTypeId.ROADMAP,
      styles: [
        {featureType:'poi',stylers:[{visibility:'off'}]},
        {featureType:'poi.business',stylers:[{visibility:'off'}]},
        {featureType:'transit',stylers:[{visibility:'simplified'}]},
      ],
      zoomControl: true, streetViewControl: false, mapTypeControl: true, fullscreenControl: true,
    });
  }

  (overlaysRef.current || []).forEach(o => { try { (o as {setMap:(v:null)=>void}).setMap(null); } catch(e) {} });
  overlaysRef.current = [];

  const gmap    = mapRef.current as {fitBounds:(b:unknown,p:unknown)=>void};
  const bounds  = new G.LatLngBounds();
  const infoWin = new G.InfoWindow();
  const dirSvc  = new G.DirectionsService();

  const cdSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">'
    + '<circle cx="18" cy="18" r="14" fill="#D42B2B" stroke="white" stroke-width="2.5"/>'
    + '<circle cx="18" cy="18" r="5" fill="white" opacity="0.9"/></svg>';

  function crearMarcadorCD(pos: {lat:number;lng:number}) {
    const cdM = new G.Marker({
      position: pos, map: gmap, zIndex: 9999,
      icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(cdSvg), scaledSize: new G.Size(36,36), anchor: new G.Point(18,18) },
      title: 'CD KiosClub — Juan Elías 1701, Recoleta',
    });
    cdM.addListener('click', () => {
      infoWin.setContent(`<div style="font-family:-apple-system,sans-serif;padding:4px"><b style="color:#D42B2B">CD KiosClub</b><br><span style="font-size:12px;color:#444">Juan Elías 1701, Recoleta</span></div>`);
      infoWin.open(gmap, cdM);
    });
    overlaysRef.current.push(cdM);
    bounds.extend(pos);
  }

  if (cdGeocodedRef.current) {
    crearMarcadorCD(cdGeocodedRef.current);
  } else {
    const geocoder = new G.Geocoder();
    geocoder.geocode({ address: 'Juan Elías 1701, Recoleta, Santiago, Chile' }, (results: unknown[], status: string) => {
      if (status === 'OK' && results[0]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loc = (results[0] as any).geometry.location;
        cdGeocodedRef.current = { lat: loc.lat(), lng: loc.lng() };
        cd[0] = loc.lat(); cd[1] = loc.lng();
      } else {
        cdGeocodedRef.current = cdLL;
      }
      crearMarcadorCD(cdGeocodedRef.current!);
    });
  }

  let sp = document.getElementById('mapSp');
  if (!sp) {
    sp = document.createElement('div'); sp.id = 'mapSp';
    sp.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:rgba(13,17,23,0.92);color:#fff;padding:10px 18px;border-radius:12px;font-family:-apple-system,sans-serif;font-size:12px;z-index:200;pointer-events:none;display:flex;align-items:center;gap:9px;box-shadow:0 4px 20px rgba(0,0,0,0.4);white-space:nowrap;max-width:90%;';
    el.style.position = 'relative';
    el.appendChild(sp);
  }

  const rutasConGPS = rutas.filter(r => r.ts.some(t => gps[t.c]));
  let total = rutasConGPS.length, done = 0;
  const kmPorRuta: Record<number, number> = {};
  const legDataPorRuta: Record<number, {dist: string; dur: string; durSec?: number}[]> = {};

  function actualizarSpinner() {
    if (!sp) return;
    if (done >= total) { sp.style.display = 'none'; }
    else {
      sp.style.display = 'flex';
      sp.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;font-size:16px">&#8635;</span>Calculando rutas reales por calles... (${done}/${total})`;
    }
  }

  if (total === 0) { if (sp) sp.style.display = 'none'; return; }
  actualizarSpinner();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function dibujarMarcadores(r: Ruta, ri: number, col: string, tGPS: {c:string;p:number;b:number}[], legs: any[] | null, esReal: boolean) {
    // Hora de llegada de cada parada, con los tiempos REALES por calle que acaba de devolver
    // Directions. `calcularETAs` ya contempla que el camión espere si llega antes de que la tienda
    // abra (#459), así que la hora que se muestra es la de descarga, no la de quedarse en la puerta.
    const ventanas = tGPS.map(t => tiendas[t.c]?.v);
    const calcularHorario = () => {
      const h = getHorario?.();
      if (!h || !legs || !legs.length) return null;
      const legSec = legs.map((l: {duration?:{value?:number}}) => l?.duration?.value ?? 0);
      return { etas: calcularETAs(legSec, h.salidaMin, h.servicioMin, ventanas), servicioMin: h.servicioMin };
    };

    tGPS.forEach((t, i) => {
      const pos = { lat: gps[t.c][0], lng: gps[t.c][1] };
      const inf  = tiendas[t.c];
      const leg  = legs ? legs[i] : null;
      // El pin dice DOS cosas: que la parada es una tienda (el glifo) y en qué lugar de la ruta va
      // (el número, en un disco blanco que se lee sobre cualquier color de ruta).
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="43" viewBox="0 0 34 43">`
        + `<path d="M17 0C7.6 0 0 7.6 0 17c0 6.4 3.5 12 8.7 15L17 43l8.3-11C30.5 29 34 23.4 34 17 34 7.6 26.4 0 17 0z" fill="${col}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>`
        + `<path d="M9.5 19h15 M9.5 19v-6l7.5-5 7.5 5v6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>`
        + `<circle cx="17" cy="27.5" r="6.4" fill="#fff"/>`
        + `<text x="17" y="28" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="9" font-weight="bold" fill="${col}">${i+1}</text>`
        + `</svg>`;
      const mk = new G.Marker({
        position: pos, map: gmap, zIndex: ri*100+i+10,
        icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new G.Size(34,43), anchor: new G.Point(17,43) },
        // La patente en el tooltip: es el desempate definitivo cuando dos rutas tienen colores
        // parecidos (ver el comentario de COLS).
        title: `${t.c} · ${inf ? inf.n : ''}${r.v?.p ? ` · ${r.v.p}` : ''}`,
      });
      mk.addListener('click', () => {
        const di  = leg ? leg.distance.text : '';
        const du  = leg ? leg.duration.text : '';
        const displayCode = t.c.startsWith('_P') ? t.c.replace(/^_/, '') : t.c;
        const isParadaStop = t.c.startsWith('_P');
        infoWin.setContent(
          `<div style="font-family:-apple-system,sans-serif;padding:6px 4px;min-width:180px">`
          + `<div style="font-weight:700;font-size:14px;color:${col}">${displayCode}${isParadaStop ? (inf?._tipo === 'entrega' ? ' · Entrega' : ' · Retiro') : ''}</div>`
          + `<div style="font-size:13px;font-weight:600;color:#1c1c1e">${inf?inf.n:''}</div>`
          + (inf?.d ? `<div style="font-size:11px;color:#888;margin-top:2px">${inf.d}</div>` : '')
          + (inf?._desc ? `<div style="font-size:11px;color:#888;margin-top:2px">${inf._desc}</div>` : '')
          + (!isParadaStop && inf?.v ? `<div style="font-size:11px;color:#888;margin-top:2px">Ventana: ${inf.v}</div>` : '')
          + `<div style="font-size:12px;color:#444;margin-top:4px">Carga: ${t.p}P${t.b?' + '+t.b+'B':''}${r.v?.p ? ` · ${r.v.p}` : ''}</div>`
          + (() => {
              const hr = calcularHorario();
              if (!hr) return '';
              const llegada = hr.etas[i];
              const est = estadoVentana(llegada, ventanas[i]);
              const salida = llegada + hr.servicioMin;
              const aviso = est === 'tarde'
                ? `<div style="margin-top:5px;font-size:11px;font-weight:600;color:#B3302A">⚠ Llega después del cierre (${inf?.v})</div>`
                : est === 'temprano'
                ? `<div style="margin-top:5px;font-size:11px;color:#9A6B14">Llega antes de que abra — espera hasta ${inf?.v?.split('-')[0]?.trim() ?? ''}</div>`
                : '';
              return `<div style="background:#f5f5f7;border-radius:6px;padding:6px 8px;margin-top:6px">`
                + `<div style="font-size:12px;color:#1c1c1e;font-weight:600">Llega ${minAHHMM(llegada)} · sale ${minAHHMM(salida)}</div>`
                + aviso + `</div>`;
            })()
          + (di ? `<div style="background:#f5f5f7;border-radius:6px;padding:5px 8px;margin-top:6px"><div style="font-size:11px;color:#3a3a3c;font-weight:600">${di} · ${du}</div></div>` : '')
          + (esReal ? `<div style="font-size:10px;color:#34C759;margin-top:4px;font-weight:600">✓ Ruta real (Google Maps)</div>` : `<div style="font-size:10px;color:#ff9500;margin-top:4px">⚠ Distancia aprox.</div>`)
          + `</div>`
        );
        infoWin.open(gmap, mk);
      });
      overlaysRef.current.push(mk);
    });
  }

  function dibujarFallback(r: Ruta, ri: number, col: string, tGPS: {c:string;p:number;b:number}[]) {
    const path = [cdLL];
    tGPS.forEach(t => { path.push({lat:gps[t.c][0],lng:gps[t.c][1]}); bounds.extend({lat:gps[t.c][0],lng:gps[t.c][1]}); });
    const poly = new G.Polyline({
      path, map: gmap, strokeColor: col, strokeWeight: 3, strokeOpacity: 0.5,
      icons: [{icon:{path:G.SymbolPath.FORWARD_CLOSED_ARROW,scale:3,strokeColor:col,strokeWeight:2},offset:'60%',repeat:'80px'}],
    });
    overlaysRef.current.push(poly);
    let kmFall = 0, prev = cd;
    tGPS.forEach(t => { const g=gps[t.c]; if(g){kmFall+=dkm(prev,g);prev=g;} });
    kmPorRuta[ri] = Math.round(kmFall*10)/10;
    dibujarMarcadores(r, ri, col, tGPS, null, false);
  }

  function llamarDirections(r: Ruta, ri: number, col: string, tGPS: {c:string;p:number;b:number}[], origin: unknown, dest: unknown, wpts: unknown[], intento: number) {
    const hasCUR = tGPS.some(t => t.c === 'CUR');
    const hasBNV = tGPS.some(t => t.c === 'BNV' || t.c === 'BN2');
    if (hasCUR && hasBNV) { done++; actualizarSpinner(); if (done >= total) terminar(); return; }

    dirSvc.route({
      origin, destination: dest, waypoints: wpts,
      travelMode: G.TravelMode.DRIVING,
      optimizeWaypoints: false, region: 'cl',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, (result: any, status: string) => {
      if (status === G.DirectionsStatus.OK) {
        const renderer = new G.DirectionsRenderer({
          map: gmap, directions: result, suppressMarkers: true, suppressInfoWindows: true,
          polylineOptions: { strokeColor: col, strokeWeight: 5, strokeOpacity: 0.88 },
        });
        overlaysRef.current.push(renderer);
        const legs = result.routes[0].legs;
        let kmTotal = 0; legs.forEach((l: {distance:{value:number}}) => { kmTotal += l.distance.value; });
        kmPorRuta[ri] = Math.round(kmTotal / 100) / 10;
        legDataPorRuta[ri] = legs.map((l: {distance:{text:string};duration:{text:string;value:number}}) => ({ dist: l.distance.text, dur: l.duration.text, durSec: l.duration.value }));
        legs.forEach((l: {steps:{start_location:unknown}[];end_location:unknown}) => { l.steps.forEach(s => bounds.extend(s.start_location)); bounds.extend(l.end_location); });
        dibujarMarcadores(r, ri, col, tGPS, legs, true);
        done++; actualizarSpinner(); if (done >= total) terminar();
      } else if (status === G.DirectionsStatus.OVER_QUERY_LIMIT && intento < 5) {
        setTimeout(() => llamarDirections(r, ri, col, tGPS, origin, dest, wpts, intento+1), 700 * intento);
      } else {
        dibujarFallback(r, ri, col, tGPS);
        done++; actualizarSpinner(); if (done >= total) terminar();
      }
    });
  }

  function terminar() {
    if (!bounds.isEmpty()) gmap.fitBounds(bounds, {top:50,right:30,bottom:30,left:30});
    if (typeof onKmReady === 'function') onKmReady(kmPorRuta, legDataPorRuta);
  }

  let staggerIdx = 0;
  rutas.forEach((r, ri) => {
    const col  = COLORS[ri % COLORS.length];
    const tGPS = r.ts.filter(t => gps[t.c]);
    if (!tGPS.length) return;
    const origin = cdLL;
    const dest   = { lat: gps[tGPS[tGPS.length-1].c][0], lng: gps[tGPS[tGPS.length-1].c][1] };
    const wpts   = tGPS.slice(0,-1).map(t => ({ location:{lat:gps[t.c][0],lng:gps[t.c][1]}, stopover:true }));
    setTimeout(() => llamarDirections(r, ri, col, tGPS, origin, dest, wpts, 1), staggerIdx++ * 300);
  });
}
