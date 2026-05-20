'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ProfilePill } from '@/components/ProfilePill';
import { QRScanner } from '@/features/tiendas/QRScanner';
import { RecepcionTiendaCtrlForm } from './RecepcionTiendaCtrlForm';

interface QRData {
  cod: string;
  palletsSent: number;
  bultosSent: number;
  guias: string[];
  driveFileId?: string;
}

type Step = 'scanner' | 'form' | 'done';

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

export function RecepcionTiendaCtrlScreen() {
  const router       = useRouter();
  const { profile }  = useAuth();
  const [step,    setStep]    = useState<Step>('scanner');
  const [qrData,  setQrData]  = useState<QRData | null>(null);
  const [qrError, setQrError] = useState('');

  function handleQRDetected(raw: string) {
    const data = parseQRData(raw);
    if (!data) {
      setQrError('QR inválido. Intenta de nuevo o ingresa el código manualmente.');
      return;
    }
    setQrData(data);
    setQrError('');
    setStep('form');
  }

  function handleDone() { setStep('done'); }
  function handleScanAnother() { setQrData(null); setQrError(''); setStep('scanner'); }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFF', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: '#1B2A6B', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', flexShrink: 0 }}>
        <button onClick={() => router.push('/control-interno')}
          style={{ width: 36, height: 36, flexShrink: 0, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '0.02em' }}>Recepción / Tienda</div>
          {profile && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 }}>{profile.full_name ?? profile.id}</div>}
        </div>
        <ProfilePill />
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {step === 'scanner' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 10px', textAlign: 'center', flexShrink: 0 }}>
              <p style={{ margin: '0 0 3px', fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Escanear QR de despacho</p>
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Apunta la cámara al código QR de la etiqueta del camión</p>
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

        {step === 'form' && qrData && (
          <RecepcionTiendaCtrlForm qrData={qrData} onDone={handleDone} onBack={handleScanAnother} />
        )}

        {step === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 72, lineHeight: 1 }}>✅</div>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#111827' }}>¡Recepción confirmada!</p>
              <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
                {qrData ? `${qrData.cod} registrado correctamente` : 'Registro guardado'}
              </p>
            </div>
            {qrData?.driveFileId && (
              <a
                href={`https://drive.google.com/file/d/${qrData.driveFileId}/view`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 28px', background: '#1B2A6B', color: '#fff', borderRadius: 16, fontWeight: 700, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 20px rgba(27,42,107,0.35)' }}>
                ↓ Descargar guías de despacho
              </a>
            )}
            {qrData?.guias && qrData.guias.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
                Guías: {qrData.guias.join(' · ')}
              </p>
            )}
            <button onClick={handleScanAnother}
              style={{ background: 'rgba(27,42,107,0.1)', color: '#1B2A6B', border: '1.5px solid rgba(27,42,107,0.2)', borderRadius: 14, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Escanear otro QR
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
