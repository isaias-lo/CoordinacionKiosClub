// El tsconfig del proyecto trae la librería `dom`, que no conoce `ServiceWorkerGlobalScope`: ese
// tipo vive en `webworker`. Esta referencia la suma solo para este archivo, sin tocar el resto.
/// <reference lib="webworker" />

import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker de la app. Lo compila `@serwist/next` desde este archivo a `public/sw.js`.
 *
 * Para qué está: hoy, si alguien pierde señal en el patio y la pestaña se recarga, no queda nada —
 * ni la app. Las colas offline que ya existen (picking, conductor) guardan el TRABAJO, pero no
 * sirven de nada si no hay con qué abrir la pantalla donde estaba trabajando.
 *
 * ── Por qué NO se usa `defaultCache` de @serwist/next ──
 *
 * Esa lista trae dos reglas que en esta app serían un problema serio, no una optimización:
 *
 *  1. Cachea los GET de `/api/*` con NetworkFirst y `maxAgeSeconds: 1440 * 60`, o sea un día entero.
 *     Acá eso significa que alguien en bodega podría estar mirando los pallets de ayer creyendo que
 *     son los de hoy. El dato operativo de esta app cambia por minuto: servirlo viejo es peor que
 *     no servirlo.
 *
 *  2. Cachea el HTML y las respuestas RSC de las páginas, también por un día. Las tablets de bodega
 *     son COMPARTIDAS: se turnan varias personas en el mismo dispositivo. Una pantalla autenticada
 *     guardada en el caché del navegador puede terminar mostrándose después de que esa persona
 *     cerró sesión, a quien sea que agarre la tablet.
 *
 * Así que acá las reglas se escriben a mano, y la regla de fondo es simple: **se cachea lo que no
 * puede mentir** (el código y los assets, que llevan el hash en el nombre) y nada más. Los datos y
 * las pantallas siempre van a la red.
 */

const serwist = new Serwist({
  // Los assets de Next con hash en el nombre. Los inyecta el plugin en el build.
  precacheEntries: self.__SW_MANIFEST,

  // NO se salta la espera. Esta es la decisión central de este archivo.
  //
  // Casi toda receta de PWA trae `skipWaiting: true`: el service worker nuevo toma el control apenas
  // se instala y la pestaña se recarga sola. Acá eso sería un retroceso. `AvisoVersionNueva` existe
  // por lo del 11/09 (está escrito en src/lib/versionApp.ts): un arreglo entró a producción a las
  // 11:58 y a las 12:54 un equipo seguía con el código de la mañana. La regla que quedó de ahí es
  // que se AVISA y decide la persona, porque recargar sola a alguien a mitad de cargar un camión le
  // borra la pantalla en la que está trabajando.
  //
  // Entonces el service worker nuevo se queda en `waiting`, el aviso de siempre aparece, y recién
  // cuando la persona aprieta Recargar llega el mensaje SKIP_WAITING de acá abajo.
  skipWaiting: false,
  clientsClaim: true,

  navigationPreload: true,
  disableDevLogs: true,

  runtimeCaching: [
    // ── Nada de `/api/*` toca el caché, en ningún método ──
    // Explícito y primero, para que ninguna regla de más abajo pueda agarrarlo por accidente.
    {
      matcher: ({ url: { pathname }, sameOrigin }) => sameOrigin && pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },

    // ── Los assets de Next: nombre con hash, así que un acierto de caché no puede estar viejo ──
    {
      matcher: ({ url: { pathname }, sameOrigin }) => sameOrigin && pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },

    // ── El worker de PDF: 1.6 MB entre los dos archivos, y solo cambian con la versión ──
    // Es lo que se usa para leer los documentos de picking; bajarlo de nuevo con mala señal es
    // justo lo que hace que alguien se quede mirando una pantalla en blanco.
    {
      matcher: ({ url: { pathname }, sameOrigin }) => sameOrigin && /^\/pdf(\.worker)?\.min\.mjs$/.test(pathname),
      handler: new CacheFirst({
        cacheName: 'pdf-worker',
        plugins: [new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },

    // ── Iconos y logos de public/ ──
    {
      matcher: ({ url: { pathname }, sameOrigin }) => sameOrigin && /\.(?:png|webp|svg|ico|woff2?|ttf)$/.test(pathname),
      handler: new StaleWhileRevalidate({
        cacheName: 'assets-estaticos',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },

    // ── Todo lo demás (navegaciones, RSC, HTML) va a la red y NO se guarda ──
    // Cuando falla, el `fallbacks` de abajo responde con /offline. Ver el comentario del encabezado:
    // en una tablet compartida, una pantalla autenticada guardada en caché es un problema de verdad.
    {
      matcher: ({ sameOrigin }) => sameOrigin,
      handler: new NetworkOnly(),
    },
  ],

  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();

// El único camino por el que este service worker cede el paso al nuevo: que la persona haya
// apretado Recargar en el aviso de versión. Ver `activarVersionNueva()` en src/lib/sw/registrarSW.ts.
//
// Sí, está repetido: con `skipWaiting: false` Serwist registra por su cuenta un listener idéntico
// (se ve en el bundle compilado). Se deja igual, y a propósito. Es idempotente —llamar dos veces a
// skipWaiting no hace nada—, y si algún día Serwist cambia ese detalle interno, el botón Recargar
// dejaría de funcionar en silencio: la persona apretaría y seguiría con el código viejo, que es
// exactamente el problema que el aviso existe para evitar.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
