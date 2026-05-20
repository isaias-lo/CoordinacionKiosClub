'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import { ProfilePill } from '../../components/ProfilePill';
import { QRScanner } from './QRScanner';
import { RecepcionForm } from './RecepcionForm';

export type SelloEstado = 'intacto' | 'roto' | 'ausente';

export interface QRData {
  cod: string;
  palletsSent: number;
  bultosSent: number;
  guias: string[];
  driveFileId?: string;
}

export interface FotoRegistro {
  file: File;
  hora: string;    // ISO timestamp
  preview: string; // blob URL
}

type SessionPhase = 'foto-cd' | 'entregas';
type DeliveryStep = 'sello-llegada' | 'scanner' | 'form' | 'done';

const SELLO_OPTS: { value: SelloEstado; label: string; color: string; bg: string; icon: string }[] = [
  { value: 'intacto', label: 'Intacto', color: '#10B981', bg: 'rgba(16,185,129,0.12)', icon: '✅' },
  { value: 'roto',    label: 'Roto',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  icon: '⚠️' },
  { value: 'ausente', label: 'Ausente', color: '#F97316', bg: 'rgba(249,115,22,0.12)', icon: '❌' },
];

function parseQRData(raw: string): QRData | null {
  try {
    let params: URLSearchParams;
    if (raw.startsWith('http')) {
      params = new URL(raw).searchParams;
    } else {
      params = new URLSearchParams(raw.includes('?') ? raw.split('?')[1] : `cod=${raw}`);
    }
    const cod = params.get('cod');
    if (!cod) return null;
    return {
      cod,
      palletsSent: parseInt(params.get('p') ?? '0', 10),
      bultosSent:  parseInt(params.get('b') ?? '0', 10),
      guias:       params.get('g') ? params.get('g')!.split(',').filter(Boolean) : [],
      driveFileId: params.get('drv') ?? undefined,
    };
  } catch {
    return { cod: raw, palletsSent: 0, bultosSent: 0, guias: [] };
  }
}

export function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function capturarFoto(
  e: React.ChangeEvent<HTMLInputElement>,
  onCaptura: (foto: FotoRegistro) => void,
) {
  const f = e.target.files?.[0];
  if (!f) return;
  onCaptura({ file: f, hora: new Date().toISOString(), preview: URL.createObjectURL(f) });
  e.target.value = '';
}

