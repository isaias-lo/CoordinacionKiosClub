import type { MetadataRoute } from 'next';

/**
 * Manifest de la PWA — se sirve en `/manifest.webmanifest`.
 *
 * Existe para que bodega y los conductores puedan instalarla en la pantalla de inicio y abrirla
 * sin la barra del navegador. Hoy la abren como una pestaña más: se pierde entre otras diez, y en
 * una tablet apoyada en el pallet la barra de direcciones se come casi un centímetro de pantalla.
 *
 * Se sirve estático: no depende de la sesión ni cambia entre despliegues, así que no tiene por qué
 * gastar una invocación de función por cada dispositivo que lo pide.
 */
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'KiosClub Despacho',
    short_name: 'KiosClub',
    description: 'Despacho KiosClub: picking, rutas, flota y recepción en tienda.',
    lang: 'es-CL',
    dir: 'ltr',
    scope: '/',

    // Raíz a propósito: el middleware ya manda a cada usuario al home de su rol (`roleHome()` en
    // src/middleware.ts), así que el conductor abre el ícono y cae en su panel, y bodega en el suyo,
    // sin necesidad de una instalación distinta por perfil.
    start_url: '/',

    display: 'standalone',

    // Sin `orientation`: bodega trabaja con la tablet apoyada en horizontal y los conductores usan
    // el teléfono en vertical. Fijar una obligaría a la mitad del equipo a girar la pantalla.

    // El mismo azul con el que arranca el degradado de la barra superior (`--gradient-dark-h` en
    // src/index.css), para que la barra de estado del sistema se vea continua con el encabezado de
    // la app. Vale para los dos temas: ese encabezado es oscuro también en modo claro.
    theme_color: '#0D1829',

    // Fondo del splash. Blanco, igual que el fondo de los íconos, así el logo no queda recortado
    // sobre un cuadro de otro color mientras carga.
    background_color: '#FFFFFF',

    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Android recorta el ícono a un círculo del 80% del lienzo. El `any` se vería con el logo
      // mordido en los bordes; este trae el logo al 66% para que entre entero.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
