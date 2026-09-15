'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { X, Camera, Image as ImageIcon, Check, Thermometer, Lock, Box, AlertTriangle, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { safeStorageKey } from '@/lib/storageKey';
import { processPhoto } from '@/features/auditoria/utils/photos';

/**
 * [Panel Conductor · Fase 3] Registrar la entrega de UNA parada, con las fotos que decide el
 * `tipo` de la ruta (Fase 0):
 *   - congelado → foto de la temperatura del camión (1) + foto(s) de la entrega en tienda (N)
 *   - seco      → foto del sello (1) + foto(s) de los pallets (N)
 *
 * Mismo patrón de cámara/galería que `AuditoriaScreen.tsx` (inputs separados, `key` que cambia
 * para forzar el remount — sin esto iOS no vuelve a disparar `onChange` si se elige el MISMO
 * archivo dos veces) y de subida directa a Storage que `RecepcionForm.tsx` (upload → getPublicUrl,
 * ruta saneada con `safeStorageKey` porque el código de tienda puede traer ñ/tildes).
 *
 * Bucket propio `entrega-fotos` (no `recepcion-fotos`): es prueba de entrega de una ruta
 * genérica, no el flujo de recepción-con-OTP de una tienda puntual — mezclar convenciones de
 * nombre en el mismo bucket es fuente de bugs (ver la migración de la Fase 0).
 */

export interface ParadaEntrega {
  id: number;
  store_cod: string;
  nombre?: string | null;
  direccion?: string | null;
  comuna?: string | null;
}

interface FotoItem {
  preview: string;
  path: string;
  url?: string;
  uploading: boolean;
  error?: string;
}

const BUCKET = 'entrega-fotos';

async function subirFoto(file: File, path: string): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function quitarFoto(setItems: Dispatch<SetStateAction<FotoItem[]>>, idx: number) {
  setItems(prev => {
    const it = prev[idx];
    if (it) {
      URL.revokeObjectURL(it.preview);
      // Fire-and-forget: si falla el remove, queda un archivo huérfano en el bucket — no bloquea
      // al chofer por algo que no afecta la entrega.
      void supabase.storage.from(BUCKET).remove([it.path]).then(() => {}, () => {});
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
      setItems(prev => [...prev, { preview: previewUrl, path, uploading: true }]);
      try {
        const url = await subirFoto(compressed, path);
        setItems(prev => prev.map(p => p.path === path ? { ...p, uploading: false, url } : p));
      } catch {
        setItems(prev => prev.map(p => p.path === path ? { ...p, uploading: false, error: 'No se pudo subir' } : p));
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
  onEntregado: (r: { id: number; hora_entrega: string }) => void;
}) {
  const uidBase = safeStorageKey(`${parada.store_cod}_${parada.id}_${Date.now()}`);

  const [fotoA, setFotoA] = useState<FotoItem[]>([]); // temperatura (congelado) | sello (seco)
  const [fotoB, setFotoB] = useState<FotoItem[]>([]); // entrega en tienda (congelado) | pallets (seco)
  const [temperatura, setTemperatura] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const grupoA = tipo === 'congelado'
    ? { titulo: 'Foto de la temperatura del camión', hint: 'Muestra el display del termómetro al llegar', icon: Thermometer, slug: 'temp' }
    : { titulo: 'Foto del sello',                    hint: 'Sello del camión/contenedor al llegar',       icon: Lock,        slug: 'sello' };
  const grupoB = tipo === 'congelado'
    ? { titulo: 'Foto(s) de la entrega en tienda',    hint: 'La mercadería ya entregada en el punto',       icon: Camera,      slug: 'entrega' }
    : { titulo: 'Foto(s) de los pallets',             hint: 'Los pallets entregados en el punto',           icon: Box,         slug: 'pallet' };

  const listoA = fotoA.length > 0 && fotoA.every(f => f.url);
  const listoB = fotoB.length > 0 && fotoB.every(f => f.url);
  const puedeRegistrar = listoA && listoB && !submitting;

  async function registrar() {
    if (!puedeRegistrar) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const foto_urls = [...fotoA, ...fotoB].map(f => f.url).filter((u): u is string => !!u);
      const body: Record<string, unknown> = { ruta_tienda_id: parada.id, foto_urls };
      if (tipo === 'congelado' && temperatura.trim()) {
        const t = parseFloat(temperatura);
        if (!Number.isNaN(t)) body.temperatura = t;
      }
      const res = await fetch('/api/rutas-despacho', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('server');
      const json = await res.json() as { hora_entrega: string };
      onEntregado({ id: parada.id, hora_entrega: json.hora_entrega });
    } catch {
      setSubmitError('No se pudo registrar la entrega. Revisa tu conexión e intenta de nuevo.');
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

        {submitError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12, color: '#B91C1C', marginBottom: 12 }}>
            <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{submitError}</span>
          </div>
        )}
      </div>

      {/* Footer fijo con el submit — siempre visible aunque haya muchas fotos y haya que scrollear. */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0', background: '#fff', flexShrink: 0 }}>
        {!puedeRegistrar && !submitting && (
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8, textAlign: 'center' }}>
            {!listoA ? `Falta: ${grupoA.titulo.toLowerCase()}` : !listoB ? `Falta: ${grupoB.titulo.toLowerCase()}` : ''}
          </div>
        )}
        <button onClick={() => void registrar()} disabled={!puedeRegistrar}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
            background: puedeRegistrar ? '#1B2A6B' : '#CBD5E1',
            color: '#fff', fontSize: 15, fontWeight: 800, cursor: puedeRegistrar ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {submitting ? 'Registrando…' : <><Check size={16} aria-hidden="true" /> Registrar entrega</>}
        </button>
      </div>
    </div>
  );
}
