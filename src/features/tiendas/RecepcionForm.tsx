'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { TIENDAS_INICIAL } from '../../features/despacho/rutas/data/tiendas';
import { formatCod } from '../../features/despacho/rutas/utils/helpers';
import type { FotoRegistro, QRData, SelloEstado } from './RecepcionTiendaScreen';
import { formatHora } from './RecepcionTiendaScreen';

interface Props {
  qrData: QRData;
  selloLlegada: FotoRegistro;
  selloEstado: SelloEstado;
  cdFoto: FotoRegistro | null;
  onDone: () => void;
  onBack: () => void;
}

type Phase = 'filling' | 'verifying' | 'sello-salida';

const S: Record<string, React.CSSProperties> = {
  card:         { background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' },
  label:        { display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 },
  input:        { width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, color: '#1F2937' },
  sectionTitle: { margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' as const },
};

function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const dv     = clean.slice(-1);
  const num    = clean.slice(0, -1);
  const dotted = num.length > 3 ? num.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : num;
  return `${dotted}-${dv}`;
}

async function uploadPhoto(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from('recepcion-fotos').upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from('recepcion-fotos').getPublicUrl(path);
  return publicUrl;
}

export function RecepcionForm({ qrData, selloLlegada, selloEstado, cdFoto, onDone, onBack }: Props) {
  const { cod, palletsSent, bultosSent, contenedoresSent, guias, driveFileId } = qrData;
  const store = TIENDAS_INICIAL[cod];

  // Form fields
  const [conductor,        setConductor]        = useState('');
  const [pionetas,         setPionetas]         = useState<string[]>(['']);
  const [palletsRec,       setPalletsRec]       = useState(String(palletsSent));
  const [bultosRec,        setBultosRec]        = useState(String(bultosSent));
  const [contenedoresRec,  setContenedoresRec]  = useState(String(contenedoresSent));
  const [estadoFiles,    setEstadoFiles]    = useState<File[]>([]);
  const [estadoPreviews, setEstadoPreviews] = useState<string[]>([]);
  const [receptor,       setReceptor]       = useState('');
  const [rut,            setRut]            = useState('');
  const [observaciones,  setObservaciones]  = useState('');
  const [hasSig,         setHasSig]         = useState(false);

  // Verification
  const [phase,      setPhase]      = useState<Phase>('filling');
  const [otpToken,   setOtpToken]   = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [code,       setCode]       = useState('');

  // Sello salida (capturado después de verificación)
  const [selloSalida, setSelloSalida] = useState<FotoRegistro | null>(null);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef    = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const init = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) { requestAnimationFrame(init); return; }
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#1B2A6B'; ctx.lineWidth = 2.5;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    };
    requestAnimationFrame(init);
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true; lastRef.current = getPos(e);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    lastRef.current = pos; setHasSig(true);
  }
  function onUp() { drawingRef.current = false; }
  function clearSig() {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSig(false);
  }

  function addEstadoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setEstadoFiles(prev => [...prev, ...files]);
    setEstadoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    e.target.value = '';
  }
  function removeEstadoFoto(idx: number) {
    URL.revokeObjectURL(estadoPreviews[idx]);
    setEstadoFiles(f => f.filter((_, i) => i !== idx));
    setEstadoPreviews(p => p.filter((_, i) => i !== idx));
  }

  function addPioneta() { setPionetas(prev => [...prev, '']); }
  function removePioneta(idx: number) { setPionetas(prev => prev.filter((_, i) => i !== idx)); }
  function updatePioneta(idx: number, val: string) { setPionetas(prev => prev.map((p, i) => i === idx ? val : p)); }

  function handleSelloSalidaCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setSelloSalida({ file: f, hora: new Date().toISOString(), preview: URL.createObjectURL(f) });
    e.target.value = '';
  }

  // Step 1: Validate form and send OTP
  const handleNextStep = async () => {
    if (!conductor.trim()) { setError('Ingresa el nombre del conductor'); return; }
    if (!receptor.trim())  { setError('Ingresa el nombre del receptor'); return; }
    if (!rut.trim())       { setError('Ingresa el RUT'); return; }
    if (!hasSig)           { setError('Se requiere firma del receptor'); return; }
    setError(''); setLoading(true);
    try {
      const { data } = await supabase.from('tiendas').select('correos').eq('codigo', cod).single();
      const email = (data?.correos ?? '').trim();
      if (!email || !email.includes('@')) {
        setError('La tienda no tiene correo registrado. Contacta al administrador.'); return;
      }
      setStoreEmail(email);
      const res = await fetch('/api/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, cod, tienda: store?.n ?? cod }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo enviar el código');
      setOtpToken(d.token);
      setPhase('verifying');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al enviar código');
    } finally { setLoading(false); }
  };

  // Step 2: Verify code → move to sello-salida
  const handleVerify = async () => {
    if (code.length !== 6) { setError('Ingresa el código de 6 dígitos'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/recepcion/verify-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: otpToken, email: storeEmail, code }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Código incorrecto');
      setPhase('sello-salida');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Código incorrecto. Intenta de nuevo.');
    } finally { setLoading(false); }
  };

  const handleResendCode = async () => {
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: storeEmail, cod, tienda: store?.n ?? cod }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo reenviar');
      setOtpToken(d.token); setCode('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al reenviar');
    } finally { setLoading(false); }
  };

  // Step 3: Upload all photos and save
  const handleFinalSave = async () => {
    if (!selloSalida) { setError('Toma la foto del sello de salida primero'); return; }
    setError(''); setLoading(true);
    try {
      const uid = `${cod}_${Date.now()}`;

      // Upload sello llegada
      const llegadaExt = selloLlegada.file.name.split('.').pop() ?? 'jpg';
      const selloLlegadaUrl = await uploadPhoto(selloLlegada.file, `${uid}_sello_llegada.${llegadaExt}`);

      // Upload sello salida
      const salidaExt = selloSalida.file.name.split('.').pop() ?? 'jpg';
      const selloSalidaUrl = await uploadPhoto(selloSalida.file, `${uid}_sello_salida.${salidaExt}`);

      // Upload CD foto if present
      let cdSalidaUrl = '';
      if (cdFoto) {
        const cdExt = cdFoto.file.name.split('.').pop() ?? 'jpg';
        cdSalidaUrl = await uploadPhoto(cdFoto.file, `${uid}_cd_salida.${cdExt}`);
      }

      // Upload estado photos
      const estadoFotoUrls: string[] = [];
      for (let i = 0; i < estadoFiles.length; i++) {
        const ext = estadoFiles[i].name.split('.').pop() ?? 'jpg';
        estadoFotoUrls.push(await uploadPhoto(estadoFiles[i], `${uid}_estado${i + 1}.${ext}`));
      }

      const signatureDataUrl = canvasRef.current!.toDataURL('image/png');

      const res = await fetch('/api/recepcion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cod,
          tienda:            store?.n ?? cod,
          direccion:         store?.d ?? '',
          palletsSent,       bultosSent,       contenedoresSent,
          palletsRecibidos:      parseInt(palletsRec)      || 0,
          bultosRecibidos:       parseInt(bultosRec)       || 0,
          contenedoresRecibidos: parseInt(contenedoresRec) || 0,
          conductor:         conductor.trim(),
          pionetas:          pionetas.filter(p => p.trim()).join(', '),
          receptor:          receptor.trim(),
          rut:               rut.trim(),
          observaciones:     observaciones.trim(),
          selloEstado,
          selloLlegadaUrl,   selloLlegadaHora:  selloLlegada.hora,
          selloSalidaUrl,    selloSalidaHora:   selloSalida.hora,
          cdSalidaUrl,       cdSalidaHora:      cdFoto?.hora ?? '',
          estadoFotoUrls,    signatureDataUrl,
          codigoVerificacion: code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Intenta de nuevo.');
    } finally { setLoading(false); }
  };

  const inputNum: React.CSSProperties = { ...S.input, fontSize: 22, fontWeight: 700, textAlign: 'center' };

  // ── FASE: Verificación ──────────────────────────────────────────────────────
  if (phase === 'verifying') {
    return (
      <div style={{ paddingBottom: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 0' }}>
          <div style={S.card}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>📧</div>
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Verificación requerida</p>
              <p style={{ margin: '0 0 4px', fontSize: 15, color: '#1F2937', fontWeight: 600 }}>Código enviado a</p>
              <p style={{ margin: 0, fontSize: 14, color: '#1B2A6B', fontWeight: 700 }}>{storeEmail}</p>
            </div>
            <div style={{ background: '#F0F4FF', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                Pide a la persona de la tienda el código de 6 dígitos que recibió en su correo.
              </p>
            </div>
            <label style={S.label}>Código de verificación</label>
            <input type="text" inputMode="numeric" maxLength={6} value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" autoFocus
              style={{ ...inputNum, letterSpacing: '0.4em', fontSize: 34, padding: '14px 0', textAlign: 'center' }} />
          </div>

          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>⚠️ {error}</div>}

          <button onClick={handleVerify} disabled={loading || code.length !== 6}
            style={{ width: '100%', padding: '18px 0', background: loading || code.length !== 6 ? '#93C5FD' : '#1B2A6B', color: '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 18, cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {loading ? <><div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Verificando…</> : 'Verificar código →'}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <button onClick={handleResendCode} disabled={loading} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Reenviar código</button>
            <button onClick={() => { setPhase('filling'); setCode(''); setError(''); }} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: 0 }}>← Volver al formulario</button>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #1B2A6B !important; }`}</style>
      </div>
    );
  }

  // ── FASE: Sello de salida ──────────────────────────────────────────────────
  if (phase === 'sello-salida') {
    return (
      <div style={{ paddingBottom: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 0' }}>

          {/* Header de progreso */}
          <div style={{ background: 'linear-gradient(135deg, #1B2A6B, #2D3F8C)', borderRadius: 20, padding: '20px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>🔒</div>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Último paso</p>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>Colocar y fotografiar sello de salida</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Sella el vehículo antes de partir y toma la foto</p>
          </div>

          {/* Comparativa sello llegada vs salida */}
          <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Trazabilidad de sellos</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {/* Llegada */}
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>LLEGADA</p>
                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
                  <img src={selloLlegada.preview} alt="llegada" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 6px', fontSize: 10, color: '#fff', fontWeight: 700 }}>🕐 {formatHora(selloLlegada.hora)}</div>
                </div>
              </div>
              {/* Salida */}
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>SALIDA</p>
                {selloSalida ? (
                  <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
                    <img src={selloSalida.preview} alt="salida" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '4px 6px', fontSize: 10, color: '#fff', fontWeight: 700 }}>🕐 {formatHora(selloSalida.hora)}</div>
                    <button onClick={() => setSelloSalida(null)} style={{ position: 'absolute', top: 4, right: 4, background: '#EF4444', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, border: '2.5px dashed #CBD5E1', background: '#F8FAFF', cursor: 'pointer', aspectRatio: '1' }}>
                    <span style={{ fontSize: 22 }}>📸</span>
                    <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textAlign: 'center' }}>Toca para fotografiar</span>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleSelloSalidaCaptura} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>⚠️ {error}</div>}

          <button onClick={handleFinalSave} disabled={loading || !selloSalida}
            style={{ width: '100%', padding: '18px 0', background: loading || !selloSalida ? '#E5E7EB' : '#10B981', color: loading || !selloSalida ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 18, cursor: loading || !selloSalida ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: !selloSalida ? 'none' : '0 4px 20px rgba(16,185,129,0.4)' }}>
            {loading ? <><div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Guardando…</> : !selloSalida ? '📸  Toma la foto del sello de salida primero' : 'Finalizar entrega ✓'}
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── FASE: Formulario principal ─────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 0' }}>

        {/* Store info + sello llegada confirmado */}
        <div style={S.card}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', padding: '0 0 10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Volver al inicio
          </button>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tienda destino</p>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#1B2A6B', lineHeight: 1, fontFamily: 'monospace' }}>{formatCod(cod)}</p>
          <p style={{ margin: '5px 0 0', fontSize: 17, fontWeight: 700, color: '#1F2937' }}>{store?.n ?? cod}</p>
          {store?.d && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>{store.d}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {palletsSent      > 0 && <span style={{ background: '#EEF2FF', color: '#1B2A6B', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>{palletsSent} pallets enviados</span>}
            {bultosSent       > 0 && <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>{bultosSent} bultos enviados</span>}
            {contenedoresSent > 0 && <span style={{ background: 'rgba(107,33,168,0.12)', color: '#6B21A8', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>{contenedoresSent} contenedores enviados</span>}
            {guias.length > 0 && <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontFamily: 'monospace', padding: '4px 10px', borderRadius: 99 }}>Guía {guias.join(' · ')}</span>}
          </div>

          {/* Sello llegada confirmado */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, background: '#F0F9FF', borderRadius: 12, padding: '10px 12px' }}>
            <img src={selloLlegada.preview} alt="sello llegada" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#0369A1' }}>SELLO AL LLEGAR — {selloEstado.toUpperCase()}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#6B7280' }}>🕐 {formatHora(selloLlegada.hora)}</p>
            </div>
          </div>
        </div>

        {/* Personal de entrega */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Personal de entrega</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={S.label}>Nombre del conductor <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" value={conductor} onChange={e => setConductor(e.target.value)} placeholder="Ej: Pedro Martínez" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Pioneta(s) <span style={{ fontWeight: 400, color: '#9CA3AF' }}>— opcional</span></label>
              {pionetas.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input type="text" value={p} onChange={e => updatePioneta(idx, e.target.value)} placeholder={`Pioneta ${idx + 1}`} style={{ ...S.input, flex: 1 }} />
                  {pionetas.length > 1 && <button onClick={() => removePioneta(idx)} style={{ background: '#FEE2E2', border: 'none', borderRadius: 10, width: 38, flexShrink: 0, cursor: 'pointer', fontSize: 18, color: '#EF4444' }}>×</button>}
                </div>
              ))}
              <button onClick={addPioneta} style={{ background: 'none', border: '1.5px dashed #D1D5DB', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#6B7280', cursor: 'pointer', width: '100%', fontWeight: 600 }}>+ Agregar pioneta</button>
            </div>
          </div>
        </div>

        {/* Cantidad recibida */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Cantidad recibida</p>
          <div style={{ display: 'grid', gridTemplateColumns: contenedoresSent > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>Pallets recibidos</label>
              <input type="number" min="0" inputMode="numeric" value={palletsRec} onChange={e => setPalletsRec(e.target.value)} style={inputNum} />
            </div>
            <div>
              <label style={S.label}>Bultos recibidos</label>
              <input type="number" min="0" inputMode="numeric" value={bultosRec} onChange={e => setBultosRec(e.target.value)} style={inputNum} />
            </div>
            {contenedoresSent > 0 && (
              <div>
                <label style={S.label}>Contenedores recibidos</label>
                <input type="number" min="0" inputMode="numeric" value={contenedoresRec} onChange={e => setContenedoresRec(e.target.value)} style={inputNum} />
              </div>
            )}
          </div>
        </div>

        {/* Fotos estado recepción */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Fotos de estado <span style={{ color: '#D1D5DB' }}>— opcional</span></p>
          {estadoPreviews.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {estadoPreviews.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                  <img src={url} alt={`estado ${idx + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>#{idx + 1}</div>
                  <button onClick={() => removeEstadoFoto(idx)} style={{ position: 'absolute', top: 4, right: 4, background: '#EF4444', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '2px dashed #D1D5DB', borderRadius: 12, cursor: 'pointer' }}>
            <span style={{ fontSize: 24 }}>📷</span>
            <div>
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{estadoPreviews.length > 0 ? `+ Agregar (${estadoPreviews.length} foto${estadoPreviews.length !== 1 ? 's' : ''})` : 'Fotografiar estado del despacho'}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Pallets, daños, faltantes…</div>
            </div>
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={addEstadoFiles} />
          </label>
        </div>

        {/* Datos del receptor */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Datos del receptor</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={S.label}>Nombre completo <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" value={receptor} onChange={e => setReceptor(e.target.value)} placeholder="Ej: Juan Pérez González" style={S.input} />
            </div>
            <div>
              <label style={S.label}>RUT <span style={{ color: '#EF4444' }}>*</span></label>
              <input type="text" value={rut} onChange={e => setRut(formatRut(e.target.value))} placeholder="12.345.678-9" inputMode="text" autoComplete="off" style={{ ...S.input, fontFamily: 'monospace' }} />
            </div>
          </div>
        </div>

        {/* Observaciones */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Observaciones <span style={{ color: '#D1D5DB' }}>— opcional</span></p>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3} placeholder="Ej: pallet con esquina dañada, faltó un bulto…"
            style={{ ...S.input, resize: 'none', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }} />
        </div>

        {/* Firma */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={S.sectionTitle}>Firma del receptor <span style={{ color: '#EF4444' }}>*</span></p>
            {hasSig && <button onClick={clearSig} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Borrar</button>}
          </div>
          <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
            style={{ width: '100%', height: 140, border: `2px ${hasSig ? 'solid #1B2A6B' : 'dashed #D1D5DB'}`, borderRadius: 12, touchAction: 'none', cursor: 'crosshair', background: hasSig ? '#F8FAFF' : '#FAFAFA', display: 'block' }} />
          {!hasSig && <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', margin: '8px 0 0' }}>Dibuja tu firma en el área de arriba</p>}
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>⚠️ {error}</div>}

        <button onClick={handleNextStep} disabled={loading}
          style={{ width: '100%', padding: '18px 0', background: loading ? '#93C5FD' : '#1B2A6B', color: '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 18, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: loading ? 'none' : '0 4px 20px rgba(27,42,107,0.45)' }}>
          {loading ? <><div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Enviando código…</> : 'Siguiente / Validar →'}
        </button>

        {driveFileId && (
          <a href={`https://drive.google.com/file/d/${driveFileId}/view`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', background: 'rgba(27,42,107,0.08)', border: '1.5px solid rgba(27,42,107,0.2)', color: '#1B2A6B', borderRadius: 14, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
            ↓ Ver guías de despacho
          </a>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } input:focus { border-color: #1B2A6B !important; } textarea:focus { border-color: #1B2A6B !important; outline: none; }`}</style>
    </div>
  );
}
