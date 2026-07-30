import { supabaseServer } from '@/lib/supabaseServer';
import { parseRecepcionId } from '@/lib/recepcionMedia';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import { PublicScrollFix } from '@/components/PublicScrollFix';

// Lee la fila de recepción por request → siempre dinámica.
export const dynamic = 'force-dynamic';

const NAVY = '#1a2550';

function fmtFecha(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CL', {
      timeZone: 'America/Santiago', hour12: false,
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", color: '#0F172A' }}>
      <PublicScrollFix />
      <div style={{ background: NAVY, padding: '18px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 640, margin: '0 auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '8px 12px', flexShrink: 0, boxShadow: '0 3px 12px rgba(0,0,0,0.28)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-kiosclub-email.webp" alt="KIOS Club" style={{ height: 36, width: 'auto', display: 'block' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', lineHeight: 1.08 }}>Fotos de recepción</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4, fontWeight: 500 }}>Evidencia de la carga recibida · KiosClub</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 16px 40px', maxWidth: 640, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function Aviso({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 28, textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
      <div style={{ fontSize: 42, marginBottom: 12 }}>📷</div>
      <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{titulo}</p>
      <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 8 }}>{detalle}</p>
    </div>
  );
}

export default async function GaleriaRecepcionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recId = parseRecepcionId(id);

  if (!recId) {
    return <Shell><Aviso titulo="Enlace inválido" detalle="El enlace de la galería no es válido." /></Shell>;
  }

  const { data: row } = await supabaseServer()
    .from('recepcion')
    .select('id, cod, tienda, receptor, created_at, acuse_recibo, observaciones, recepcion_fotos')
    .eq('id', recId)
    .maybeSingle();

  if (!row) {
    return <Shell><Aviso titulo="No encontrado" detalle="No existe una recepción con este enlace." /></Shell>;
  }

  const fotos = (row.recepcion_fotos as string[] | null) ?? [];
  const acuse = String(row.acuse_recibo ?? '');
  const conforme = acuse.toLowerCase().includes('conforme') && !acuse.toLowerCase().includes('observ');

  return (
    <Shell>
      {/* Ficha de la recepción */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 14 }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tienda</p>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: NAVY, lineHeight: 1, fontFamily: 'monospace' }}>{formatCod(String(row.cod ?? ''))}</p>
        <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{String(row.tienda ?? '')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
          {acuse && (
            <span style={{ background: conforme ? '#DCFCE7' : '#FEF3C7', color: conforme ? '#15803D' : '#B45309', fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 99 }}>
              {conforme ? '✓ ' : '⚠ '}{acuse}
            </span>
          )}
          {!!row.receptor && <span style={{ fontSize: 13, color: '#64748B' }}>Recibió: <strong style={{ color: '#334155' }}>{String(row.receptor)}</strong></span>}
        </div>
        {!!row.created_at && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94A3B8' }}>{fmtFecha(String(row.created_at))}</p>}
        {!!(row.observaciones && String(row.observaciones).trim()) && (
          <div style={{ marginTop: 12, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Observaciones</p>
            <p style={{ margin: 0, fontSize: 14, color: '#7C2D12', lineHeight: 1.5 }}>{String(row.observaciones)}</p>
          </div>
        )}
      </div>

      {/* Galería */}
      {fotos.length === 0 ? (
        <Aviso titulo="Sin fotos" detalle="Esta recepción no tiene fotos adjuntas." />
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {fotos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none', border: '1px solid #E2E8F0' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>#{i + 1}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
