'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { fmtFechaHoraChile } from '@/lib/fechaChile';
import { resumenDiferencia } from './recepcionDiff';

type Row = Record<string, unknown>;

// ── Recepcion detail modal (compartido por /despacho/estado y /registros) ───────
// Fuente única del diseño (#240): navy + tokens del tema, 2 columnas, comparativa por unidad,
// acuse, personal, sellos, fotos, historial de ediciones y OTP. Antes /registros tenía una copia
// desactualizada (colores viejos) → drift; ahora ambos usan este.
function PhotoThumb({ url, label, hora }: { url: string; label: string; hora?: string }) {
  if (!url) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
        <img src={url} alt={label} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
        {hora && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 6px', fontSize: 10, color: '#fff', fontWeight: 700 }}>🕐 {hora}</div>}
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '2px 6px', fontSize: 10, color: '#fff' }}>↗</div>
      </a>
    </div>
  );
}

export function RecepcionModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const match       = !resumenDiferencia(row).hayDiferencia;
  // Comparativa por unidad (Pallets / Bultos / Contenedores). Se muestra una fila si hubo
  // ENVIADO o RECIBIDO > 0 → así aparecen también las diferencias donde lo enviado era 0
  // (antes se ocultaban los bultos/contenedores si `sent === 0`).
  const lineasCant = ([
    { label: 'Pallets',      sent: Number(row.pallets_sent ?? 0),      rec: Number(row.pallets_recibidos ?? 0) },
    { label: 'Bultos',       sent: Number(row.bultos_sent ?? 0),       rec: Number(row.bultos_recibidos ?? 0) },
    { label: 'Contenedores', sent: Number(row.contenedores_sent ?? 0), rec: Number(row.contenedores_recibidos ?? 0) },
  ]).filter(l => l.sent > 0 || l.rec > 0);
  const estadoFotos    = (row.estado_fotos as string[]) ?? [];
  const recepcionFotos = (row.recepcion_fotos as string[]) ?? [];
  const fechaHora   = row.created_at ? fmtFechaHoraChile(String(row.created_at)) : '—';
  const historial = (row.historial_ediciones as { ts: string; receptor: string; rut: string; cambios: { campo: string; de: unknown; a: unknown }[] }[] | null) ?? [];

  // Paleta del tema (index.css) — para que el modal matchee el resto de la app.
  const C = {
    navy: '#1B2A6B', done: '#36996A', partial: '#C2873A', danger: '#D42B2B',
    text: '#1C1C1E', text2: '#3A3A3C', text3: '#8E8E93', border: '#D8DCE6', bg2: '#F7F8FB',
  };
  const secTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, overflowY: 'auto', padding: '20px 16px 40px' }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 700, margin: '0 auto', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.38)' }}>

        <div style={{ background: 'linear-gradient(135deg,#1B2A6B,#2D3F8C)', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Detalle recepción</div>
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>{String(row.cod ?? '')}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: 600, marginTop: 4 }}>{String(row.tienda ?? '')}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{fechaHora}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} color="rgba(255,255,255,0.8)" />
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Fila superior 2 columnas: comparativa (izq) · acuse + personal (der) — aprovecha el ancho */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.12fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>

            <div style={{ background: match ? 'rgba(54,153,106,0.06)' : 'rgba(194,135,58,0.07)', borderRadius: 14, padding: 16, border: `1px solid ${match ? 'rgba(54,153,106,0.26)' : 'rgba(194,135,58,0.34)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 15, lineHeight: 1 }}>{match ? '✅' : '⚠️'}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: match ? C.done : C.partial }}>{match ? 'Sin diferencias' : 'Diferencia detectada'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr', gap: 6, fontSize: 9.5, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 7, borderBottom: `1px solid ${C.border}` }}>
                <div>Unidad</div><div style={{ textAlign: 'center' }}>Env.</div><div style={{ textAlign: 'center' }}>Rec.</div><div style={{ textAlign: 'center' }}>Dif.</div>
              </div>
              {lineasCant.map((l, i) => {
                const dif = l.rec - l.sent; const igual = dif === 0;
                return (
                  <div key={l.label} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr', gap: 6, alignItems: 'center', padding: '9px 0', borderBottom: i < lineasCant.length - 1 ? '1px solid rgba(15,23,42,0.05)' : 'none' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text2 }}>{l.label}</div>
                    <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: C.navy }}>{l.sent}</div>
                    <div style={{ textAlign: 'center', fontSize: 19, fontWeight: 800, color: igual ? C.done : C.danger }}>{l.rec}</div>
                    <div style={{ textAlign: 'center' }}>
                      {igual
                        ? <span style={{ fontSize: 13, color: '#CBD5E1' }}>—</span>
                        : <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: dif > 0 ? C.partial : C.danger, padding: '2px 9px', borderRadius: 99, whiteSpace: 'nowrap' }}>{dif > 0 ? '+' : ''}{dif}</span>}
                    </div>
                  </div>
                );
              })}
              {lineasCant.length === 0 && <div style={{ fontSize: 12, color: C.text3, paddingTop: 8 }}>Sin cantidades registradas.</div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!!row.acuse_recibo && (() => {
                const a = String(row.acuse_recibo);
                const ok = a.toLowerCase().includes('conforme') && !a.toLowerCase().includes('observ');
                return (
                  <div style={{ background: ok ? 'rgba(54,153,106,0.10)' : 'rgba(194,135,58,0.12)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: ok ? C.done : C.partial }}>{ok ? '✓' : '⚠'}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: ok ? C.done : C.partial }}>{a}</span>
                  </div>
                );
              })()}
              {!!row.receptor && <div style={{ background: C.bg2, borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: C.text3, fontWeight: 700, marginBottom: 2 }}>RECEPTOR</div><div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{String(row.receptor)}</div>{!!row.rut && <div style={{ fontSize: 11.5, color: C.text2, fontFamily: 'monospace', marginTop: 2 }}>{String(row.rut)}</div>}</div>}
              {!!row.conductor && <div style={{ background: C.bg2, borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: C.text3, fontWeight: 700, marginBottom: 2 }}>CONDUCTOR</div><div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{String(row.conductor)}</div></div>}
              {!!(row.pionetas && String(row.pionetas).trim()) && <div style={{ background: C.bg2, borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: C.text3, fontWeight: 700, marginBottom: 2 }}>PIONETA(S)</div><div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{String(row.pionetas)}</div></div>}
              {!!row.sello_estado && <div style={{ background: C.bg2, borderRadius: 10, padding: '10px 12px' }}><div style={{ fontSize: 10, color: C.text3, fontWeight: 700, marginBottom: 2 }}>ESTADO SELLO</div><div style={{ fontSize: 13, fontWeight: 700, color: row.sello_estado === 'intacto' ? C.done : C.danger }}>{String(row.sello_estado).charAt(0).toUpperCase() + String(row.sello_estado).slice(1)}</div></div>}
            </div>
          </div>

          {!!(row.sello_llegada_url || row.sello_salida_url || row.cd_salida_url) && <div>
            <div style={secTitle}>Trazabilidad de sellos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <PhotoThumb url={String(row.cd_salida_url ?? '')}     label="CD Salida"     hora={String(row.cd_salida_hora ?? '')} />
              <PhotoThumb url={String(row.sello_llegada_url ?? '')} label="Sello llegada" hora={String(row.sello_llegada_hora ?? '')} />
              <PhotoThumb url={String(row.sello_salida_url ?? '')}  label="Sello salida"  hora={String(row.sello_salida_hora ?? '')} />
            </div>
          </div>}

          {recepcionFotos.length > 0 && <div>
            <div style={secTitle}>Fotos de recepción ({recepcionFotos.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {recepcionFotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
                  <img src={url} alt={`recepción ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 5 }}>#{i + 1}</div>
                </a>
              ))}
            </div>
          </div>}

          {estadoFotos.length > 0 && <div>
            <div style={secTitle}>Fotos de estado ({estadoFotos.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {estadoFotos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', borderRadius: 10, overflow: 'hidden', textDecoration: 'none' }}>
                  <img src={url} alt={`estado ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 5 }}>#{i + 1}</div>
                </a>
              ))}
            </div>
          </div>}

          {!!row.firma_url && <div>
            <div style={secTitle}>Firma del receptor</div>
            <a href={String(row.firma_url)} target="_blank" rel="noopener noreferrer">
              <img src={String(row.firma_url)} alt="firma" style={{ width: '100%', maxHeight: 120, objectFit: 'contain', background: C.bg2, borderRadius: 10, border: `1px solid ${C.border}`, display: 'block' }} />
            </a>
          </div>}

          {!!(row.observaciones && String(row.observaciones).trim()) && <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '12px 14px', border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Observaciones</div>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>{String(row.observaciones)}</div>
          </div>}

          {historial.length > 0 && <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>✎ Historial de ediciones ({historial.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historial.map((e, i) => (
                <div key={i} style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#6B21A8' }}>{e.receptor || '—'}{e.rut ? <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#9333EA', marginLeft: 6 }}>{e.rut}</span> : null}</span>
                    <span style={{ fontSize: 10, color: '#A78BDA' }}>{e.ts ? fmtFechaHoraChile(e.ts) : ''}</span>
                  </div>
                  {Array.isArray(e.cambios) && e.cambios.length > 0 && (
                    <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {e.cambios.map((c, j) => (
                        <div key={j} style={{ fontSize: 11.5, color: '#4C1D6B' }}>
                          <strong>{c.campo}:</strong> <span style={{ color: '#9CA3AF' }}>{c.de == null || c.de === '' ? '—' : String(c.de)}</span> → <strong>{c.a == null || c.a === '' ? '—' : String(c.a)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>}

          {!!row.codigo_verificacion && <div style={{ background: '#F0F4FF', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1B2A6B', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Código OTP verificado</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1B2A6B', fontFamily: 'monospace', letterSpacing: '0.3em' }}>{String(row.codigo_verificacion)}</div>
          </div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
