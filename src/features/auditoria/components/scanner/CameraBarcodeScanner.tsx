'use client';

import { useState, useRef, useEffect } from 'react';

// BarcodeDetector global types are declared in AuditoriaScreen.tsx (same compilation unit)

export function CameraBarcodeScanner({ onScan, onClose, onManualEntry, manualEntryLabel }: {
  onScan: (raw: string) => boolean;
  onClose: () => void;
  /** Si se provee, el estado sin cámara (iOS <17.4) ofrece volver a digitar manualmente. */
  onManualEntry?: () => void;
  manualEntryLabel?: string;
}) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const animRef       = useRef<number>(0);
  const streamRef     = useRef<MediaStream | null>(null);
  const lastScanRef   = useRef<number>(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  type ScanStatus = 'loading' | 'scanning' | 'found' | 'error';
  type ErrorType  = 'no-api' | 'no-permission' | 'camera';

  const [status,    setStatus]    = useState<ScanStatus>('loading');
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [errorMsg,  setErrorMsg]  = useState('');
  const [hasTorch,  setHasTorch]  = useState(false);
  const [torchOn,   setTorchOn]   = useState(false);
  const [wideMode,  setWideMode]  = useState(false);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (track as any).applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(t => !t);
    } catch { /* torch not supported on this device */ }
  };

  // Photo fallback: decode a captured still image (works when live video isn't available)
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!('BarcodeDetector' in window)) return;
    try {
      const bitmap   = await createImageBitmap(file);
      const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'data_matrix', 'code_93'] });
      const codes    = await detector.detect(bitmap);
      if (codes.length > 0) {
        setStatus('found');
        setTimeout(() => { onScan(codes[0].rawValue); onClose(); }, 350);
      } else {
        setErrorMsg('No se detectó código en la foto. Asegúrate de que el código esté bien iluminado y centrado.');
        setErrorType('camera');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Error al procesar la imagen.');
      setErrorType('camera');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('BarcodeDetector' in window)) {
      setStatus('error');
      setErrorType('no-api');
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const manualHint = onManualEntry ? ' Digita el número de la etiqueta o usa la pistola lectora.' : ' Usa la pistola lectora.';
      setErrorMsg(isIOS
        ? `Este iPhone no soporta escaneo por cámara (requiere iOS 17.4+ con Safari actualizado).${manualHint}`
        : `Tu navegador no soporta escaneo por cámara (actualiza Chrome).${manualHint}`);
      return;
    }

    let stopped = false;
    const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'data_matrix', 'code_93'] });

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then(stream => {
      if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      // Detect torch support
      const track = stream.getVideoTracks()[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((track.getCapabilities() as any)?.torch) setHasTorch(true);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.play().then(() => {
        setStatus('scanning');
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          // Throttle: decode at most every 250 ms to avoid frame-spam
          const now = Date.now();
          if (now - lastScanRef.current < 250) { animRef.current = requestAnimationFrame(tick); return; }
          lastScanRef.current = now;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              stopped = true;
              setStatus('found');
              streamRef.current?.getTracks().forEach(t => t.stop());
              setTimeout(() => { onScan(codes[0].rawValue); onClose(); }, 350);
              return;
            }
          } catch { /* frame decode error — skip */ }
          animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
      });
    }).catch(err => {
      if (stopped) return;
      setStatus('error');
      if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'PermissionDeniedError') {
        setErrorType('no-permission');
        setErrorMsg('Permiso de cámara denegado. Permite el acceso en la configuración del navegador y recarga la página.');
      } else {
        setErrorType('camera');
        setErrorMsg(err instanceof Error ? err.message : 'Sin acceso a cámara');
      }
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apiAvailable = 'BarcodeDetector' in (typeof window !== 'undefined' ? window : {});

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
      {/* Hidden photo input for still-image fallback */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: 'rgba(0,0,0,0.75)' }}>
        <button onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-white/20 text-white text-[20px] leading-none bg-transparent cursor-pointer">‹</button>
        <span className="text-white font-bold text-[15px] flex-1">Escanear código del pallet</span>
        {status === 'scanning' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setWideMode(w => !w)}
              className="w-9 h-9 rounded-full border flex items-center justify-center text-[14px] cursor-pointer"
              style={{ borderColor: wideMode ? '#60A5FA' : 'rgba(255,255,255,0.25)', background: wideMode ? 'rgba(96,165,250,0.2)' : 'transparent' }}
              title={wideMode ? 'Modo normal' : 'Modo amplio (código grande)'}>
              {wideMode ? '⊡' : '⊞'}
            </button>
            {hasTorch && (
              <button onClick={() => void toggleTorch()}
                className="w-9 h-9 rounded-full border flex items-center justify-center text-[18px] cursor-pointer"
                style={{ borderColor: torchOn ? '#FCD34D' : 'rgba(255,255,255,0.25)', background: torchOn ? 'rgba(252,211,77,0.2)' : 'transparent' }}
                title={torchOn ? 'Apagar linterna' : 'Encender linterna'}>
                🔦
              </button>
            )}
            <span className="text-[11px] text-green-400 font-semibold animate-pulse">● Buscando…</span>
          </div>
        )}
      </div>

      {/* Body */}
      {status === 'found' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-[64px]">✅</div>
          <div className="text-white font-bold text-[20px]">¡Código detectado!</div>
        </div>
      ) : status === 'error' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <div className="text-[52px]">{errorType === 'no-permission' ? '🔒' : '📷'}</div>
          <div className="text-white/80 text-[15px] leading-relaxed">{errorMsg}</div>
          {/* Photo fallback: available when BarcodeDetector exists but camera stream failed */}
          {apiAvailable && errorType !== 'no-api' && (
            <button onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white cursor-pointer"
              style={{ background: 'rgba(37,99,235,0.7)', border: '1px solid rgba(37,99,235,0.5)' }}>
              📸 Tomar foto del código
            </button>
          )}
          {/* Sin cámara (iOS <17.4): volver a digitar el número manualmente */}
          {errorType === 'no-api' && onManualEntry && (
            <button onClick={onManualEntry}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-white cursor-pointer"
              style={{ background: 'rgba(37,99,235,0.75)', border: '1px solid rgba(37,99,235,0.5)' }}>
              {manualEntryLabel ?? '✏️ Digitar el número manualmente'}
            </button>
          )}
          <button onClick={onClose}
            className="px-6 py-3 rounded-2xl font-bold text-white border border-white/30 bg-white/10 cursor-pointer">
            Cerrar
          </button>
        </div>
      ) : (
        /* Live scanning view */
        <div className="flex-1 relative overflow-hidden">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

          {/* Viewfinder — adjusts between normal and wide mode for large CODE128 barcodes */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ background: `rgba(0,0,0,${wideMode ? '0.2' : '0.45'})` }}>
            <div className="relative bg-transparent"
              style={{
                width: wideMode ? '96%' : '88%',
                maxWidth: wideMode ? 640 : 440,
                height: wideMode ? 320 : 200,
                boxShadow: `0 0 0 9999px rgba(0,0,0,${wideMode ? '0.2' : '0.45'})`,
              }}>
              {[['top-0 left-0','border-t-[3px] border-l-[3px]'],['top-0 right-0','border-t-[3px] border-r-[3px]'],['bottom-0 left-0','border-b-[3px] border-l-[3px]'],['bottom-0 right-0','border-b-[3px] border-r-[3px]']].map(([pos, borders]) => (
                <div key={pos} className={`absolute w-8 h-8 ${wideMode ? 'border-blue-400' : 'border-white'} ${pos} ${borders}`} />
              ))}
              {status === 'scanning' && (
                <div className="absolute inset-x-0 h-0.5 bg-red-400/90"
                  style={{ animation: 'scanline 2s linear infinite', top: '50%' }} />
              )}
            </div>
            <div className="mt-4 text-white/80 text-[13px] font-medium px-6 text-center">
              {wideMode ? 'Modo amplio — código grande (70% hoja)' : 'Centra el código dentro del marco'}
            </div>
            <div className="mt-1 text-white/50 text-[11px] px-6 text-center">
              {wideMode ? 'Aleja el celular ~30–40 cm del código' : 'Si el código es muy grande, aleja el celular ~25–35 cm'}
            </div>
            {wideMode && (
              <div className="mt-2 px-3 py-1 rounded-full text-[10px] font-semibold text-blue-300 border border-blue-400/40 bg-blue-400/10">
                ⊞ Modo amplio activo
              </div>
            )}
          </div>

          {/* Photo fallback button — always visible at bottom */}
          <div className="absolute bottom-5 left-0 right-0 flex justify-center" style={{ pointerEvents: 'auto' }}>
            <button onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-[13px] text-white cursor-pointer"
              style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.25)' }}>
              📸 Usar foto en su lugar
            </button>
          </div>

          {/* Loading spinner */}
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes scanline { 0%,100%{top:12%} 50%{top:88%} }`}</style>
    </div>
  );
}
