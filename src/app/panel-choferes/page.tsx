'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function PanelChoferesPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const paths = profile?.allowedPaths ?? [];
  const canSee = (p: string) => paths.includes('*') || paths.includes(p);

  const esConductor = !!(profile?.allowedPaths ?? []).includes('/panel-choferes')
    && !(profile?.allowedPaths ?? []).includes('*')
    && !(profile?.allowedPaths ?? []).includes('/despacho');

  function goBack() {
    if (canSee('/despacho'))     { router.push('/despacho');     return; }
    router.push('/');
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: 'linear-gradient(160deg, #0f172a 0%, #1a2550 100%)', position: 'relative' }}>

      {/* Back button */}
      {!esConductor && (
        <button
          onClick={goBack}
          style={{
            position: 'absolute', top: 20, left: 20,
            width: 38, height: 38, borderRadius: 12,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          ‹
        </button>
      )}

      {/* Branding */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color: '#C62828', letterSpacing: -1 }}>
          KIOS<span style={{ fontStyle: 'italic' }}>Club</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 3 }}>
          Panel Choferes
        </div>
      </div>

      {/* Tile — Hub Conductor (solo si tiene acceso) */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        {canSee('/conductor-hub') ? (
          <button
            onClick={() => router.push('/conductor-hub')}
            style={{
              width: '100%', padding: '28px 22px', border: '1.5px solid rgba(251,146,60,0.4)',
              borderRadius: 20, background: 'rgba(251,146,60,0.10)', cursor: 'pointer',
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 18,
              boxShadow: '0 4px 24px rgba(251,146,60,0.12)',
              transition: 'transform 0.15s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(251,146,60,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
              🚚
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Hub Conductor</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                Mi ruta del día · Guías DTE<br/>Entregar en tienda · Escaneo
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 20, color: 'rgba(255,255,255,0.2)' }}>›</div>
          </button>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>
            Sin módulos asignados. Contacta al administrador.
          </p>
        )}
      </div>

      <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11, marginTop: 32, textAlign: 'center' }}>
        Ingresa con la patente de tu vehículo
      </p>
    </div>
  );
}
