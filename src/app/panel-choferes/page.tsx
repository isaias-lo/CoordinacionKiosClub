'use client';
import { useRouter } from 'next/navigation';

export default function PanelChoferesPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1a2550 100%)' }}>

      {/* Branding */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: '#C62828', letterSpacing: -1 }}>
          KIOS<span style={{ fontStyle: 'italic' }}>Club</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 3 }}>
          Panel Choferes
        </div>
      </div>

      {/* Tiles */}
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Hub Conductor */}
        <button
          onClick={() => router.push('/conductor-hub')}
          style={{
            width: '100%', padding: '24px 22px', border: '1.5px solid rgba(251,146,60,0.4)',
            borderRadius: 20, background: 'rgba(251,146,60,0.10)', cursor: 'pointer',
            textAlign: 'left', display: 'flex', alignItems: 'center', gap: 18,
            boxShadow: '0 4px 24px rgba(251,146,60,0.12)',
            transition: 'transform 0.15s',
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(251,146,60,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
            🚚
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 3 }}>Hub Conductor</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              Mi ruta del día · QR de fiscalización<br/>Recepción en tienda
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 20, color: 'rgba(255,255,255,0.2)' }}>›</div>
        </button>

        {/* Conductores (vista histórica / coordinador) */}
        <button
          onClick={() => router.push('/tiendas')}
          style={{
            width: '100%', padding: '24px 22px', border: '1.5px solid rgba(168,85,247,0.4)',
            borderRadius: 20, background: 'rgba(168,85,247,0.10)', cursor: 'pointer',
            textAlign: 'left', display: 'flex', alignItems: 'center', gap: 18,
            boxShadow: '0 4px 24px rgba(168,85,247,0.12)',
            transition: 'transform 0.15s',
          }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(168,85,247,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
            🏪
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 3 }}>Conductores</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              Registro de entregas en tienda<br/>Supervisión y trazabilidad
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 20, color: 'rgba(255,255,255,0.2)' }}>›</div>
        </button>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, marginTop: 32, textAlign: 'center' }}>
        Selecciona la función que necesitas
      </p>
    </div>
  );
}
