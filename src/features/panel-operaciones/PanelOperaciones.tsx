'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Fuente = 'conductor' | 'tienda' | 'pendientes';

interface Rec {
  id: number;
  cod: string;
  tienda: string;
  direccion?: string;
  pallets_sent: number;
  bultos_sent: number;
  contenedores_sent: number;
  pallets_recibidos: number;
  bultos_recibidos: number;
  contenedores_recibidos: number;
  conductor?: string;
  pionetas?: string;
  receptor: string;
  rut: string;
  firma_url?: string;
  observaciones?: string;
  sello_estado?: string;
  sello_foto_url?: string;
  sello_llegada_url?: string;
  sello_llegada_hora?: string;
  sello_salida_url?: string;
  sello_salida_hora?: string;
  cd_salida_url?: string;
  cd_salida_hora?: string;
  estado_fotos?: string[];
  codigo_verificacion?: string;
  fuente: string;
  created_at: string;
}

interface Stats {
  total: number;
  sin_novedad: number;
  con_diferencia: number;
  sello_intacto: number;
  sello_roto: number;
  sello_ausente: number;
  con_fotos: number;
}

interface PendingStore {
  cod: string;
  tienda: string;
  source: 'rm' | 'regiones';
  seguimiento: string;
  pallets: number;
  bultos: number;
  contenedores: number;
  conductor?: string | null;
  ventana?: string | null;
  ruta?: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDatetime(iso: string): string {
  // Hora real de Chile (los timestamptz se guardan en UTC).
  return new Date(iso).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function hasDiff(r: Rec): boolean {
  return (
    r.pallets_sent !== r.pallets_recibidos ||
    r.bultos_sent !== r.bultos_recibidos ||
    (r.contenedores_sent ?? 0) !== (r.contenedores_recibidos ?? 0)
  );
}

function selloColor(estado?: string): { bg: string; border: string; text: string } {
  if (estado === 'intacto') return { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', text: '#34D399' };
  if (estado === 'roto')    return { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',  text: '#F87171' };
  if (estado === 'ausente') return { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#FCD34D' };
  return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.4)' };
}

// ---- Photo lightbox ----
function PhotoLightbox({ urls, initial, onClose }: { urls: string[]; initial: number; onClose: () => void }) {
  const [idx, setIdx] = useState(initial);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>×</button>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{idx + 1} / {urls.length}</div>
      <img
        src={urls[idx]}
        alt="foto"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '72vh', borderRadius: 12, objectFit: 'contain', display: 'block' }}
      />
      {urls.length > 1 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setIdx(i => (i - 1 + urls.length) % urls.length)} style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>‹</button>
          <button onClick={() => setIdx(i => (i + 1) % urls.length)} style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>›</button>
        </div>
      )}
      {urls.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center', padding: '0 16px' }} onClick={e => e.stopPropagation()}>
          {urls.map((u, i) => (
            <img key={i} src={u} onClick={() => setIdx(i)} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', border: i === idx ? '2px solid #60A5FA' : '2px solid transparent', opacity: i === idx ? 1 : 0.5 }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Section wrapper ----
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
      <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
      <span style={{ color: '#fff', fontWeight: 500, maxWidth: '60%', textAlign: 'right' as const }}>{value}</span>
    </div>
  );
}

// ---- Detail modal ----
type PhotoEntry = { label: string; url: string; hora?: string };

function DetailModal({ rec, onClose }: { rec: Rec; onClose: () => void }) {
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number } | null>(null);

  const photos: PhotoEntry[] = [
    ...(rec.sello_llegada_url ? [{ label: 'Sello llegada', url: rec.sello_llegada_url, hora: rec.sello_llegada_hora }] : []),
    ...(rec.sello_salida_url  ? [{ label: 'Sello salida',  url: rec.sello_salida_url,  hora: rec.sello_salida_hora  }] : []),
    ...(rec.cd_salida_url     ? [{ label: 'CD salida',     url: rec.cd_salida_url,     hora: rec.cd_salida_hora     }] : []),
    ...(rec.sello_foto_url    ? [{ label: 'Foto sello',    url: rec.sello_foto_url                                  }] : []),
    ...(rec.estado_fotos ?? []).map((url, i) => ({ label: `Estado ${i + 1}`, url })),
  ];

  const sc   = selloColor(rec.sello_estado);
  const diff = hasDiff(rec);

  const personRows: { label: string; value: string }[] = [
    ...(rec.fuente === 'conductor' && rec.conductor ? [{ label: 'Conductor', value: rec.conductor }] : []),
    ...(rec.fuente === 'conductor' && rec.pionetas  ? [{ label: 'Pionetas',  value: rec.pionetas  }] : []),
    { label: 'Receptor', value: rec.receptor },
    ...(rec.rut ? [{ label: 'RUT', value: rec.rut }] : []),
  ];

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={onClose}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 560, maxHeight: '90dvh', overflowY: 'auto', background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 100%)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', padding: 22, color: '#fff' }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: 4 }}>
                {rec.fuente === 'conductor' ? '🚚 Entrega Conductor' : '🏪 Recepción Tienda'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{rec.tienda}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{rec.cod} · {fmtDatetime(rec.created_at)}</div>
            </div>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>×</button>
          </div>

          {diff && (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#FCA5A5' }}>
              ⚠️ Diferencias detectadas en cantidades enviadas vs recibidas
            </div>
          )}

          {/* Quantities */}
          <Section title="Cantidades">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { label: 'Pallets',      sent: rec.pallets_sent,          recv: rec.pallets_recibidos      },
                { label: 'Bultos',       sent: rec.bultos_sent,           recv: rec.bultos_recibidos       },
                { label: 'Contenedores', sent: rec.contenedores_sent ?? 0, recv: rec.contenedores_recibidos ?? 0 },
              ].map(({ label, sent, recv }) => (
                <div key={label} style={{ textAlign: 'center' as const, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 6px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: sent === recv ? '#34D399' : '#F87171', lineHeight: 1 }}>{recv}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>de {sent} env.</div>
                </div>
              ))}
            </div>
          </Section>

