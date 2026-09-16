'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { X, Camera, Image as ImageIcon, Check, Thermometer, Lock, Box, AlertTriangle, CloudOff, Mail, ShieldCheck, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { safeStorageKey } from '@/lib/storageKey';
import { formatRut } from '@/lib/rut';
import { processPhoto } from '@/features/auditoria/utils/photos';
import { encolarEntrega, type EntregaPendiente } from '@/app/conductor-hub/offlineQueue';
import { ENTREGA_FOTOS_BUCKET, subirFotoEntrega } from './entregaFotos';

/**
 * [Panel Conductor · Fase 3+4+5] Registrar la entrega de UNA parada — desde la Fase 5, el ÚNICO
 * camino para hacerlo (se retiró "Entregar en Tienda", que hacía QR+OTP+conteo por separado).
 * Por eso este formulario absorbe sus dos garantías, además de las fotos que decide el `tipo` de
 * la ruta (Fase 0):
 *   - QUIÉN recibió: nombre + RUT (obligatorio) — una foto sola no prueba nada por sí misma.
 *   - Que la TIENDA participó de verdad: mismo código-por-correo (`/api/recepcion-otp`) que ya
 *     usaba el flujo viejo — sin esto el chofer podría "autoconfirmar" sin que nadie de la tienda
 *     esté de acuerdo. Se pide ANTES de las fotos (mismo orden que el flujo viejo): si la tienda no
 *     puede confirmar, no tiene sentido gastar tiempo sacando fotos todavía.
 *   - Fotos: congelado → temperatura del camión (1) + foto(s) de la entrega en tienda (N).
 *            seco      → foto del sello (1) + foto(s) de los pallets (N).
 *
 * Mismo patrón de cámara/galería que `AuditoriaScreen.tsx` (inputs separados, `key` que cambia
 * para forzar el remount — sin esto iOS no vuelve a disparar `onChange` si se elige el MISMO
 * archivo dos veces) y de subida directa a Storage que `RecepcionForm.tsx` (upload → getPublicUrl,
 * ruta saneada con `safeStorageKey` porque el código de tienda puede traer ñ/tildes).
 *
 * Bucket propio `entrega-fotos` (no `recepcion-fotos`): es prueba de entrega de una ruta
 * genérica, no el flujo de recepción-con-OTP de una tienda puntual — mezclar convenciones de
 * nombre en el mismo bucket es fuente de bugs (ver la migración de la Fase 0).
 *
 * [Fase 4] Sin señal en el momento de entregar, la SUBIDA DE FOTOS no se bloquea: cada foto que no
 * logra subir queda "en cola" (con su blob comprimido en memoria) en vez de marcarse error, y
 * "Registrar entrega" pasa a guardar todo en la cola offline (ver offlineQueue.ts) — fotos y
 * datos — en vez de intentar el PATCH. `page.tsx` drena esa cola sola cuando vuelve la señal.
 * El OTP en cambio NO tiene cola: necesita que la tienda participe EN VIVO (leer un correo que
 * llega ahora), así que enviar/verificar el código requiere señal — solo lo que pasa DESPUÉS de
 * verificado (fotos, el PATCH final) puede quedar pendiente de sincronizar.
 */

export interface ParadaEntrega {
  id: number;
  rutaId: number;
  store_cod: string;
  nombre?: string | null;
  direccion?: string | null;
  comuna?: string | null;
}

interface FotoItem {
  preview: string;
  path: string;
  blob?: File;     // se conserva aunque ya se subió — si hay que reintentar, no hay que repetir compresión
  url?: string;
  uploading: boolean;
  queued?: boolean; // no se pudo subir por falta de señal — se resuelve al drenar la cola offline
  error?: string;   // falló por otra razón (no señal) — hay que reintentar a mano
}

function quitarFoto(setItems: Dispatch<SetStateAction<FotoItem[]>>, idx: number) {
  setItems(prev => {
    const it = prev[idx];
    if (it) {
      URL.revokeObjectURL(it.preview);
      // Fire-and-forget: si falla el remove, queda un archivo huérfano en el bucket — no bloquea
      // al chofer por algo que no afecta la entrega.
      void supabase.storage.from(ENTREGA_FOTOS_BUCKET).remove([it.path]).then(() => {}, () => {});
    }
    return prev.filter((_, i) => i !== idx);
  });
}