export function RecepcionTiendaScreen() {
  const router      = useRouter();
  const { profile } = useAuth();

  // Session-level (CD departure photo — taken once per shift)
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('foto-cd');
  const [cdFoto,       setCdFoto]       = useState<FotoRegistro | null>(null);

  // Per-delivery
  const [step,         setStep]         = useState<DeliveryStep>('sello-llegada');
  const [selloLlegada, setSelloLlegada] = useState<FotoRegistro | null>(null);
  const [selloEstado,  setSelloEstado]  = useState<SelloEstado | null>(null);
  const [qrData,       setQrData]       = useState<QRData | null>(null);
  const [qrError,      setQrError]      = useState('');

  // CD photo
  function handleCdFotoCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    capturarFoto(e, setCdFoto);
  }
  function handleIniciarEntregas() { setSessionPhase('entregas'); }

  // Sello llegada
  function handleSelloLlegadaCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    capturarFoto(e, foto => { setSelloLlegada(foto); setSelloEstado(null); });
  }
  function handleEscanearQR() {
    if (selloLlegada && selloEstado) setStep('scanner');
  }

  // QR scanner
  function handleQRDetected(raw: string) {
    const data = parseQRData(raw);
    if (!data) { setQrError('QR inválido. Intenta de nuevo.'); return; }
    setQrData(data); setQrError(''); setStep('form');
  }

  // After form completes
  function handleFormDone() { setStep('done'); }

  // Start next delivery (keeps CD photo)
  function handleSiguienteEntrega() {
    setSelloLlegada(null); setSelloEstado(null);
    setQrData(null); setQrError('');
    setStep('sello-llegada');
  }

  const hdrBtn: React.CSSProperties = {
    width: 36, height: 36, flexShrink: 0,
    background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
    border: '1px solid rgba(255,255,255,0.15)',
    boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
    borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFF', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: '#1B2A6B', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', flexShrink: 0 }}>
        <button onClick={() => router.push('/despacho-hub')} style={hdrBtn}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '0.02em' }}>Entrega a Tienda</div>
          {profile && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 }}>{profile.full_name ?? profile.id}</div>}
        </div>
        <ProfilePill />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ══════════════════════════════════════════════════════════════════
            FASE 0 — Foto salida CD (una vez por turno)
        ══════════════════════════════════════════════════════════════════ */}
        {sessionPhase === 'foto-cd' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 48px' }}>

            {/* Badge turno */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <div style={{ background: '#1B2A6B', color: '#fff', borderRadius: 99, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>Inicio de turno</div>
              <div style={{ flex: 1, height: 2, background: '#E5E7EB', borderRadius: 99 }} />
            </div>

            <div style={{ background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
              <div style={{ background: 'linear-gradient(135deg, #1B2A6B 0%, #2D3F8C 100%)', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 52, marginBottom: 10 }}>🚛</div>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Antes de salir del CD</p>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#fff' }}>Fotografiar sello del vehículo</p>
              </div>

              <div style={{ padding: '22px 18px 26px' }}>
                {!cdFoto ? (
                  <>
                    <p style={{ margin: '0 0 18px', fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 1.6 }}>
                      Registra el sello intacto del camión antes de salir del centro de distribución. La hora queda guardada automáticamente.
                    </p>
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '26px 16px', border: '2.5px dashed #CBD5E1', borderRadius: 16, cursor: 'pointer', background: '#F8FAFF' }}>
                      <div style={{ width: 60, height: 60, background: '#EEF2FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>📸</div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1B2A6B' }}>Toca para fotografiar el sello</span>
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>Solo cámara — no se permite galería</span>
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCdFotoCaptura} />
                    </label>
                  </>
                ) : (
                  <>
                    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 12 }}>
                      <img src={cdFoto.preview} alt="sello CD" style={{ width: '100%', maxHeight: 210, objectFit: 'cover', display: 'block' }} />
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', padding: '16px 12px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13 }}>🕐</span>
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{formatHora(cdFoto.hora)}</span>
                      </div>
                      <button onClick={() => setCdFoto(null)}
                        style={{ position: 'absolute', top: 8, right: 8, background: '#EF4444', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>✅</span>
                      <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Foto registrada a las {formatHora(cdFoto.hora)}</span>
                    </div>
                    <button onClick={handleIniciarEntregas}
                      style={{ width: '100%', padding: '18px 0', background: '#1B2A6B', color: '#fff', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 17, cursor: 'pointer', boxShadow: '0 4px 20px rgba(27,42,107,0.4)' }}>
                      Iniciar entregas →
                    </button>
                  </>
                )}

                {!cdFoto && (
                  <button onClick={handleIniciarEntregas}
                    style={{ marginTop: 14, width: '100%', background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: '8px 0' }}>
                    Omitir (ya la tomé antes)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            ENTREGAS — flujo por tienda
        ══════════════════════════════════════════════════════════════════ */}
        {sessionPhase === 'entregas' && (
          <>
            {/* ── PASO 1: Foto sello llegada ─────────────────────────────── */}
            {step === 'sello-llegada' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 48px' }}>

                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 22 }}>
                  {['Sello llegada', 'QR', 'Formulario', 'Sello salida'].map((label, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#1B2A6B' : '#E5E7EB', color: i === 0 ? '#fff' : '#9CA3AF', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                        <span style={{ fontSize: 10, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? '#1B2A6B' : '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                      {i < 3 && <div style={{ flex: 1, height: 2, background: '#E5E7EB', margin: '0 6px' }} />}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Foto sello card */}
                  <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
                    <div style={{ background: 'linear-gradient(135deg, #1B2A6B, #2D3F8C)', padding: '16px 18px' }}>
                      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Paso 1</p>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>Fotografiar sello al llegar</p>
                    </div>
                    <div style={{ padding: '16px' }}>
                      {!selloLlegada ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 14px', border: '2.5px dashed #CBD5E1', borderRadius: 14, cursor: 'pointer', background: '#F8FAFF' }}>
                          <div style={{ width: 50, height: 50, background: '#EEF2FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔒</div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1B2A6B', marginBottom: 2 }}>Toca para fotografiar el sello</div>
                            <div style={{ fontSize: 12, color: '#9CA3AF' }}>Fotografía el sello intacto antes de abrir el camión</div>
                          </div>
                          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleSelloLlegadaCaptura} />
                        </label>
                      ) : (
                        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                          <img src={selloLlegada.preview} alt="sello llegada" style={{ width: '100%', maxHeight: 170, objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', padding: '14px 10px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 13 }}>🕐</span>
                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{formatHora(selloLlegada.hora)}</span>
                          </div>
                          <button onClick={() => { setSelloLlegada(null); setSelloEstado(null); }}
                            style={{ position: 'absolute', top: 8, right: 8, background: '#EF4444', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Estado del sello — aparece solo después de foto */}
                  {selloLlegada && (
                    <div style={{ background: '#fff', borderRadius: 20, padding: '16px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
                      <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>¿En qué estado llegó el sello?</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {SELLO_OPTS.map(opt => (
                          <button key={opt.value} onClick={() => setSelloEstado(opt.value)}
                            style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: `2px solid ${selloEstado === opt.value ? opt.color : '#E5E7EB'}`, background: selloEstado === opt.value ? opt.bg : '#fff', color: selloEstado === opt.value ? opt.color : '#6B7280', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}>
                            <span style={{ fontSize: 20 }}>{opt.icon}</span>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA */}
                  <button onClick={handleEscanearQR} disabled={!selloLlegada || !selloEstado}
                    style={{ width: '100%', padding: '18px 0', background: !selloLlegada || !selloEstado ? '#E5E7EB' : '#1B2A6B', color: !selloLlegada || !selloEstado ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 17, cursor: !selloLlegada || !selloEstado ? 'not-allowed' : 'pointer', boxShadow: !selloLlegada || !selloEstado ? 'none' : '0 4px 20px rgba(27,42,107,0.4)', transition: 'all 0.2s' }}>
                    {!selloLlegada ? '📸  Toma la foto del sello primero' : !selloEstado ? 'Selecciona el estado del sello' : 'Escanear QR de la tienda →'}
                  </button>
                </div>
              </div>
            )}

            {/* ── PASO 2: Scanner QR ─────────────────────────────────────── */}
            {step === 'scanner' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
                  <button onClick={() => setStep('sello-llegada')}
                    style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Volver
                  </button>
                </div>
                <div style={{ padding: '4px 20px 10px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Escanear QR de la tienda</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Apunta la cámara al código QR de la etiqueta Zebra</p>
                </div>
                {qrError && (
                  <div style={{ margin: '0 16px 8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#B91C1C', fontWeight: 500, flexShrink: 0 }}>
                    ⚠️ {qrError}
                  </div>
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <QRScanner onDetect={handleQRDetected} />
                </div>
              </div>
            )}

            {/* ── PASO 3+: Formulario (incluye código + sello salida internamente) */}
            {step === 'form' && qrData && selloLlegada && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <RecepcionForm
                  qrData={qrData}
                  selloLlegada={selloLlegada}
                  selloEstado={selloEstado!}
                  cdFoto={cdFoto}
                  onDone={handleFormDone}
                  onBack={() => setStep('sello-llegada')}
                />
              </div>
            )}

            {/* ── DONE ──────────────────────────────────────────────────── */}
            {step === 'done' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 72, lineHeight: 1 }}>✅</div>
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#111827' }}>¡Entrega confirmada!</p>
                  <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
                    {qrData?.cod ?? ''} — registrado con trazabilidad completa
                  </p>
                </div>
                <button onClick={handleSiguienteEntrega}
                  style={{ background: '#1B2A6B', color: '#fff', border: 'none', borderRadius: 16, padding: '16px 36px', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 20px rgba(27,42,107,0.35)' }}>
                  Siguiente entrega
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
