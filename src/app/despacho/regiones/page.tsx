'use client';

// Bodega Nacional se monta SOLO en el navegador. Mismo motivo que RM/Costa: el día de trabajo
// sale de la URL y el servidor no la ve. Ver `despacho/santiago/page.tsx`.

import dynamic from 'next/dynamic';

const AppScreen = dynamic(
  () => import('../../../screens/AppScreen').then(m => m.AppScreen),
  { ssr: false },
);

export default function RegionesPage() {
  return <AppScreen />;
}
