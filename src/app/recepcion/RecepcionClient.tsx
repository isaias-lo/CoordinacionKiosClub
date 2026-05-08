'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { TIENDAS_INICIAL } from '../../features/despacho/rutas/data/tiendas';
import { formatCod } from '../../features/despacho/rutas/utils/helpers';

function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const dv  = clean.slice(-1);
  const num = clean.slice(0, -1);
  return `${num.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

type Step = 'form' | 'otp' | 'done';

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
  const cod = params.get('cod') || '';
  const p   = parseInt(params.get('p') || '0', 10);
  const b   = parseInt(params.get('b') || '0', 10);
  const g   = params.get('g') || '';
  const drv = params.get('drv') || '';

  const store = TIENDAS_INICIAL[cod];
  const guias = g ? g.split(',').filter(Boolean) : [];

  const [step,       setStep]       = useState<Step>('form');
  const [palletsRec, setPalletsRec] = useState(String(p));
  const [bultosRec,  setBultosRec]  = useState(String(b));
  const [receptor,   setReceptor]   = useState('');
  const [rut,        setRut]        = useState('');
  const [email,      setEmail]      = useState('');
  const [otpCode,    setOtpCode]    = useState('');
  const [otpToken,   setOtpToken]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

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

  /* ── Enviar OTP ── */
  const handleSendOtp = async () => {
    if (!receptor.trim()) { setError('Ingresa el nombre del receptor'); return; }
    if (!rut.trim())      { setError('Ingresa el RUT'); return; }
    if (!email.includes('@')) { setError('Ingresa un correo válido'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), cod, tienda: store?.n || cod }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setOtpToken(data.token);
      setStep('otp');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el código. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Confirmar recepción ── */
  const handleConfirm = async () => {
    if (otpCode.length !== 6) { setError('Ingresa el código de 6 dígitos'); return; }
    setError('');
    setLoading(true);
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
          email: email.trim(),
          otpToken,
          otpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setStep('done');
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
  if (step === 'done') {
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

  /* ── Header y store card (comunes a ambos pasos) ── */
  const StoreCard = (
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
  );

  const Header = (
    <div style={S.header}>
      <div style={S.iconBox}>📦</div>
      <div>
        <p style={{ margin: 0, color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>KiosClub</p>
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 1.2 }}>Recepción de Despacho</p>
      </div>
    </div>
  );

  const ErrorBanner = error ? (
    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>
      {error}
    </div>
  ) : null;

  const Spinner = <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;

  /* ── Paso 2: ingresar código OTP ── */
  if (step === 'otp') {
    return (
      <div style={S.page}>
        {Header}
        <div style={S.body}>
          {StoreCard}

          <div style={S.card}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✉️</div>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Código enviado</p>
              <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
                Revisa el correo de<br />
                <strong style={{ color: '#1B2A6B' }}>{email}</strong>
              </p>
            </div>

            <label style={S.label}>Ingresa el código de 6 dígitos</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="_ _ _ _ _ _"
              style={{ ...inputNum(), letterSpacing: 10, fontFamily: 'monospace', fontSize: 28 }}
              autoFocus
            />

            <button
              onClick={() => { setStep('form'); setOtpCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, marginTop: 12, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', textDecoration: 'underline' }}>
              Volver y reenviar código
            </button>
          </div>

          {ErrorBanner}

          <button
            onClick={handleConfirm}
            disabled={loading || otpCode.length !== 6}
            style={{
              width: '100%', padding: '18px 0',
              background: (loading || otpCode.length !== 6) ? '#86EFAC' : '#16A34A',
              color: '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 20,
              cursor: (loading || otpCode.length !== 6) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: loading ? 'none' : '0 4px 20px rgba(22,163,74,0.45)',
            }}>
            {loading ? <>{Spinner} Verificando…</> : 'Confirmar Recepción'}
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #1B2A6B !important; }`}</style>
      </div>
    );
  }

  /* ── Paso 1: formulario principal ── */
  return (
    <div style={S.page}>
      {Header}
      <div style={S.body}>
        {StoreCard}

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
              <input type="text" value={rut} onChange={e => setRut(formatRut(e.target.value))} placeholder="12.345.678-9" inputMode="numeric" style={{ ...S.input, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={S.label}>Correo electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="receptor@email.com" inputMode="email" style={S.input} />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9CA3AF' }}>Se enviará un código de verificación a este correo</p>
            </div>
          </div>
        </div>

        {ErrorBanner}

        <button
          onClick={handleSendOtp}
          disabled={loading}
          style={{
            width: '100%', padding: '18px 0',
            background: loading ? '#93C5FD' : '#1B2A6B',
            color: '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 20,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 20px rgba(27,42,107,0.45)',
          }}>
          {loading ? <>{Spinner} Enviando código…</> : 'Enviar código de verificación'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #1B2A6B !important; }`}</style>
    </div>
  );
}
