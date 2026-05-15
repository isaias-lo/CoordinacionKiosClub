'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onDetect: (data: string) => void;
}

export function QRScanner({ onDetect }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);
  const detectedRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsQRRef     = useRef<any>(null);

  const [status,     setStatus]     = useState<'requesting' | 'active' | 'error'>('requesting');
  const [errMsg,     setErrMsg]     = useState('');
  const [manual,     setManual]     = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function scan() {
      if (cancelled || detectedRef.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      const jsQR   = jsQRRef.current;
      if (!video || !canvas || !jsQR || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && !detectedRef.current) {
        detectedRef.current = true;
        stopCamera();
        onDetect(code.data);
        return;
      }
      rafRef.current = requestAnimationFrame(scan);
    }

    async function startCamera() {
      try {
        jsQRRef.current = (await import('jsqr')).default;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        if (!cancelled) {
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

    startCamera();
    return () => { cancelled = true; stopCamera(); };
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
      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
          Ingresa la URL completa del QR o el código de tienda
        </p>
        <input
          type="text"
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit(); }}
          placeholder="https://... o ej: 1001-SAT"
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

      {/* Requesting state — shown until camera starts */}
      {status === 'requesting' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#0a0f1e', gap: 16,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
          }}>📷</div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', padding: '0 24px' }}>
            Solicitando acceso a la cámara…
          </p>
        </div>
      )}

      {/* Error state */}
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

      {/*
        Video always in DOM so videoRef is populated before status turns 'active'.
        Hidden via opacity/visibility until camera is ready.
      */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          background: '#000',
          opacity: status === 'active' ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Scan overlay — corner guides + instruction */}
      {status === 'active' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {/* Dark vignette around scan area */}
          <div style={{ position: 'relative', width: 240, height: 240 }}>
            <div style={{
              position: 'absolute', inset: 0,
              border: '2px solid rgba(255,255,255,0.6)',
              borderRadius: 16,
              boxShadow: '0 0 0 2000px rgba(0,0,0,0.5)',
            }} />
            {/* Corner accents */}
            {([
              { top: -2,    left: -2,  borderRight: 'none', borderBottom: 'none', borderRadius: '12px 0 0 0' },
              { top: -2,    right: -2, borderLeft: 'none',  borderBottom: 'none', borderRadius: '0 12px 0 0' },
              { bottom: -2, left: -2,  borderRight: 'none', borderTop: 'none',    borderRadius: '0 0 0 12px' },
              { bottom: -2, right: -2, borderLeft: 'none',  borderTop: 'none',    borderRadius: '0 0 12px 0' },
            ] as React.CSSProperties[]).map((s, i) => (
              <div key={i} style={{
                position: 'absolute', width: 32, height: 32,
                border: '3px solid #10B981', ...s,
              }} />
            ))}
          </div>
          {/* Instruction */}
          <p style={{
            marginTop: 20, color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600,
            textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}>
            Centra el código QR dentro del recuadro
          </p>
        </div>
      )}

      {/* Manual entry button — visible when camera is active */}
      {status === 'active' && (
        <div style={{
          position: 'absolute', bottom: 20, left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
          pointerEvents: 'auto',
        }}>
          <button
            onClick={() => setShowManual(true)}
            style={{
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 24, padding: '10px 24px',
              color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}>
            Ingresar código manualmente
          </button>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
