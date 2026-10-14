'use client';

// Bodega RM/Costa se monta SOLO en el navegador.
//
// El día de trabajo sale de `?dia=` de la URL y se fija al cargar el módulo (ver
// `diaDeTrabajoActual`). En el servidor no hay URL que leer: con render de servidor, el HTML
// diría «hoy» y el cliente diría otro día, y React avisaría de la discordancia justo en la
// fecha, que es lo único que no puede verse mal. Es lo mismo que ya hace el Enrutador.

import dynamic from 'next/dynamic';

const SantiagoScreen = dynamic(
  () => import('../../../screens/SantiagoScreen').then(m => m.SantiagoScreen),
  { ssr: false },
);

export default function SantiagoPage() {
  return <SantiagoScreen />;
}
