'use client';

import { useState } from 'react';
import { BodegaHeader } from '../features/despacho/shared/BodegaHeader';
import { FinishModal } from '../components/modals/FinishModal';
import { TiendasPage } from '../features/despacho/regiones/pages/TiendasPage';
import { PendingDraftBanner } from '../features/despacho/shared/PendingDraftBanner';
import { BandaDiaDeTrabajo } from '../features/despacho/shared/BandaDiaDeTrabajo';
import { diaDeTrabajoActual, diaDeTrabajoEsDeliberado } from '../features/despacho/shared/diaDeTrabajoActual';


// El día que esta pantalla trabaja y si lo eligió alguien. Ver `diaDeTrabajo.ts`.
const DIA = diaDeTrabajoActual();
const DIA_ELEGIDO = diaDeTrabajoEsDeliberado();

export function AppScreen() {
  const [finishOpen, setFinishOpen] = useState(false);

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* El botón "Registrar" se movió al pie del resumen (ResumenPage), ya no vive en el header. */}
      <BodegaHeader />
      {DIA_ELEGIDO && <BandaDiaDeTrabajo dia={DIA} ruta="/despacho/regiones" />}

      <PendingDraftBanner fuente="regiones" />

      <div className="flex-1 overflow-hidden flex flex-col">
        <TiendasPage onRegistrar={() => setFinishOpen(true)} />
      </div>

      <FinishModal open={finishOpen} onClose={() => setFinishOpen(false)} />
    </div>
  );
}
