'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetect: (data: string) => void;
}

export function QRScanner({ onDetect }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const detectedRef = useRef(false);

  const [status,  setStatus]  = useState<'requesting' | 'active' | 'error'>('requesting');
  const [errMsg,  setErrMsg]  = useState('');
  const [manual,  setManual]  = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus('active');
          scan();
        }
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrMsg((e as Error).message ?? 'No se pudo acceder a la cámara');
        }
      }
    }

    async function scan() {
      if (cancelled || detectedRef.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Dynamic import so Next.js doesn't try to SSR it
      const jsQR = (await import('jsqr')).default;
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && !detectedRef.current) {
        detectedRef.current = true;
        stopCamera();
        onDetect(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(scan);
    }

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
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
      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
          Ingresa la URL completa del QR o el código de tienda
        </p>
        <input
          type="text"
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="https://... o ej: 1001-SAT"
          style={{ border: '2px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box', width: '100%' }}
          autoFocus
        />
        <button onClick={handleManualSubmit}
          style={{ background: '#1B2A6B', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 0', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
          Continuar
        </button>
        <button onClick={() => setShowManual(false)}
          style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', padding: 8 }}>
          ← Volver al escáner
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      {status === 'requesting' && (
        <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
          Solicitando acceso a la cámara…
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ color: '#B91C1C', fontSize: 13, margin: '0 0 16px' }}>{errMsg}</p>
          <button onClick={() => setShowManual(true)}
            style={{ background: '#1B2A6B', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Ingresar código manualmente
          </button>
        </div>
      )}

      {status === 'active' && (
        <>
          <div style={{ position: 'relative', width: '100%', maxWidth: 400, aspectRatio: '1', overflow: 'hidden', borderRadius: 16, background: '#000' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {/* Scanner overlay */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{
                width: 200, height: 200,
                border: '3px solid rgba(255,255,255,0.9)',
                borderRadius: 12,
                boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)',
              }} />
              {/* Corner accents */}
              {[
                { top: 0, left: 0, borderRight: 'none', borderBottom: 'none' },
                { top: 0, right: 0, borderLeft: 'none', borderBottom: 'none' },
                { bottom: 0, left: 0, borderRight: 'none', borderTop: 'none' },
                { bottom: 0, right: 0, borderLeft: 'none', borderTop: 'none' },
              ].map((s, i) => (
                <div key={i} style={{
                  position: 'absolute', width: 24, height: 24,
                  border: '3px solid #10B981', borderRadius: 3, ...s,
                }} />
              ))}
            </div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <p style={{ margin: '14px 0 4px', fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
            Apunta la cámara al código QR de la tienda
          </p>
          <button onClick={() => setShowManual(true)}
            style={{ background: 'none', border: 'none', color: '#1B2A6B', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 0', textDecoration: 'underline' }}>
            Ingresar código manualmente
          </button>
        </>
      )}
    </div>
  );
}
