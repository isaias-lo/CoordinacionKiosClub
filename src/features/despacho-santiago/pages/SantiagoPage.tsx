import { useSantiago } from '../context/SantiagoContext';
import { StepRegimen } from '../steps/StepRegimen';
import { StepForm }    from '../steps/StepForm';

export function SantiagoPage() {
  const { state } = useSantiago();

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-bg">
      {state.step === 'regimen' && <StepRegimen />}
      {state.step === 'form'    && <StepForm />}
    </div>
  );
}