          {/* Sello */}
          <Section title="Sello y seguridad">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ flex: 1, minWidth: 120, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Estado sello</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: sc.text, textTransform: 'capitalize' as const }}>{rec.sello_estado || '—'}</div>
              </div>
              {rec.codigo_verificacion && (
                <div style={{ flex: 1, minWidth: 120, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Código verificación</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{rec.codigo_verificacion}</div>
                </div>
              )}
            </div>
          </Section>

          {/* People */}
          <Section title="Personas">
            {personRows.map(item => <Row key={item.label} label={item.label} value={item.value} />)}
          </Section>

          {rec.observaciones && (
            <Section title="Observaciones">
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: 0 }}>{rec.observaciones}</p>
            </Section>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <Section title={`Evidencia fotográfica (${photos.length})`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                {photos.map((p, i) => (
                  <div
                    key={i}
                    style={{ cursor: 'pointer', position: 'relative' as const, borderRadius: 10, overflow: 'hidden' }}
                    onClick={() => setLightbox({ urls: photos.map(x => x.url), idx: i })}
                  >
                    <img
                      src={p.url}
                      alt={p.label}
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' as const, display: 'block' }}
                    />
                    <div style={{ position: 'absolute' as const, bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.58)', padding: '3px 5px', fontSize: 9, color: 'rgba(255,255,255,0.82)', textAlign: 'center' as const }}>
                      {p.label}
                      {p.hora && <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{p.hora}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Signature */}
          {rec.firma_url && (
            <Section title="Firma del receptor">
              <img src={rec.firma_url} alt="Firma" style={{ maxWidth: '100%', maxHeight: 130, background: '#fff', borderRadius: 10, padding: 6, display: 'block' }} />
            </Section>
          )}
        </div>
      </div>

      {lightbox && <PhotoLightbox urls={lightbox.urls} initial={lightbox.idx} onClose={() => setLightbox(null)} />}
    </>
  );
}

// ---- Record card ----
function RecordCard({ rec, onClick }: { rec: Rec; onClick: () => void }) {
  const diff = hasDiff(rec);
  const sc   = selloColor(rec.sello_estado);
  const photoCount = [
    rec.sello_llegada_url,
    rec.sello_salida_url,
    rec.cd_salida_url,
    rec.sello_foto_url,
    ...(rec.estado_fotos ?? []),
  ].filter(Boolean).length;

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left' as const,
        background: diff ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${diff ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14, padding: '13px 15px', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{rec.tienda}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{rec.cod}</div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0, marginLeft: 8, marginTop: 2 }}>{fmtDatetime(rec.created_at)}</div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: 7 }}>
        <span style={{ fontSize: 12, color: diff ? '#FCA5A5' : '#86EFAC' }}>
          P {rec.pallets_recibidos}/{rec.pallets_sent} · B {rec.bultos_recibidos}/{rec.bultos_sent}
          {(rec.contenedores_sent ?? 0) > 0 ? ` · C ${rec.contenedores_recibidos}/${rec.contenedores_sent}` : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
          {rec.sello_estado && (
            <span style={{ fontSize: 10, fontWeight: 700, background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, borderRadius: 6, padding: '2px 6px', textTransform: 'capitalize' as const }}>{rec.sello_estado}</span>
          )}
          {diff && (
            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171', borderRadius: 6, padding: '2px 6px' }}>⚠ Dif.</span>
          )}
          {photoCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#C4B5FD', borderRadius: 6, padding: '2px 6px' }}>📷 {photoCount}</span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
        {rec.fuente === 'conductor' && rec.conductor ? `Conductor: ${rec.conductor}` : `Receptor: ${rec.receptor}`}
      </div>
    </button>
  );
}

// ---- KPI card ----
function KpiCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ---- Main component ----
export default function PanelOperaciones() {
  const router = useRouter();
  const today  = todayISO();

  const [tab,          setTab]          = useState<Fuente>('conductor');
  const [desde,        setDesde]        = useState(today);
  const [hasta,        setHasta]        = useState(today);
  const [codFilt,      setCodFilt]      = useState('');
  const [records,      setRecords]      = useState<Rec[]>([]);
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [selected,     setSelected]     = useState<Rec | null>(null);
  const [pendientes,   setPendientes]   = useState<PendingStore[]>([]);
  const [pendTotal,    setPendTotal]    = useState(0);
  const [loadingPend,  setLoadingPend]  = useState(false);

  const fetchData = useCallback(async (fuente: Fuente, d: string, h: string, c: string) => {
    if (fuente === 'pendientes') return;
    setLoading(true);
    try {
      const p = new URLSearchParams({ fuente, desde: d, hasta: h, limit: '300' });
      if (c.trim()) p.set('cod', c.trim().toUpperCase());
      const res  = await fetch(`/api/panel-operaciones?${p}`);
      const json = await res.json() as { records?: Rec[]; stats?: Stats; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setRecords(json.records ?? []);
      setStats(json.stats ?? null);
    } catch (err) {
      console.error('[panel-operaciones]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendientes = useCallback(async (fecha: string) => {
    setLoadingPend(true);
    try {
      const res  = await fetch(`/api/panel-operaciones/pendientes?fecha=${fecha}`);
      const json = await res.json() as { stores?: PendingStore[]; total?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setPendientes(json.stores ?? []);
      setPendTotal(json.total ?? 0);
    } catch (err) {
      console.error('[panel-operaciones/pendientes]', err);
    } finally {
      setLoadingPend(false);
    }
  }, []);

  // Auto-fetch when tab changes
  useEffect(() => {
    if (tab === 'pendientes') {
      fetchPendientes(desde);
    } else {
      fetchData(tab, desde, hasta, codFilt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function handleApply() {
    if (tab === 'pendientes') fetchPendientes(desde);
    else fetchData(tab, desde, hasta, codFilt);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(160deg,#0f172a 0%,#1a2550 100%)', color: '#fff' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <button
            onClick={() => router.push('/control-interno')}
            style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ‹
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.22em', textTransform: 'uppercase' as const }}>Panel</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Operaciones</div>
          </div>
          <button
            onClick={handleApply}
            disabled={loading}
            style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.5 : 1 }}
          >
            ↻
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 18, background: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 4 }}>
          {([
            { f: 'conductor',  label: '🚚 Conductor'    },
            { f: 'tienda',     label: '🏪 Tienda'       },
            { f: 'pendientes', label: '⚠ Sin recepción' },
          ] as { f: Fuente; label: string }[]).map(({ f, label }) => (
            <button
              key={f}
              onClick={() => setTab(f)}
              style={{
                flex: 1, padding: '10px 4px', borderRadius: 10,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' as const, cursor: 'pointer',
                transition: 'all 0.15s',
                // Acento azul uniforme para la tab activa (sobrio/empresarial)
                background: tab === f ? 'rgba(37,99,235,0.22)' : 'transparent',
                border: `1.5px solid ${tab === f ? 'rgba(37,99,235,0.5)' : 'transparent'}`,
                color: tab === f ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Desde</label>
              <input
                type="date"
                value={desde}
                onChange={e => setDesde(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', color: '#fff', fontSize: 13, boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', color: '#fff', fontSize: 13, boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 80 }}>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 5 }}>Código</label>
              <input
                type="text"
                value={codFilt}
                onChange={e => setCodFilt(e.target.value)}
                placeholder="1023..."
                style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', color: '#fff', fontSize: 13, boxSizing: 'border-box' as const }}
              />
            </div>
          </div>
          <button
            onClick={handleApply}
            disabled={loading}
            style={{ width: '100%', padding: '9px', borderRadius: 10, background: 'rgba(96,165,250,0.16)', border: '1px solid rgba(96,165,250,0.38)', color: '#93C5FD', fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' as const, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Cargando...' : 'Aplicar filtros'}
          </button>
        </div>

        {/* KPI grid */}
        {stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              <KpiCard value={stats.total}          label="Total"       color="#60A5FA" />
              <KpiCard value={stats.sin_novedad}    label="Sin nov."    color="#34D399" />
              <KpiCard value={stats.con_diferencia} label="Con dif."    color="#F87171" />
              <KpiCard value={stats.con_fotos}      label="Con fotos"   color="#A78BFA" />
            </div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
              {[
                { count: stats.sello_intacto, label: 'Sello intacto', color: '#34D399' },
                { count: stats.sello_roto,    label: 'Sello roto',    color: '#F87171' },
                { count: stats.sello_ausente, label: 'Sello ausente', color: '#FCD34D' },
              ].map(({ count, label, color }) => (
                <div key={label} style={{ flex: 1, textAlign: 'center' as const, background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}33`, borderRadius: 10, padding: '8px 4px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Records — conductor / tienda tabs */}
        {tab !== 'pendientes' && (
          loading ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 0', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
              Cargando registros...
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '40px 0', color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>
              Sin registros para este período
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                {records.length} registro{records.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {records.map(rec => (
                  <RecordCard key={rec.id} rec={rec} onClick={() => setSelected(rec)} />
                ))}
              </div>
            </>
          )
        )}

        {/* Pendientes tab */}
        {tab === 'pendientes' && (
          <>
            {/* KPI */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, textAlign: 'center' as const, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '14px 6px' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#F87171', lineHeight: 1 }}>{pendTotal}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Sin recepción</div>
              </div>
            </div>

            {loadingPend ? (
              <div style={{ textAlign: 'center' as const, padding: '40px 0', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
                Cargando...
              </div>
            ) : pendientes.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '40px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Todas las tiendas tienen recepción</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendientes.map(ps => {
                  const seguimientoColor = ps.seguimiento === 'En camino' ? '#FCD34D'
                    : ps.seguimiento === 'Entregado' ? '#60A5FA'
                    : ps.seguimiento === 'Pendiente' ? '#FCA5A5'
                    : 'rgba(255,255,255,0.35)';
                  return (
                    <div key={ps.cod} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 900, fontSize: 16 }}>{ps.cod}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              background: ps.source === 'rm' ? 'rgba(37,99,235,0.18)' : 'rgba(211,47,47,0.18)',
                              color: ps.source === 'rm' ? '#93C5FD' : '#FCA5A5',
                              letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                              {ps.source === 'rm' ? 'Santiago' : 'Regiones'}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{ps.tienda}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                          background: `${seguimientoColor}22`, border: `1px solid ${seguimientoColor}55`,
                          color: seguimientoColor, whiteSpace: 'nowrap' as const }}>
                          {ps.seguimiento}
                        </span>
                      </div>

                      {/* Counts */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: ps.conductor || ps.ventana ? 6 : 0 }}>
                        {ps.pallets > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(37,99,235,0.15)', color: '#93C5FD' }}>
                            {ps.pallets}P
                          </span>
                        )}
                        {ps.bultos > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(217,119,6,0.15)', color: '#FCD34D' }}>
                            {ps.bultos}B
                          </span>
                        )}
                        {ps.contenedores > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(107,33,168,0.15)', color: '#C4B5FD' }}>
                            {ps.contenedores}C
                          </span>
                        )}
                      </div>

                      {/* Extra info */}
                      {(ps.conductor || ps.ventana || ps.ruta) && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
                          {ps.conductor && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>🚚 {ps.conductor}</span>}
                          {ps.ventana   && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>🕐 {ps.ventana}</span>}
                          {ps.ruta      && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>📍 {ps.ruta}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {selected && <DetailModal rec={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
