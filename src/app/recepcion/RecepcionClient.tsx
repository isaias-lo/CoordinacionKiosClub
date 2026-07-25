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

// Paleta "enterprise claro" (referencia: Config. Tiendas): fondo slate, tarjetas
// blancas con borde sutil, azul primario #2563EB, textos slate.
const S: Record<string, React.CSSProperties> = {
  page:    { minHeight: '100vh', background: '#F8FAFC', paddingBottom: 40 },
  header:  { background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 },
  body:    { padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520, margin: '0 auto' },
  card:    { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.06)' },
  label:   { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 6 },
  input:   { width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '11px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, color: '#0F172A', background: '#fff' },
  sectionTitle: { margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' as const },
};

function inputNum(extra?: React.CSSProperties): React.CSSProperties {
  return { ...S.input, fontSize: 20, fontWeight: 700, textAlign: 'center', ...extra };
}

export function RecepcionClient() {
  const params  = useSearchParams();
  const urlCod  = params?.get('cod') ?? '';
  const urlP    = parseInt(params?.get('p') ?? '0', 10);
  const urlB    = parseInt(params?.get('b') ?? '0', 10);
  const g       = params?.get('g') ?? '';
  const drv     = params?.get('drv') ?? '';
  // Soporte para deep-link con ID canónico:   /recepcion?id=P11023 31052026P
  const canonId = (params?.get('id') ?? '').trim();

  // Datos resueltos: arrancan desde la URL y se sobreescriben si se resuelve un canonId
  const [cod, setCod] = useState(urlCod);
  const [p,   setP]   = useState(urlP);
  const [b,   setB]   = useState(urlB);
  const [lookupLoading, setLookupLoading] = useState(Boolean(canonId));
  const [lookupError,   setLookupError]   = useState('');

  const [done,       setDone]       = useState(false);
  const [palletsRec, setPalletsRec] = useState(String(urlP));
  const [bultosRec,  setBultosRec]  = useState(String(urlB));
  const [receptor,   setReceptor]   = useState('');
  const [rut,        setRut]        = useState('');
  const [hasSig,     setHasSig]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // OTP de recepción: la tienda pide un código a SU correo (tiendas.correos) y lo ingresa para
  // poder confirmar. El QR solo no basta → verifica identidad sin crear un usuario por tienda.
  const [otpSent,     setOtpSent]     = useState(false);
  const [otpCode,     setOtpCode]     = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpToken,    setOtpToken]    = useState('');
  const [otpEmail,    setOtpEmail]    = useState('');
  const [otpMasked,   setOtpMasked]   = useState('');
  const [otpBusy,     setOtpBusy]     = useState(false);
  const [otpError,    setOtpError]    = useState('');

  const store = TIENDAS_INICIAL[cod];
  const guias = g ? g.split(',').filter(Boolean) : [];

  // Si llega un id canónico, resolver contra /api/pallet-lookup para hidratar
  // cod + cantidades esperadas. Si falla, dejamos el flujo "Código inválido".
  useEffect(() => {
    if (!canonId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pallet-lookup?id=${encodeURIComponent(canonId)}`);
        if (!res.ok) {
          if (!cancelled) { setLookupError('ID no encontrado'); setLookupLoading(false); }
          return;
        }
        const json = await res.json() as {
          data?: { cod: string; n_pallets: number; n_bultos: number };
        };
        const d = json.data;
        if (!cancelled && d?.cod) {
          setCod(d.cod);
          setP(d.n_pallets);
          setB(d.n_bultos);
          setPalletsRec(String(d.n_pallets));
          setBultosRec(String(d.n_bultos));
        } else if (!cancelled) {
          setLookupError('ID no encontrado');
        }
      } catch {
        if (!cancelled) setLookupError('Error de conexión');
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canonId]);

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
      ctx.strokeStyle = '#0F172A';
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

  const maskEmail = (e: string): string => {
    const [u, dom] = e.split('@');
    if (!dom) return e;
    const uu = u.length <= 2 ? `${u[0]}*` : `${u.slice(0, 2)}***`;
    return `${uu}@${dom}`;
  };

  const enviarCodigo = async () => {
    setOtpBusy(true); setOtpError('');
    try {
      const res = await fetch('/api/recepcion-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_cod: cod, store_name: store?.n || cod }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo enviar el código');
      setOtpMasked(maskEmail(d.email_sent_to || ''));
      setOtpSent(true);
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : 'Error al enviar el código');
    } finally { setOtpBusy(false); }
  };

  const verificarCodigo = async () => {
    if (otpCode.trim().length !== 6) { setOtpError('Ingresa los 6 dígitos'); return; }
    setOtpBusy(true); setOtpError('');
    try {
      const res = await fetch('/api/recepcion-otp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_cod: cod, otp: otpCode.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.valid) throw new Error(d.error || 'Código incorrecto');
      setOtpToken(d.token); setOtpEmail(d.email); setOtpVerified(true);
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : 'Código incorrecto');
    } finally { setOtpBusy(false); }
  };

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
          canonicalId: canonId || undefined,
          otpToken,
          otpEmail,
          codigoVerificacion: otpCode.trim(),
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

  /* ── Resolviendo ID canónico ── */
  if (lookupLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#0F172A' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#334155' }}>Buscando datos del pallet…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  /* ── QR inválido ── */
  if (!cod || !store) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: '#0F172A' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Código inválido</p>
          <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 8 }}>
            {lookupError || 'El QR escaneado no contiene datos válidos.'}
          </p>
        </div>
      </div>
    );
  }

  /* ── Éxito ── */
  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <div style={{ textAlign: 'center', color: '#0F172A' }}>
          <p style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>¡Recepción confirmada!</p>
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 6 }}>{store.n} — {formatCod(cod)}</p>
        </div>
        {drv && (
          <a href={drv} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', maxWidth: 360, padding: '16px 0',
            background: '#2563EB', color: '#fff', borderRadius: 12, fontWeight: 700,
            fontSize: 18, textDecoration: 'none', boxShadow: '0 4px 16px rgba(37,99,235,0.30)',
          }}>
            ↓ Descargar Guías PDF
          </a>
        )}
      </div>
    );
  }

  /* ── Paso 1: verificación por código al correo de la tienda ── */
  if (!otpVerified) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-kiosclub.webp" alt="KiosClub" style={{ height: 34, width: 'auto', display: 'block' }} />
          <div style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: 12 }}>
            <p style={{ margin: 0, color: '#0F172A', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>Recepción de Despacho</p>
            <p style={{ margin: 0, color: '#94A3B8', fontSize: 12, lineHeight: 1.25 }}>Verifica tu tienda para continuar</p>
          </div>
        </div>
        <div style={S.body}>
          <div style={S.card}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tienda destino</p>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#2563EB', lineHeight: 1, fontFamily: 'monospace' }}>{formatCod(cod)}</p>
            <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{store.n}</p>
          </div>
          <div style={S.card}>
            {!otpSent ? (
              <>
                <p style={{ margin: '0 0 14px', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  Para confirmar la recepción te enviaremos un <strong>código de 6 dígitos</strong> al correo registrado de la tienda.
                </p>
                <button onClick={enviarCodigo} disabled={otpBusy}
                  style={{ width: '100%', padding: '14px 0', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: otpBusy ? 0.6 : 1 }}>
                  {otpBusy ? 'Enviando…' : 'Enviar código'}
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 4px', fontSize: 14, color: '#334155' }}>Código enviado a:</p>
                <p style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1B2A6B' }}>{otpMasked}</p>
                <label style={S.label}>Ingresa el código</label>
                <input value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" placeholder="––––––"
                  style={{ ...inputNum(), letterSpacing: 8, marginBottom: 12 }} />
                <button onClick={verificarCodigo} disabled={otpBusy}
                  style={{ width: '100%', padding: '14px 0', background: '#16A34A', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer', opacity: otpBusy ? 0.6 : 1 }}>
                  {otpBusy ? 'Verificando…' : 'Verificar y continuar'}
                </button>
                <button onClick={enviarCodigo} disabled={otpBusy}
                  style={{ width: '100%', marginTop: 8, padding: '10px 0', background: 'transparent', color: '#64748B', border: 'none', fontSize: 13, cursor: 'pointer' }}>
                  Reenviar código
                </button>
              </>
            )}
            {otpError && <p style={{ margin: '12px 0 0', color: '#DC2626', fontSize: 13, textAlign: 'center' }}>{otpError}</p>}
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ── Formulario principal ── */
  const Spinner = <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;

  return (
    <div style={S.page}>
      <div style={S.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-kiosclub.webp" alt="KiosClub" style={{ height: 34, width: 'auto', display: 'block' }} />
        <div style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: 12 }}>
          <p style={{ margin: 0, color: '#0F172A', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>Recepción de Despacho</p>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: 12, lineHeight: 1.25 }}>Confirma la carga recibida</p>
        </div>
      </div>

      <div style={S.body}>
        {/* Store card */}
        <div style={S.card}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tienda destino</p>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#2563EB', lineHeight: 1, fontFamily: 'monospace' }}>{formatCod(cod)}</p>
          <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#0F172A' }}>{store.n}</p>
          {store.d && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B', lineHeight: 1.45 }}>{store.d}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {p > 0 && <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>{p} pallet{p !== 1 ? 's' : ''} enviado{p !== 1 ? 's' : ''}</span>}
            {b > 0 && <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>{b} bulto{b !== 1 ? 's' : ''} enviado{b !== 1 ? 's' : ''}</span>}
            {guias.length > 0 && <span style={{ background: '#F1F5F9', color: '#64748B', fontSize: 12, fontFamily: 'monospace', padding: '4px 12px', borderRadius: 99 }}>Guía {guias.join(' · ')}</span>}
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
              border: `${hasSig ? '2px solid #2563EB' : '2px dashed #CBD5E1'}`,
              borderRadius: 10, touchAction: 'none', cursor: 'crosshair',
              background: hasSig ? '#EFF6FF' : '#F8FAFC',
              display: 'block',
            }}
          />
          {!hasSig && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 8, marginBottom: 0 }}>
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
            width: '100%', padding: '16px 0',
            background: loading ? '#93C5FD' : '#2563EB',
            color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 19,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 16px rgba(37,99,235,0.30)',
          }}>
          {loading ? <>{Spinner} Guardando…</> : 'Confirmar Recepción'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #2563EB !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }`}</style>
    </div>
  );
}