function FotoGrupo({ titulo, hint, icon: Icon, items, setItems, single, uidBase, slug }: {
  titulo: string; hint: string; icon: LucideIcon;
  items: FotoItem[]; setItems: Dispatch<SetStateAction<FotoItem[]>>;
  single: boolean; uidBase: string; slug: string;
}) {
  const [ver, setVer] = useState(0);

  async function procesarYSubir(files: File[]) {
    if (!files.length) return;
    if (single) {
      // Reemplaza la anterior (1 sola foto en este grupo).
      setItems(prev => { prev.forEach(it => URL.revokeObjectURL(it.preview)); return []; });
    }
    for (let i = 0; i < files.length; i++) {
      const { compressed, previewUrl } = await processPhoto(files[i]);
      const path = `${uidBase}_${slug}_${Date.now()}_${i}.jpg`;
      setItems(prev => [...prev, { preview: previewUrl, path, blob: compressed, uploading: true }]);
      try {
        const url = await subirFotoEntrega(compressed, path);
        setItems(prev => prev.map(p => p.path === path ? { ...p, uploading: false, url } : p));
      } catch {
        // Sin señal: no es un error del chofer — la foto queda en cola, no bloquea la entrega
        // (ver `queued` más abajo). Con señal pero falla igual (permisos, bucket caído, etc.) sí
        // se marca error real y hay que reintentar a mano — silenciarlo ahí escondería un
        // problema que la cola offline no va a resolver sola.
        const sinSenal = typeof navigator !== 'undefined' && !navigator.onLine;
        setItems(prev => prev.map(p => p.path === path
          ? (sinSenal ? { ...p, uploading: false, queued: true } : { ...p, uploading: false, error: 'No se pudo subir' })
          : p));
      }
    }
    setVer(v => v + 1);
  }

  const puedeAgregar = single ? items.length === 0 : true;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={14} aria-hidden="true" style={{ color: '#1B2A6B' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1E' }}>{titulo}</span>
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>{hint}</div>

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          {items.map((it, idx) => (
            <div key={it.path} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #E2E8F0', aspectRatio: '1' }}>
              <img src={it.preview} alt={`${titulo} ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {it.uploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} className="animate-spin" />
                </div>
              )}
              {it.error && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(220,38,38,0.85)', padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <AlertTriangle size={9} color="#fff" aria-hidden="true" />
                  <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{it.error}</span>
                </div>
              )}
              {it.queued && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(217,119,6,0.90)', padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CloudOff size={9} color="#fff" aria-hidden="true" />
                  <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>En cola</span>
                </div>
              )}
              <button onClick={() => quitarFoto(setItems, idx)}
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {puedeAgregar && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 8px', background: '#fff', border: '2px dashed #CBD5E1', borderRadius: 12, cursor: 'pointer' }}>
            <Camera size={20} aria-hidden="true" style={{ color: '#64748B' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Cámara</span>
            <input key={`cam-${ver}`} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void procesarYSubir(files); }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 8px', background: '#fff', border: '2px dashed #CBD5E1', borderRadius: 12, cursor: 'pointer' }}>
            <ImageIcon size={20} aria-hidden="true" style={{ color: '#64748B' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Galería{single ? '' : ' (varias)'}</span>
            <input key={`gal-${ver}`} type="file" accept="image/*" multiple={!single} style={{ display: 'none' }}
              onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void procesarYSubir(files); }} />
          </label>
        </div>
      )}
    </div>
  );
}

export function EntregaParadaForm({ parada, tipo, onClose, onEntregado }: {
  parada: ParadaEntrega;
  tipo: 'seco' | 'congelado';
  onClose: () => void;
  /** `pendiente: true` → se guardó en la cola offline (Fase 4), todavía no está confirmada por
   *  el servidor. `page.tsx` la sincroniza sola apenas vuelve la señal. */
  onEntregado: (r: { id: number; hora_entrega: string; pendiente?: boolean }) => void;
}) {
  const uidBase = safeStorageKey(`${parada.store_cod}_${parada.id}_${Date.now()}`);

  // [Flujo único] Quién recibe — obligatorio antes de poder pedir el código.
  const [receptor, setReceptor] = useState('');
  const [rut, setRut] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const datosReceptorListos = receptor.trim().length > 0 && rut.trim().length >= 3;

  // [Flujo único] OTP — mismo mecanismo que el flujo viejo (`/api/recepcion-otp`), solo que acá
  // se pide ANTES de las fotos: si la tienda no puede confirmar, no vale la pena sacarlas todavía.
  const [otpEnviado,   setOtpEnviado]   = useState(false);
  const [otpEnviando,  setOtpEnviando]  = useState(false);
  const [otpEmailDestino, setOtpEmailDestino] = useState('');
  const [otpInput,     setOtpInput]     = useState('');
  const [otpVerificando, setOtpVerificando] = useState(false);
  const [otpError,     setOtpError]     = useState('');
  const [otpVerificado, setOtpVerificado] = useState(false);
  const [otpToken,      setOtpToken]      = useState('');
  const [otpEmailFinal, setOtpEmailFinal] = useState('');

  const [fotoA, setFotoA] = useState<FotoItem[]>([]); // temperatura (congelado) | sello (seco)
  const [fotoB, setFotoB] = useState<FotoItem[]>([]); // entrega en tienda (congelado) | pallets (seco)
  const [temperatura, setTemperatura] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function enviarCodigo() {
    if (!datosReceptorListos || otpEnviando) return;
    setOtpEnviando(true);
    setOtpError('');
    try {
      const res = await fetch('/api/recepcion-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_cod: parada.store_cod, store_name: parada.nombre ?? undefined }),
      });
      const json = await res.json() as { email_sent_to?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar el código');
      setOtpEnviado(true);
      setOtpEmailDestino(json.email_sent_to ?? '');
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Sin conexión. Reintenta.');
    } finally {
      setOtpEnviando(false);
    }
  }

  async function verificarCodigo() {
    if (otpInput.length !== 6 || otpVerificando) return;
    setOtpVerificando(true);
    setOtpError('');
    try {
      const res = await fetch('/api/recepcion-otp', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_cod: parada.store_cod, otp: otpInput }),
      });
      const json = await res.json() as { valid?: boolean; token?: string; email?: string; error?: string };
      if (!res.ok || !json.valid) throw new Error(json.error ?? 'Código incorrecto');
      setOtpVerificado(true);
      setOtpToken(json.token ?? '');
      setOtpEmailFinal(json.email ?? otpEmailDestino);
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Sin conexión. Reintenta.');
    } finally {
      setOtpVerificando(false);
    }
  }

  const grupoA = tipo === 'congelado'
    ? { titulo: 'Foto de la temperatura del camión', hint: 'Muestra el display del termómetro al llegar', icon: Thermometer, slug: 'temp' }
    : { titulo: 'Foto del sello',                    hint: 'Sello del camión/contenedor al llegar',       icon: Lock,        slug: 'sello' };
  const grupoB = tipo === 'congelado'
    ? { titulo: 'Foto(s) de la entrega en tienda',    hint: 'La mercadería ya entregada en el punto',       icon: Camera,      slug: 'entrega' }
    : { titulo: 'Foto(s) de los pallets',             hint: 'Los pallets entregados en el punto',           icon: Box,         slug: 'pallet' };

  // "Lista" ahora acepta `queued` además de `url` — una foto sin señal no bloquea la entrega,
  // solo cambia CÓMO se registra (cola offline en vez de PATCH directo, ver `registrar`).
  const listoA = fotoA.length > 0 && fotoA.every(f => f.url || f.queued);
  const listoB = fotoB.length > 0 && fotoB.every(f => f.url || f.queued);
  const puedeRegistrar = otpVerificado && listoA && listoB && !submitting;
  const hayFotosEnCola = [...fotoA, ...fotoB].some(f => f.queued);

  function temperaturaNumerica(): number | undefined {
    if (tipo !== 'congelado' || !temperatura.trim()) return undefined;
    const t = parseFloat(temperatura);
    return Number.isNaN(t) ? undefined : t;
  }

  /** [Fase 4] Guarda todo en la cola offline y avisa al padre como "entregado, pendiente de
   *  sincronizar" — el chofer ve la parada como lista de inmediato, nunca se queda esperando. */
  async function encolarYAvisar(horaEntregaLocal: string) {
    const item: EntregaPendiente = {
      id: crypto.randomUUID(),
      rutaTiendaId: parada.id,
      rutaId: parada.rutaId,
      storeCod: parada.store_cod,
      tipo,
      temperatura: temperaturaNumerica(),
      horaEntregaLocal,
      fotos: [...fotoA, ...fotoB].map(f => ({ path: f.path, blob: f.blob ?? null, url: f.url ?? null })),
      receptor: receptor.trim(),
      rut: rut.trim(),
      observaciones: observaciones.trim() || undefined,
      // El OTP ya se verificó EN VIVO recién — la cola solo reintenta el PATCH final con el mismo
      // token firmado, nunca repite la verificación (vence a los 10 min, ver offlineQueue.ts).
      otpToken, otpEmail: otpEmailFinal, otpCodigo: otpInput,
      intentos: 0,
      createdAt: Date.now(),
    };
    await encolarEntrega(item);
    onEntregado({ id: parada.id, hora_entrega: horaEntregaLocal, pendiente: true });
  }

  async function registrar() {
    if (!puedeRegistrar) return;
    setSubmitting(true);
    setSubmitError('');
    const horaEntregaLocal = new Date().toISOString(); // el momento REAL, se use ahora o al sincronizar

    // Si ya hay alguna foto en cola (sin señal), ni vale la pena intentar el PATCH — directo a
    // la cola offline, con las que sí lograron subirse y las que quedaron solo como blob.
    if (hayFotosEnCola) {
      await encolarYAvisar(horaEntregaLocal);
      setSubmitting(false);
      return;
    }

    try {
      const foto_urls = [...fotoA, ...fotoB].map(f => f.url).filter((u): u is string => !!u);
      const body: Record<string, unknown> = {
        ruta_tienda_id: parada.id, foto_urls, hora_entrega: horaEntregaLocal,
        receptor: receptor.trim(), rut: rut.trim(),
        otpToken, otpEmail: otpEmailFinal, otpCodigo: otpInput,
      };
      if (observaciones.trim()) body.observaciones = observaciones.trim();
      const t = temperaturaNumerica();
      if (t !== undefined) body.temperatura = t;
      const res = await fetch('/api/rutas-despacho', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('server');
      const json = await res.json() as { hora_entrega: string };
      onEntregado({ id: parada.id, hora_entrega: json.hora_entrega });
    } catch {
      // El PATCH mismo falló (ej. se perdió la señal justo después de subir las fotos) — todas
      // las fotos YA tienen url, así que la cola solo necesita reintentar el PATCH, no re-subir nada.
      await encolarYAvisar(horaEntregaLocal);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F8FAFF', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      {/* Header — mismo navy sólido que el resto del hub. */}
      <div style={{ background: '#1B2A6B', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={17} aria-hidden="true" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 2 }}>Registrar entrega</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {parada.store_cod}{parada.nombre ? ` · ${parada.nombre}` : ''}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px' }}>
        {(parada.direccion || parada.comuna) && (
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 18 }}>
            {[parada.direccion, parada.comuna].filter(Boolean).join(', ')}
          </div>
        )}

        {/* [Flujo único] Paso 1 — quién recibe. Se pide primero: sin esto no tiene sentido pedir
            el código todavía. */}
        <div style={{ marginBottom: 18, opacity: otpVerificado ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <ShieldCheck size={14} aria-hidden="true" style={{ color: '#1B2A6B' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1E' }}>Quién recibe</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="text" placeholder="Nombre completo" value={receptor}
              disabled={otpEnviado}
              onChange={e => setReceptor(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #E5E7EB', background: otpEnviado ? '#F8FAFF' : '#fff', color: '#1C1C1E', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
            <input type="text" placeholder="RUT — 12.345.678-9" value={rut}
              disabled={otpEnviado} inputMode="text" autoComplete="off"
              onChange={e => setRut(formatRut(e.target.value))}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #E5E7EB', background: otpEnviado ? '#F8FAFF' : '#fff', color: '#1C1C1E', fontSize: 15, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
            <textarea placeholder="Observaciones (opcional)" value={observaciones} rows={2}
              disabled={otpEnviado}
              onChange={e => setObservaciones(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #E5E7EB', background: otpEnviado ? '#F8FAFF' : '#fff', color: '#1C1C1E', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'none' }} />
          </div>
        </div>

        {/* [Flujo único] Paso 2 — el código llega al correo de la tienda. El chofer no lo tiene:
            necesita que alguien de la tienda se lo lea, esa es la prueba de que participó. */}
        {!otpVerificado && (
          <div style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: '#fff', border: '1.5px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Mail size={14} aria-hidden="true" style={{ color: '#1B2A6B' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1C1E' }}>Código de la tienda</span>
            </div>

            {!otpEnviado ? (
              <>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>
                  Se manda un código de 6 dígitos al correo registrado de {parada.store_cod}.
                </div>
                <button onClick={() => void enviarCodigo()} disabled={!datosReceptorListos || otpEnviando}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: datosReceptorListos ? '#1B2A6B' : '#CBD5E1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: datosReceptorListos ? 'pointer' : 'not-allowed' }}>
                  {otpEnviando ? 'Enviando…' : 'Enviar código'}
                </button>
                {!datosReceptorListos && (
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6, textAlign: 'center' }}>Completa nombre y RUT primero</div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
                  Código enviado{otpEmailDestino ? ` a ${otpEmailDestino}` : ''}. Pídeselo a quien te recibe.
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={otpInput}
                    onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #E5E7EB', background: '#fff', color: '#1C1C1E', fontSize: 18, letterSpacing: 4, textAlign: 'center', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                  <button onClick={() => void verificarCodigo()} disabled={otpInput.length !== 6 || otpVerificando}
                    style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: otpInput.length === 6 ? '#1B2A6B' : '#CBD5E1', color: '#fff', fontSize: 13, fontWeight: 700, cursor: otpInput.length === 6 ? 'pointer' : 'not-allowed' }}>
                    {otpVerificando ? '…' : 'Verificar'}
                  </button>
                </div>
                <button onClick={() => { setOtpEnviado(false); setOtpInput(''); setOtpError(''); }}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  Reenviar código
                </button>
              </>
            )}
            {otpError && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#B91C1C' }}>{otpError}</div>
            )}
          </div>
        )}

        {otpVerificado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', background: '#DCFCE7', borderRadius: 10, fontSize: 12, color: '#16A34A', fontWeight: 700, marginBottom: 18 }}>
            <Check size={14} aria-hidden="true" /> Confirmado por la tienda — {receptor.trim()}
          </div>
        )}

        {/* [Flujo único] Paso 3 — fotos, solo una vez confirmada la tienda. */}
        {otpVerificado && <>
        <FotoGrupo titulo={grupoA.titulo} hint={grupoA.hint} icon={grupoA.icon} items={fotoA} setItems={setFotoA} single uidBase={uidBase} slug={grupoA.slug} />

        {tipo === 'congelado' && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>
              Temperatura registrada (°C) <span style={{ fontWeight: 400, color: '#94A3B8' }}>· opcional</span>
            </label>
            <input type="number" step="0.1" inputMode="decimal" placeholder="Ej: 4.5"
              value={temperatura} onChange={e => setTemperatura(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #E5E7EB', background: '#fff', color: '#1C1C1E', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}

        <FotoGrupo titulo={grupoB.titulo} hint={grupoB.hint} icon={grupoB.icon} items={fotoB} setItems={setFotoB} single={false} uidBase={uidBase} slug={grupoB.slug} />
        </>}

        {submitError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12, color: '#B91C1C', marginBottom: 12 }}>
            <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{submitError}</span>
          </div>
        )}
      </div>

      {/* Footer fijo con el submit — solo aparece una vez confirmada la tienda; antes de eso el
          paso a seguir ya está claro en el cuerpo (enviar/verificar código). */}
      {otpVerificado && (
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', background: '#fff', flexShrink: 0 }}>
        {!puedeRegistrar && !submitting && (
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8, textAlign: 'center' }}>
            {!listoA ? `Falta: ${grupoA.titulo.toLowerCase()}` : !listoB ? `Falta: ${grupoB.titulo.toLowerCase()}` : ''}
          </div>
        )}
        {hayFotosEnCola && puedeRegistrar && !submitting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#92400E', marginBottom: 8, justifyContent: 'center' }}>
            <CloudOff size={12} aria-hidden="true" />
            <span>Sin señal — se guardará en el celular y se subirá sola cuando vuelva la conexión</span>
          </div>
        )}
        <button onClick={() => void registrar()} disabled={!puedeRegistrar}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
            background: puedeRegistrar ? '#1B2A6B' : '#CBD5E1',
            color: '#fff', fontSize: 15, fontWeight: 800, cursor: puedeRegistrar ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {submitting ? 'Registrando…' : <><Check size={16} aria-hidden="true" /> {hayFotosEnCola ? 'Guardar (sin señal)' : 'Registrar entrega'}</>}
        </button>
      </div>
      )}
    </div>
  );
}
