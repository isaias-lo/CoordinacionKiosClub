'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Store, CalendarDays } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ProfilePill } from '@/components/ProfilePill';
import CalendarioColumnas from '@/features/control-interno/CalendarioColumnas';

interface Tienda {
  codigo: string;
  nombre: string;
  direccion: string;
  region: string;
  sector_comuna: string;
  corredor: string;
  tipo: string;
  ventana: string;
  frecuencia: string;
  prom_por_dia: string;
  lat: number | null;
  lon: number | null;
  correos: string;
  tel_encargado: string;
  supervisor: string;
  tel_supervisor: string;
  transportista: string;
  activo: boolean;
}

const EMPTY: Tienda = {
  codigo: '', nombre: '', direccion: '', region: '', sector_comuna: '',
  corredor: '', tipo: '', ventana: '', frecuencia: '', prom_por_dia: '',
  lat: null, lon: null, correos: '', tel_encargado: '', supervisor: '',
  tel_supervisor: '', transportista: '', activo: true,
};

const S = {
  page: { position: 'fixed', inset: 0, overflowY: 'auto', background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)', padding: '20px 16px 40px' } as React.CSSProperties,
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' } as React.CSSProperties,
  backBtn: { width: 36, height: 36, flexShrink: 0, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
  title: { color: '#fff', fontSize: 20, fontWeight: 700, flex: 1 } as React.CSSProperties,
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' as const },
  modal: { background: '#1A2550', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '24px 20px', width: '100%', maxWidth: 520 } as React.CSSProperties,
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' } as React.CSSProperties,
  input: { width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
  syncBtn: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, color: '#FCD34D', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  addBtn: { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 10, color: '#34D399', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
};

const TABS = [
  { id: 'tiendas'    as const, label: 'GESTIONAR TIENDAS', Icon: Store,       color: '#6366F1', dark: '#4338CA', shadow: 'rgba(99,102,241,0.45)'  },
  { id: 'calendario' as const, label: 'CALENDARIO',        Icon: CalendarDays, color: '#D42B2B', dark: '#991B1B', shadow: 'rgba(212,43,43,0.45)'  },
];

export default function TiendasAdminPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [tiendas,    setTiendas]    = useState<Tienda[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [msg,        setMsg]        = useState('');
  const [search,     setSearch]     = useState('');
  const [modal,      setModal]      = useState<'add' | 'edit' | null>(null);
  const [form,       setForm]       = useState<Tienda>(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [skipped,    setSkipped]    = useState<{ row: number; raw: string; reason: string }[]>([]);
  const [activeTab,  setActiveTab]  = useState<'tiendas' | 'calendario'>('tiendas');

  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tiendas');
      const d = await res.json() as { tiendas?: Tienda[] };
      setTiendas(d.tiendas ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true); setMsg(''); setSkipped([]);
    try {
      const res  = await fetch('/api/tiendas/sync', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; synced?: number; error?: string; skipped?: { row: number; raw: string; reason: string }[] };
      if (data.ok) {
        setMsg(`✓ Sincronizado: ${data.synced} tiendas${data.skipped?.length ? ` · ${data.skipped.length} saltadas` : ''}`);
        setSkipped(data.skipped ?? []);
        await load();
      } else { setMsg(`Error: ${data.error}`); }
    } catch { setMsg('Error de conexión'); }
    finally { setSyncing(false); }
  }

  function openAdd() { setForm(EMPTY); setModal('add'); }
  function openEdit(t: Tienda) { setForm({ ...t }); setModal('edit'); }

  async function handleSave() {
    if (!form.codigo || !form.nombre) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json() as { tienda?: Tienda; error?: string };
      if (data.tienda) {
        setModal(null); await load();
        setMsg(modal === 'add' ? '✓ Tienda agregada' : '✓ Tienda actualizada');
      } else { setMsg(`Error: ${data.error}`); }
    } finally { setSaving(false); }
  }

  async function handleToggleActivo(t: Tienda) {
    await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, activo: !t.activo }) });
    await load();
  }

  function f(k: keyof Tienda) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm(prev => ({ ...prev, [k]: v }));
    };
  }

  const filtered = tiendas.filter(t =>
    t.codigo.toLowerCase().includes(search.toLowerCase()) ||
    t.nombre.toLowerCase().includes(search.toLowerCase()) ||
    t.region.toLowerCase().includes(search.toLowerCase())
  );

  const activas   = filtered.filter(t =>  t.activo).length;
  const inactivas = filtered.filter(t => !t.activo).length;

  if (!isAdmin) {
    return (
      <div style={S.page}>
        <p style={{ color: '#F87171', textAlign: 'center', paddingTop: 80 }}>Acceso restringido</p>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`
        .tiendas-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        @media (min-width: 700px) {
          .tiendas-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1080px) {
          .tiendas-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => router.push('/control-interno')}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div style={S.title}>
          {activeTab === 'tiendas' ? 'Gestión de Tiendas' : 'Calendario Central'}
        </div>
        <ProfilePill compact />
        {activeTab === 'tiendas' && <>
          <button style={S.syncBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando…' : '↻ Sincronizar Sheet'}
          </button>
          <button style={S.addBtn} onClick={openAdd}>+ Nueva</button>
        </>}
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 6 }}>
        {TABS.map(({ id, label, Icon, color, dark, shadow }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              style={{
                flex: 1, height: 72, borderRadius: 13, cursor: 'pointer',
                border: 'none', transition: 'all 0.18s ease',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 7,
                background: active ? `linear-gradient(175deg, ${color} 0%, ${dark} 100%)` : 'transparent',
                boxShadow: active ? `0 4px 20px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.15)` : 'none',
              }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active
                  ? 'rgba(255,255,255,0.22)'
                  : `linear-gradient(145deg, ${color}, ${dark})`,
                boxShadow: active
                  ? 'inset 0 1px 0 rgba(255,255,255,0.3)'
                  : `0 4px 12px ${shadow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}>
                <Icon size={20} color="#fff" strokeWidth={1.7} />
              </div>
              <span style={{
                fontSize: 12, fontWeight: 800,
                letterSpacing: '0.07em',
                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
              }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab: Calendario ── */}
      {activeTab === 'calendario' && <CalendarioColumnas />}

      {/* ── Tab: Gestionar Tiendas ── */}
      {activeTab === 'tiendas' && <>

      {msg && (
        <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, color: '#34D399', padding: '10px 14px', marginBottom: skipped.length ? 8 : 14, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {skipped.length > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ color: '#F87171', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            ⚠️ {skipped.length} fila{skipped.length > 1 ? 's' : ''} no importada{skipped.length > 1 ? 's' : ''} — código no reconocido:
          </div>
          {skipped.map((s, i) => (
            <div key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>
              Fila {s.row}: <span style={{ color: '#FCA5A5', fontFamily: 'monospace' }}>{s.raw}</span> — {s.reason}
            </div>
          ))}
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 8 }}>
            Puedes agregarlas manualmente con el botón + Nueva si el código tiene un formato distinto.
          </div>
        </div>
      )}

      {/* Stats + Search */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por código, nombre o región…"
          style={{ ...S.input, flex: 1, minWidth: 200 }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#34D399', fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{activas}</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>activas</span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, margin: '0 2px' }}>·</span>
          <span style={{ color: '#F87171', fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{inactivas}</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>inactivas</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>
          {tiendas.length === 0 ? 'No hay tiendas. Usa "Sincronizar Sheet" para importar.' : 'Sin resultados'}
        </div>
      ) : (
        <div className="tiendas-grid">
          {filtered.map(t => (
            <div key={t.codigo} style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 16,
              padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 0,
            }}>
              {/* Code + status row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 18, fontWeight: 900,
                  background: 'rgba(37,99,235,0.3)', color: '#93C5FD',
                  borderRadius: 8, padding: '4px 12px',
                  letterSpacing: '0.03em',
                }}>
                  {t.codigo}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 800,
                  borderRadius: 20, padding: '4px 12px',
                  background: t.activo ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                  color: t.activo ? '#34D399' : '#F87171',
                  border: `1px solid ${t.activo ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                  letterSpacing: '0.05em',
                }}>
                  {t.activo ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>

              {/* Name */}
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>
                {t.nombre}
              </div>

              {/* Tags row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {t.region && (
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 9px' }}>
                    {t.region}
                  </span>
                )}
                {t.corredor && (
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 9px' }}>
                    {t.corredor}
                  </span>
                )}
                {t.ventana && (
                  <span style={{ fontSize: 13, color: '#FCD34D', background: 'rgba(252,211,77,0.12)', borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>
                    {t.ventana}
                  </span>
                )}
                {t.supervisor && (
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 9px' }}>
                    Sup: {t.supervisor}
                  </span>
                )}
              </div>

              {/* Address */}
              {t.direccion && (
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 10 }}>
                  {t.direccion}
                </div>
              )}

              {/* Contact */}
              {(t.correos || t.tel_encargado) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  {t.correos && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>✉ {t.correos}</span>}
                  {t.tel_encargado && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>📞 {t.tel_encargado}</span>}
                </div>
              )}

              {/* Spacer pushes buttons to bottom */}
              <div style={{ flex: 1 }} />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: t.correos || t.tel_encargado ? 0 : 14 }}>
                <button
                  onClick={() => handleToggleActivo(t)}
                  style={{
                    flex: 1, height: 40, borderRadius: 10, border: 'none',
                    fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    letterSpacing: '0.04em',
                    background: t.activo
                      ? 'linear-gradient(175deg, #EF4444, #B91C1C)'
                      : 'linear-gradient(175deg, #10B981, #059669)',
                    color: '#fff',
                    boxShadow: t.activo
                      ? '0 3px 10px rgba(239,68,68,0.35)'
                      : '0 3px 10px rgba(16,185,129,0.35)',
                  }}>
                  {t.activo ? 'DESACTIVAR' : 'ACTIVAR'}
                </button>
                <button
                  onClick={() => openEdit(t)}
                  style={{
                    flex: 1, height: 40, borderRadius: 10, border: 'none',
                    fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    letterSpacing: '0.04em',
                    background: 'linear-gradient(175deg, #3B82F6, #1D4ED8)',
                    color: '#fff',
                    boxShadow: '0 3px 10px rgba(59,130,246,0.35)',
                  }}>
                  EDITAR
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={S.modal}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              {modal === 'add' ? 'Nueva Tienda' : `Editar: ${form.codigo}`}
            </div>

            <div style={S.grid2}>
              <div>
                <label style={S.label}>Código *</label>
                <input style={S.input} value={form.codigo} onChange={f('codigo')} placeholder="ej: 02SCL" disabled={modal === 'edit'} />
              </div>
              <div>
                <label style={S.label}>Nombre *</label>
                <input style={S.input} value={form.nombre} onChange={f('nombre')} placeholder="San Carlos" />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={S.label}>Dirección</label>
              <input style={S.input} value={form.direccion} onChange={f('direccion')} placeholder="Av. Plaza 1250, Las Condes" />
            </div>

            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div>
                <label style={S.label}>Región</label>
                <input style={S.input} value={form.region} onChange={f('region')} placeholder="Región Metropolitana" />
              </div>
              <div>
                <label style={S.label}>Sector/Comuna</label>
                <input style={S.input} value={form.sector_comuna} onChange={f('sector_comuna')} placeholder="Las Condes" />
              </div>
            </div>

            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div>
                <label style={S.label}>Corredor</label>
                <input style={S.input} value={form.corredor} onChange={f('corredor')} placeholder="Corredor Oriente" />
              </div>
              <div>
                <label style={S.label}>Tipo</label>
                <input style={S.input} value={form.tipo} onChange={f('tipo')} placeholder="Premium" />
              </div>
            </div>

            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div>
                <label style={S.label}>Ventana horaria</label>
                <input style={S.input} value={form.ventana} onChange={f('ventana')} placeholder="09:00-12:00" />
              </div>
              <div>
                <label style={S.label}>Frecuencia</label>
                <input style={S.input} value={form.frecuencia} onChange={f('frecuencia')} placeholder="Diario" />
              </div>
            </div>

            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div>
                <label style={S.label}>Latitud</label>
                <input style={S.input} type="number" step="any" value={form.lat ?? ''} onChange={e => setForm(p => ({ ...p, lat: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="-33.391885" />
              </div>
              <div>
                <label style={S.label}>Longitud</label>
                <input style={S.input} type="number" step="any" value={form.lon ?? ''} onChange={e => setForm(p => ({ ...p, lon: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="-70.506455" />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={S.label}>Correos (separados por coma)</label>
              <input style={S.input} value={form.correos} onChange={f('correos')} placeholder="encargado@tienda.cl" />
            </div>

            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div>
                <label style={S.label}>Tel. Encargado</label>
                <input style={S.input} value={form.tel_encargado} onChange={f('tel_encargado')} placeholder="+56 9 1234 5678" />
              </div>
              <div>
                <label style={S.label}>Supervisor</label>
                <input style={S.input} value={form.supervisor} onChange={f('supervisor')} placeholder="Nombre supervisor" />
              </div>
            </div>

            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div>
                <label style={S.label}>Tel. Supervisor</label>
                <input style={S.input} value={form.tel_supervisor} onChange={f('tel_supervisor')} placeholder="+56 9 8765 4321" />
              </div>
              <div>
                <label style={S.label}>Transportista</label>
                <input style={S.input} value={form.transportista} onChange={f('transportista')} placeholder="Chilexpress" />
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="activo-check" checked={form.activo} onChange={f('activo')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="activo-check" style={{ ...S.label, margin: 0, cursor: 'pointer' }}>Tienda activa</label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(null)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', padding: '11px 0', fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.codigo || !form.nombre}
                style={{ flex: 2, background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 10, color: '#34D399', padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!form.codigo || !form.nombre) ? 0.5 : 1 }}>
                {saving ? 'Guardando…' : modal === 'add' ? 'Crear tienda' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
      </> /* fin activeTab === 'tiendas' */}
    </div>
  );
}
