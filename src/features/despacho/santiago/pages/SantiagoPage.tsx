'use client';
import { StepForm } from '../steps/StepForm';

export function SantiagoPage() {
  // Ya no hay paso de selección de Régimen (siempre 'Seco'): se entra directo a la bodega.
  // La fecha de armado/despacho se muestra dentro de la columna izquierda de StepForm.
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-bg">
      <StepForm />
    </div>
  );
}
