'use client';
import { useSantiago } from '../context/SantiagoContext';
import { StepRegimen } from '../steps/StepRegimen';
import { StepForm }    from '../steps/StepForm';

export function SantiagoPage() {
  const { state } = useSantiago();

  // La fecha de armado/despacho se muestra dentro de la columna izquierda de StepForm
  // (igual que en Regiones), no como una barra a todo el ancho.
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-bg">
      {state.step === 'regimen' && <StepRegimen />}
      {state.step === 'form'    && <StepForm />}
    </div>
  );
}
