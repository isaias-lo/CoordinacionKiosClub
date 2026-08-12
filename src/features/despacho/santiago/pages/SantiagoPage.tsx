'use client';
import { StepForm } from '../steps/StepForm';

type SantiagoPageProps = {
  onRegistrar?: () => void;
  registered?: boolean;
  onReopen?: () => void;
  terminatedAt?: string;
};

export function SantiagoPage({ onRegistrar, registered, onReopen, terminatedAt }: SantiagoPageProps = {}) {
  // Ya no hay paso de selección de Régimen (siempre 'Seco'): se entra directo a la bodega.
  // La fecha de armado/despacho se muestra dentro de la columna izquierda de StepForm.
  // El REGISTRAR se movió al pie de la columna derecha de StepForm (props abajo).
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-bg">
      <StepForm onRegistrar={onRegistrar} registered={registered} onReopen={onReopen} terminatedAt={terminatedAt} />
    </div>
  );
}
