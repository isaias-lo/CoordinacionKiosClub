'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetect: (data: string) => void;
}

export function BarcodeScanner({ onDetect }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const readerRef   = useRef<import('@zxing/browser').BrowserMultiFormatReader | null>(null);
  const detectedRef = useRef(false);

  const [status,     setStatus]     = useState<'requesting' | 'active' | 'error'>('requesting');
  const [errMsg,     setErrMsg]     = useState('');
  const [manual,     setManual]     = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        readerRef.current = reader;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }

        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        setStatus('active');

        reader.decodeFromStream(stream, video, (result, err) => {
          if (cancelled || detectedRef.current) return;
          if (result) {
            detectedRef.current = true;
            stopCamera();
            onDetect(result.getText());
          }
          void err; // suppress no-result frames
        });
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrMsg((e as Error).message ?? 'No se pudo acceder a la cámara');
        }
      }
    }

    startCamera();
    return () => { cancelled = true; stopCamera(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (readerRef.current as any)?.reset?.();
    } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  function handleManualSubmit() {
    const trimmed = manual.trim();
    if (!trimmed) return;
    stopCamera();
    onDetect(trimmed);
  }

  if (showManual) {
    return (
      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
          Ingresa el código de barras o el código de tienda
        </p>
        <input
          type="text"
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit(); }}
          placeholder="Ej: 1001-SAT"
          style={{ border: '2px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', fontSize: 15, outline: 'none', boxSizing: 'border-box', width: '100%' }}
          autoFocus
        />
        <button onClick={handleManualSubmit}
          style={{ background: '#1B2A6B', color: '#fff', border: 'none', borderRadius: 14, padding: '16px 0', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
          Continuar
        </button>
        <button onClick={() => setShowManual(false)}
          style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', padding: 8, textAlign: 'center' }}>
          ← Volver al escáner
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Requesting */}
      {status === 'requesting' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#0a0f1e', gap: 16,
        }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📷</div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', padding: '0 24px' }}>
            Solicitando acceso a la cámara…
          </p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#0a0f1e', gap: 16, padding: 32,
        }}>
          <div style={{ fontSize: 42 }}>⚠️</div>
          <p style={{ margin: 0, color: '#FCA5A5', fontSize: 14, textAlign: 'center' }}>{errMsg}</p>
          <button onClick={() => setShowManual(true)}
            style={{ background: '#1B2A6B', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Ingresar código manualmente
          </button>
        </div>
      )}

      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          flex: 1, width: '100%', height: '100%',
          objectFit: 'cover', display: 'block', background: '#000',
          opacity: status === 'active' ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Overlay — rectangular for barcodes */}
      {status === 'active' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 280, height: 120 }}>
            {/* Dark vignette */}
            <div style={{
              position: 'absolute', inset: 0,
              border: '2px solid rgba(255,255,255,0.6)',
              borderRadius: 10,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
            }} />
            {/* Scan line animation */}
            <div style={{
              position: 'absolute', left: 4, right: 4,
              height: 2, background: '#10B981',
              borderRadius: 2, opacity: 0.85,
              animation: 'barcode-scan 1.8s ease-in-out infinite',
            }} />
            {/* Corner accents */}
            {([
              { top: -2,    left: -2,  borderRight: 'none', borderBottom: 'none', borderRadius: '8px 0 0 0' },
              { top: -2,    right: -2, borderLeft: 'none',  borderBottom: 'none', borderRadius: '0 8px 0 0' },
              { bottom: -2, left: -2,  borderRight: 'none', borderTop: 'none',    borderRadius: '0 0 0 8px' },
              { bottom: -2, right: -2, borderLeft: 'none',  borderTop: 'none',    borderRadius: '0 0 8px 0' },
            ] as React.CSSProperties[]).map((s, i) => (
              <div key={i} style={{ position: 'absolute', width: 28, height: 28, border: '3px solid #10B981', ...s }} />
            ))}
          </div>
          <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            Centra el código de barras dentro del recuadro
          </p>
        </div>
      )}

      <style>{`
        @keyframes barcode-scan {
          0%   { top: 8px; }
          50%  { top: calc(100% - 10px); }
          100% { top: 8px; }
        }
      `}</style>

      {/* Manual entry */}
      {status === 'active' && (
        <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'auto' }}>
          <button
            onClick={() => setShowManual(true)}
            style={{
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 24, padding: '10px 24px',
              color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
            Ingresar código manualmente
          </button>
        </div>
      )}
    </div>
  );
}
