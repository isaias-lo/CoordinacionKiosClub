'use client';
import { useSantiago } from '../context/SantiagoContext';
import { StepRegimen } from '../steps/StepRegimen';
import { StepForm }    from '../steps/StepForm';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tomorrowISO() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function SantiagoPage() {
  const { state, dispatch } = useSantiago();
  const today    = todayISO();
  const fechaDespacho = state.fechaDespacho ?? tomorrowISO();

  const todayLabel = new Date(today + 'T12:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-bg">

      {/* Fecha de armado / despacho */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--border, #E2E5EC)',
        background: '#fff', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            Armado
          </span>
          <span style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>{todayLabel}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
            Fecha de despacho
          </span>
          <input
            type="date"
            value={fechaDespacho}
            min={today}
            onChange={e => dispatch({ type: 'SET_FECHA_DESPACHO', payload: e.target.value })}
            style={{
              border: '1.5px solid #dde3f0', borderRadius: 7, padding: '2px 8px',
              fontSize: 12, fontWeight: 700, color: '#1a2550', background: '#fff',
            }}
          />
        </div>
        {state.registrado && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, color: '#16A34A', fontWeight: 700,
            background: '#dcfce7', border: '1px solid #86efac', borderRadius: 20, padding: '2px 8px',
          }}>
            ✓ Registrado
          </span>
        )}
      </div>

      {state.step === 'regimen' && <StepRegimen />}
      {state.step === 'form'    && <StepForm />}
    </div>
  );
}
