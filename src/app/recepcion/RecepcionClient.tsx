'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { TIENDAS_INICIAL } from '../../features/despacho/rutas/data/tiendas';
import { formatCod } from '../../features/despacho/rutas/utils/helpers';

function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const dv  = clean.slice(-1);
  const num = clean.slice(0, -1);
  const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
}

export function RecepcionClient() {
  const params = useSearchParams();
  const cod  = params.get('cod') || '';
  const p    = parseInt(params.get('p') || '0', 10);
  const b    = parseInt(params.get('b') || '0', 10);
  const g    = params.get('g') || '';
  const drv  = params.get('drv') || '';

  const store = TIENDAS_INICIAL[cod];
  const guias = g ? g.split(',').filter(Boolean) : [];

  const [palletsRec, setPalletsRec] = useState(String(p));
  const [bultosRec,  setBultosRec]  = useState(String(b));
  const [receptor,   setReceptor]   = useState('');
  const [rut,        setRut]        = useState('');
  const [loading,    setLoading]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState('');
  const [hasSig,     setHasSig]     = useState(false);

  // El CSS global del app-shell bloquea el scroll — lo liberamos en esta página
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlHeight   = html.style.height;
    const prevBodyHeight   = body.style.height;
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    html.style.height   = 'auto';
    body.style.height   = 'auto';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.height   = prevHtmlHeight;
      body.style.height   = prevBodyHeight;
    };
  }, []);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef    = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1B2A6B';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.fillStyle   = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    lastRef.current = getPos(e);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
    setHasSig(true);
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clearSig = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx  = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSig(false);
  };

  const handleSubmit = async () => {
    if (!receptor.trim()) { setError('Ingresa el nombre del receptor'); return; }
    if (!rut.trim())      { setError('Ingresa el RUT'); return; }
    if (!hasSig)          { setError('Se requiere la firma del receptor'); return; }
    setError('');
    setLoading(true);

    const signatureDataUrl = canvasRef.current?.toDataURL('image/png');

    try {
      const res = await fetch('/api/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cod,
          tienda: store?.n || cod,
          direccion: store?.d || '',
          palletsSent: p,
          bultosSent: b,
          palletsRecibidos: parseInt(palletsRec) || 0,
          bultosRecibidos:  parseInt(bultosRec)  || 0,
          receptor: receptor.trim(),
          rut: rut.trim(),
          signatureDataUrl,
          driveFileId: drv || undefined,
        }),
      });
      if (!res.ok) throw new Error('Server error');
      setDone(true);
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Invalid QR ── */
  if (!cod || !store) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Código inválido</p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>El QR escaneado no contiene datos válidos.</p>
        </div>
      </div>
    );
  }

  /* ── Success ── */
  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <p style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>¡Recepción confirmada!</p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{store.n} — {formatCod(cod)}</p>
        </div>
        {drv && (
          <a
            href={drv}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', maxWidth: 360, padding: '16px 0',
              background: '#1B2A6B', color: '#fff', borderRadius: 16, fontWeight: 700,
              fontSize: 18, textDecoration: 'none',
              boxShadow: '0 4px 20px rgba(27,42,107,0.50)',
            }}>
            ↓ Descargar Guías PDF
          </a>
        )}
      </div>
    );
  }

  /* ── Form ── */
  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: '#1B2A6B', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
        <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          📦
        </div>
        <div>
          <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>KiosClub</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.2 }}>Recepción de Despacho</p>
        </div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Store card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.30)' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Tienda destino
          </p>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#1B2A6B', lineHeight: 1, fontFamily: 'monospace' }}>
            {formatCod(cod)}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#1F2937' }}>{store.n}</p>
          {store.d && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>{store.d}</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {p > 0 && (
              <span style={{ background: '#EEF2FF', color: '#1B2A6B', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>
                {p} pallet{p !== 1 ? 's' : ''} enviado{p !== 1 ? 's' : ''}
              </span>
            )}
            {b > 0 && (
              <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>
                {b} bulto{b !== 1 ? 's' : ''} enviado{b !== 1 ? 's' : ''}
              </span>
            )}
            {guias.length > 0 && (
              <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontFamily: 'monospace', padding: '4px 12px', borderRadius: 99 }}>
                Guía {guias.join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Received quantities */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.30)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Cantidad recibida
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>Pallets</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={palletsRec}
                onChange={e => setPalletsRec(e.target.value)}
                style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: 20, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box', color: '#1F2937' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>Bultos</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={bultosRec}
                onChange={e => setBultosRec(e.target.value)}
                style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: 20, fontWeight: 700, textAlign: 'center', outline: 'none', boxSizing: 'border-box', color: '#1F2937' }}
              />
            </div>
          </div>
        </div>

        {/* Receptor info */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.30)' }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Datos del receptor
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>Nombre completo</label>
              <input
                type="text"
                value={receptor}
                onChange={e => setReceptor(e.target.value)}
                placeholder="Ej: Juan Pérez González"
                style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box', color: '#1F2937' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>RUT</label>
              <input
                type="text"
                value={rut}
                onChange={e => setRut(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                inputMode="numeric"
                style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', fontSize: 15, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', color: '#1F2937' }}
              />
            </div>
          </div>
        </div>

        {/* Signature pad */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.30)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Firma del receptor
            </p>
            {hasSig && (
              <button
                onClick={clearSig}
                style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: '#EF4444', cursor: 'pointer', padding: 0 }}>
                Limpiar
              </button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{
              display: 'block', width: '100%', height: 160,
              borderRadius: 12, border: '2px dashed #D1D5DB',
              touchAction: 'none', cursor: 'crosshair', background: '#FFFFFF',
            }}
          />
          {!hasSig && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#D1D5DB', marginTop: 8, marginBottom: 0 }}>
              Firme dentro del recuadro
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', padding: '18px 0',
            background: loading ? '#86EFAC' : '#16A34A',
            color: '#fff', border: 'none', borderRadius: 18,
            fontWeight: 700, fontSize: 20, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 20px rgba(22,163,74,0.45)',
            transition: 'background 0.2s',
          }}>
          {loading ? (
            <>
              <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Guardando…
            </>
          ) : (
            'Confirmar Recepción'
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { border-color: #1B2A6B !important; }
      `}</style>
    </div>
  );
}
