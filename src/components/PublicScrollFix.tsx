/**
 * Habilita el scroll en páginas PÚBLICAS que se renderizan SIN el shell de la app
 * (recepción por QR, galería de fotos, manifiesto del fiscalizador).
 *
 * El CSS global (`src/index.css`) fija `html, body { height: 100%; overflow: hidden }`
 * porque el shell de la app maneja su propio scroll interno. Las páginas públicas NO montan
 * ese shell, así que sin anular esa regla el contenido largo (muchas fotos, manifiesto
 * completo) queda cortado y no se puede scrollear.
 *
 * Es un `<style>` (no un useEffect) para que aplique desde el PRIMER render (incluido SSR),
 * sin parpadeo ni dependencia de JS; React lo remueve solo al desmontar.
 */
export function PublicScrollFix() {
  return <style>{`html,body{overflow:auto!important;height:auto!important;}`}</style>;
}
