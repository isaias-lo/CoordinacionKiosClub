'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { TIENDAS_INICIAL } from '../../features/despacho/rutas/data/tiendas';
import { formatCod } from '../../features/despacho/rutas/utils/helpers';

interface QRData {
  cod: string;
  palletsSent: number;
  bultosSent: number;
  guias: string[];
  driveFileId?: string;
}

interface Props {
  qrData: QRData;
  onDone: () => void;
  onBack: () => void;
}

type SelloEstado = 'intacto' | 'roto' | 'ausente';

const SELLO_OPTS: { value: SelloEstado; label: string; color: string; bg: string }[] = [
  { value: 'intacto', label: 'Intacto', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  { value: 'roto',    label: 'Roto',    color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
  { value: 'ausente', label: 'Ausente', color: '#F97316', bg: 'rgba(249,115,22,0.12)'  },
];

function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const dv  = clean.slice(-1);
  const num = clean.slice(0, -1);
  const dotted = num.length > 3 ? num.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : num;
  return `${dotted}-${dv}`;
}

async function uploadPhoto(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from('recepcion-fotos').upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  const { data: { publicUrl } } = supabase.storage.from('recepcion-fotos').getPublicUrl(path);
  return publicUrl;
}

const S: Record<string, React.CSSProperties> = {
  card:  { background: '#fff', borderRadius: 20, padding: 18, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 },
  input: { width: '100%', border: '2px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, color: '#1F2937' },
  sectionTitle: { margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' as const },
};

export function RecepcionForm({ qrData, onDone, onBack }: Props) {
  const { cod, palletsSent, bultosSent, guias, driveFileId } = qrData;
  const store = TIENDAS_INICIAL[cod];

  const [palletsRec,  setPalletsRec]  = useState(String(palletsSent));
  const [bultosRec,   setBultosRec]   = useState(String(bultosSent));
  const [selloEstado, setSelloEstado] = useState<SelloEstado | null>(null);
  const [selloFile,   setSelloFile]   = useState<File | null>(null);
  const [selloPreview,setSelloPreview]= useState('');
  const [estadoFiles, setEstadoFiles] = useState<File[]>([]);
  const [estadoPreviews, setEstadoPreviews] = useState<string[]>([]);
  const [receptor,    setReceptor]    = useState('');
  const [rut,         setRut]         = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [hasSig,      setHasSig]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef    = useRef({ x: 0, y: 0 });

  // Canvas init
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
      ctx.strokeStyle = '#1B2A6B';
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
    };
    requestAnimationFrame(init);
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = getPos(e);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
    lastRef.current = pos;
    setHasSig(true);
  }
  function onUp() { drawingRef.current = false; }
  function clearSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSig(false);
  }

  function handleSelloFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (selloPreview) URL.revokeObjectURL(selloPreview);
    setSelloFile(f);
    setSelloPreview(URL.createObjectURL(f));
    e.target.value = '';
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

  const handleConfirm = async () => {
    if (!receptor.trim()) { setError('Ingresa el nombre del receptor'); return; }
    if (!rut.trim())      { setError('Ingresa el RUT'); return; }
    if (!hasSig)          { setError('Se requiere firma del receptor'); return; }
    if (!selloEstado)     { setError('Indica el estado del sello del camión'); return; }
    setError(''); setLoading(true);

    try {
      const uid  = `${cod}_${Date.now()}`;
      // Upload sello photo (optional)
      let selloFotoUrl = '';
      if (selloFile) {
        const ext = selloFile.name.split('.').pop() ?? 'jpg';
        selloFotoUrl = await uploadPhoto(selloFile, `${uid}_sello.${ext}`);
      }
      // Upload estado photos (multiple)
      const estadoFotoUrls: string[] = [];
      for (let i = 0; i < estadoFiles.length; i++) {
        const f   = estadoFiles[i];
        const ext = f.name.split('.').pop() ?? 'jpg';
        const url = await uploadPhoto(f, `${uid}_estado${i + 1}.${ext}`);
        estadoFotoUrls.push(url);
      }
      // Upload signature
      const signatureDataUrl = canvasRef.current!.toDataURL('image/png');

      const res = await fetch('/api/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cod,
          tienda:             store?.n || cod,
          direccion:          store?.d || '',
          palletsSent,
          bultosSent,
          palletsRecibidos:   parseInt(palletsRec) || 0,
          bultosRecibidos:    parseInt(bultosRec)  || 0,
          receptor:           receptor.trim(),
          rut:                rut.trim(),
          observaciones:      observaciones.trim(),
          selloEstado,
          selloFotoUrl,
          estadoFotoUrls,
          signatureDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const inputNum: React.CSSProperties = { ...S.input, fontSize: 22, fontWeight: 700, textAlign: 'center' };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 0' }}>

        {/* Back + store card */}
        <div style={S.card}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, cursor: 'pointer', padding: '0 0 10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Escanear otro QR
          </button>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tienda destino</p>
          <p style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#1B2A6B', lineHeight: 1, fontFamily: 'monospace' }}>{formatCod(cod)}</p>
          <p style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: '#1F2937' }}>{store?.n ?? cod}</p>
          {store?.d && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>{store.d}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {palletsSent > 0 && <span style={{ background: '#EEF2FF', color: '#1B2A6B', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>{palletsSent} pallet{palletsSent !== 1 ? 's' : ''} enviado{palletsSent !== 1 ? 's' : ''}</span>}
            {bultosSent  > 0 && <span style={{ background: '#FEF3C7', color: '#D97706', fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 99 }}>{bultosSent} bulto{bultosSent !== 1 ? 's' : ''} enviado{bultosSent !== 1 ? 's' : ''}</span>}
            {guias.length > 0 && <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 12, fontFamily: 'monospace', padding: '4px 12px', borderRadius: 99 }}>Guía {guias.join(' · ')}</span>}
          </div>
        </div>

        {/* Cantidad recibida */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Cantidad recibida</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>Pallets recibidos</label>
              <input type="number" min="0" inputMode="numeric" value={palletsRec} onChange={e => setPalletsRec(e.target.value)} style={inputNum} />
            </div>
            <div>
              <label style={S.label}>Bultos recibidos</label>
              <input type="number" min="0" inputMode="numeric" value={bultosRec} onChange={e => setBultosRec(e.target.value)} style={inputNum} />
            </div>
          </div>
        </div>

        {/* Sello del camión */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Sello del camión</p>
          <p style={S.label}>Estado del sello</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {SELLO_OPTS.map(opt => (
              <button key={opt.value} onClick={() => setSelloEstado(opt.value)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12, border: `2px solid ${selloEstado === opt.value ? opt.color : '#E5E7EB'}`,
                  background: selloEstado === opt.value ? opt.bg : '#fff',
                  color: selloEstado === opt.value ? opt.color : '#6B7280',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          <p style={S.label}>Foto del sello <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(opcional)</span></p>
          {selloPreview ? (
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 0 }}>
              <img src={selloPreview} alt="sello" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block', borderRadius: 12 }} />
              <button onClick={() => { URL.revokeObjectURL(selloPreview); setSelloPreview(''); setSelloFile(null); }}
                style={{ position: 'absolute', top: 8, right: 8, background: '#EF4444', color: '#fff', border: 'none', borderRadius: '50%', width: 28, height: 28, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '2px dashed #D1D5DB', borderRadius: 12, cursor: 'pointer' }}>
              <span style={{ fontSize: 24 }}>🔏</span>
              <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>Toca para fotografiar el sello</span>
              <input type="file" accept="image/*" className="hidden" style={{ display: 'none' }} onChange={handleSelloFile} />
            </label>
          )}
        </div>

        {/* Fotos del estado de la recepción */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Estado de la recepción</p>
          <p style={S.label}>Fotos de respaldo <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(pallets, estado, daños…)</span></p>
          {estadoPreviews.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {estadoPreviews.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
                  <img src={url} alt={`estado ${idx + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 4, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>#{idx + 1}</div>
                  <button onClick={() => removeEstadoFoto(idx)}
                    style={{ position: 'absolute', top: 4, right: 4, background: '#EF4444', color: '#fff', border: 'none', borderRadius: '50%', width: 26, height: 26, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '2px dashed #D1D5DB', borderRadius: 12, cursor: 'pointer' }}>
            <span style={{ fontSize: 24 }}>📷</span>
            <div>
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                {estadoPreviews.length > 0 ? `+ Agregar más fotos (${estadoPreviews.length} agregada${estadoPreviews.length !== 1 ? 's' : ''})` : 'Fotografiar estado del despacho'}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Puedes seleccionar múltiples fotos a la vez</div>
            </div>
            {/* multiple permite selección múltiple desde galería */}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={addEstadoFiles} />
          </label>
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

        {/* Observaciones */}
        <div style={S.card}>
          <p style={S.sectionTitle}>Observaciones <span style={{ color: '#D1D5DB' }}>— opcional</span></p>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3} placeholder="Ej: pallet con esquina dañada, faltó un bulto por camión..."
            style={{ ...S.input, resize: 'none', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5 }} />
        </div>

        {/* Firma */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={S.sectionTitle}>Firma del receptor</p>
            {hasSig && (
              <button onClick={clearSig} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Borrar</button>
            )}
          </div>
          <canvas
            ref={canvasRef}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
            style={{ width: '100%', height: 140, border: `2px ${hasSig ? 'solid #1B2A6B' : 'dashed #D1D5DB'}`, borderRadius: 12, touchAction: 'none', cursor: 'crosshair', background: hasSig ? '#F8FAFF' : '#FAFAFA', display: 'block' }}
          />
          {!hasSig && <p style={{ textAlign: 'center', fontSize: 12, color: '#9CA3AF', margin: '8px 0 0' }}>Dibuja tu firma en el área de arriba</p>}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>
            ⚠️ {error}
          </div>
        )}

        <button onClick={handleConfirm} disabled={loading}
          style={{ width: '100%', padding: '18px 0', background: loading ? '#93C5FD' : '#1B2A6B', color: '#fff', border: 'none', borderRadius: 18, fontWeight: 700, fontSize: 18, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: loading ? 'none' : '0 4px 20px rgba(27,42,107,0.45)' }}>
          {loading ? (
            <>
              <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Guardando…
            </>
          ) : 'Confirmar Recepción'}
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
