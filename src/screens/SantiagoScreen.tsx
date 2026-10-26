'use client';

import { useState, useEffect } from 'react';
import { SantiagoProvider, useSantiago, SANTIAGO_TERMINADO_KEY } from '../features/despacho/santiago/context/SantiagoContext';
import { SantiagoPage } from '../features/despacho/santiago/pages/SantiagoPage';
import { SantiagoFinishModal } from '../features/despacho/santiago/components/SantiagoFinishModal';
import { PendingDraftBanner } from '../features/despacho/shared/PendingDraftBanner';
import { confirmar } from '../features/despacho/shared/confirmar';
import { BodegaHeader } from '../features/despacho/shared/BodegaHeader';
import { BandaDiaDeTrabajo } from '../features/despacho/shared/BandaDiaDeTrabajo';
import { diaDeTrabajoActual, diaDeTrabajoEsDeliberado } from '../features/despacho/shared/diaDeTrabajoActual';


// El día que esta pantalla trabaja y si lo eligió alguien. Ver `diaDeTrabajo.ts`.
const DIA = diaDeTrabajoActual();
const DIA_ELEGIDO = diaDeTrabajoEsDeliberado();

function SantiagoContent() {
  const { state, dispatch } = useSantiago();
  const [modalOpen,    setModalOpen]    = useState(false);
  const [terminated,   setTerminated]   = useState(false);
  const [terminatedAt, setTerminatedAt] = useState('');

  useEffect(() => {
    const val = localStorage.getItem(SANTIAGO_TERMINADO_KEY);
    if (val) { setTerminated(true); setTerminatedAt(val); }
  }, []);

  // Sync terminated state when modal closes after finishing
  useEffect(() => {
    if (!modalOpen) {
      const val = localStorage.getItem(SANTIAGO_TERMINADO_KEY);
      if (val) { setTerminated(true); setTerminatedAt(val); }
    }
  }, [modalOpen]);

  // #8: registrado puede venir del modal o de StepResumen (flag sincronizado) o del
  // badge local TERMINADO. Cualquiera marca el header como COMPLETADO → evita re-registro.
  const registered = terminated || state.registrado === true;

  const handleReopen = async () => {
    if (!(await confirmar({ titulo: '¿Reabrir el despacho del día?', detalle: 'Podrás modificar y volver a registrar.', aceptar: 'Reabrir' }))) return;
    localStorage.removeItem(SANTIAGO_TERMINADO_KEY);
    setTerminated(false);
    setTerminatedAt('');
    dispatch({ type: 'SET_REGISTRADO', payload: false });
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* El banner navy "BODEGA" se eliminó (más espacio hacia arriba); el REGISTRAR se movió
          al pie de la columna derecha de StepForm (igual que Nacional). */}
      <BodegaHeader />
      {DIA_ELEGIDO && <BandaDiaDeTrabajo dia={DIA} ruta="/despacho/santiago" />}

      <PendingDraftBanner fuente="santiago" />

      <SantiagoPage
        onRegistrar={() => setModalOpen(true)}
        registered={registered}
        onReopen={handleReopen}
        terminatedAt={terminatedAt}
      />

      <SantiagoFinishModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export function SantiagoScreen() {
  return (
    <SantiagoProvider>
      <SantiagoContent />
    </SantiagoProvider>
  );
}
