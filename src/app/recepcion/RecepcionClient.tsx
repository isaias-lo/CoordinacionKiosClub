'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { TIENDAS_INICIAL } from '../../features/despacho/rutas/data/tiendas';
import { formatCod } from '../../features/despacho/rutas/utils/helpers';

function formatRut(raw: string): string {
  // Strip everything except digits and K, cap at 9 chars
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const dv  = clean.slice(-1);
  const num = clean.slice(0, -1);
  // Add thousands dots only when there are enough digits to need them
  const dotted = num.length > 3
    ? num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : num;
  return `${dotted}-${dv}`;
}

const S: Record<string, React.CSSProperties> = {
  page:    { minHeight: '100vh', background: '#0F172A', paddingBottom: 40 },
  header:  { background: '#1B2A6B', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.4)' },
  iconBox: { width: 36, height: 36, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  body:    { padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 },
  card:    { background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.30)' },
  label:   { display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 },
  input:   { width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, color: '#1F2937' },
  sectionTitle: { margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' as const },
};

function inputNum(extra?: React.CSSProperties): React.CSSProperties {
  return { ...S.input, fontSize: 20, fontWeight: 700, textAlign: 'center', ...extra };
}

export function RecepcionClient() {
  const params = useSearchParams();
  const cod = params?.get('cod') ?? '';
  const p   = parseInt(params?.get('p') ?? '0', 10);
  const b   = parseInt(params?.get('b') ?? '0', 10);
  const g   = params?.get('g') ?? '';
  const drv = params?.get('drv') ?? '';

  const store = TIENDAS_INICIAL[cod];
  const guias = g ? g.split(',').filter(Boolean) : [];

  const [done,       setDone]       = useState(false);
  const [palletsRec, setPalletsRec] = useState(String(p));
  const [bultosRec,  setBultosRec]  = useState(String(b));
  const [receptor,   setReceptor]   = useState('');
  const [rut,        setRut]        = useState('');
  const [hasSig,     setHasSig]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef    = useRef({ x: 0, y: 0 });

  // Libera el overflow del app-shell para que la página pueda hacer scroll
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const oh = html.style.overflow, ob = body.style.overflow;
    const hh = html.style.height,   bh = body.style.height;
    html.style.overflow = 'auto'; body.style.overflow = 'auto';
    html.style.height   = 'auto'; body.style.height   = 'auto';
    return () => {
      html.style.overflow = oh; body.style.overflow = ob;
      html.style.height   = hh; body.style.height   = bh;
    };
  }, []);

  // Inicializa el canvas con DPR scaling — espera al layout real
  useEffect(() => {
    const initCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) { requestAnimationFrame(initCanvas); return; }
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#1B2A6B';
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
    };
    requestAnimationFrame(initCanvas);
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current    = getPos(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
    setHasSig(true);
  }

  function onPointerUp() { drawingRef.current = false; }

  function clearSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSig(false);
  }

  const handleConfirm = async () => {
    if (!receptor.trim()) { setError('Ingresa el nombre del receptor'); return; }
    if (!rut.trim())      { setError('Ingresa el RUT'); return; }
    if (!hasSig)          { setError('Por favor firma antes de confirmar'); return; }
    setError('');
    setLoading(true);
    try {
      const signatureDataUrl = canvasRef.current!.toDataURL('image/png');
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  /* ── QR inválido ── */
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

  /* ── Éxito ── */
  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <p style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>¡Recepción confirmada!</p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{store.n} — {formatCod(cod)}</p>
        </div>
        {drv && (
          <a href={drv} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', maxWidth: 360, padding: '16px 0',
            background: '#1B2A6B', color: '#fff', borderRadius: 16, fontWeight: 700,
            fontSize: 18, textDecoration: 'none', boxShadow: '0 4px 20px rgba(27,42,107,0.50)',
          }}>
            ↓ Descargar Guías PDF
          </a>
        )}
      </div>
    );
  }

  /* ── Formulario principal ── */
  const Spinner = <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.iconBox}>📦</div>
        <div>
          <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>KiosClub</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.2 }}>Recepción de Despacho</p>
        </div>
      </div>

      <div style={S.body}>
        {/* Store card */}
        <div style={S.card}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tienda destino</p>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#1B2A6B', lineHeight: 1, fontFamily: 'monospace' }}>{formatCod(cod)}</p>
          <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#1F2937' }}>{store.n}</p>
          {store.d && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>{store.d}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {p > 0 && <span style={{ background: '#EEF2FF', color: '#1B2A6B', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>{p} pallet{p !== 1 ? 's' : ''} enviado{p !== 1 ? 's' : ''}</span>}
            {b > 0 && <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>{b} bulto{b !== 1 ? 's' : ''} enviado{b !== 1 ? 's' : ''}</span>}
            {guias.length > 0 && <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontFamily: 'monospace', padding: '4px 12px', borderRadius: 99 }}>Guía {guias.join(' · ')}</span>}
          </div>
        </div>

        {/* Cantidad recibida */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Cantidad recibida</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>Pallets</label>
              <input type="number" min="0" inputMode="numeric" value={palletsRec} onChange={e => setPalletsRec(e.target.value)} style={inputNum()} />
            </div>
            <div>
              <label style={S.label}>Bultos</label>
              <input type="number" min="0" inputMode="numeric" value={bultosRec} onChange={e => setBultosRec(e.target.value)} style={inputNum()} />
            </div>
          </div>
        </div>

        {/* Datos del receptor */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Datos del receptor</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={S.label}>Nombre completo</label>
              <input type="text" value={receptor} onChange={e => setReceptor(e.target.value)} placeholder="Ej: Juan Pérez González" style={S.input} />
            </div>
            <div>
              <label style={S.label}>RUT</label>
              <input type="text" value={rut} onChange={e => setRut(formatRut(e.target.value))} placeholder="12.345.678-9" inputMode="text" autoComplete="off" style={{ ...S.input, fontFamily: 'monospace' }} />
            </div>
          </div>
        </div>

        {/* Firma */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={S.sectionTitle}>Firma del receptor</p>
            {hasSig && (
              <button onClick={clearSig} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                Borrar
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
              width: '100%', height: 140,
              border: `2px ${hasSig ? 'solid #1B2A6B' : 'dashed #D1D5DB'}`,
              borderRadius: 12, touchAction: 'none', cursor: 'crosshair',
              background: hasSig ? '#F8FAFF' : '#FAFAFA',
              display: 'block',
            }}
          />
          {!hasSig && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 8, marginBottom: 0 }}>
              Dibuja tu firma en el área de arriba
            </p>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            width: '100%', padding: '18px 0',
            background: loading ? '#93C5FD' : '#1B2A6B',
            color: '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 20,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 20px rgba(27,42,107,0.45)',
          }}>
          {loading ? <>{Spinner} Guardando…</> : 'Confirmar Recepción'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #1B2A6B !important; }`}</style>
    </div>
  );
}
