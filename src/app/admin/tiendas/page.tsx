'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

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
  page: { minHeight: '100vh', background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)', padding: '20px 16px 40px' } as React.CSSProperties,
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 } as React.CSSProperties,
  backBtn: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', padding: '8px 14px', fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
  title: { color: '#fff', fontSize: 20, fontWeight: 700, flex: 1 } as React.CSSProperties,
  card: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  codBadge: { fontFamily: 'monospace', fontSize: 13, fontWeight: 700, background: 'rgba(37,99,235,0.25)', color: '#93C5FD', borderRadius: 6, padding: '2px 8px' },
  name: { color: '#fff', fontSize: 15, fontWeight: 600, flex: 1, minWidth: 120 },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  activeBadge: (a: boolean) => ({
    fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px',
    background: a ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
    color: a ? '#34D399' : '#F87171', border: `1px solid ${a ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
  }),
  btn: (color: string) => ({
    background: `rgba(${color},0.15)`, border: `1px solid rgba(${color},0.4)`, borderRadius: 8,
    color: `rgb(${color})`, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
  }),
  syncBtn: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, color: '#FCD34D', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  addBtn: { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 10, color: '#34D399', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' as const },
  modal: { background: '#1A2550', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '24px 20px', width: '100%', maxWidth: 520 } as React.CSSProperties,
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' } as React.CSSProperties,
  input: { width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
};

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
    setSyncing(true);
    setMsg('');
    try {
      const res  = await fetch('/api/tiendas/sync', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; synced?: number; error?: string };
      if (data.ok) {
        setMsg(`✓ Sincronizado: ${data.synced} tiendas`);
        await load();
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } catch {
      setMsg('Error de conexión');
    } finally {
      setSyncing(false);
    }
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
        setModal(null);
        await load();
        setMsg(modal === 'add' ? '✓ Tienda agregada' : '✓ Tienda actualizada');
      } else {
        setMsg(`Error: ${data.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActivo(t: Tienda) {
    await fetch('/api/tiendas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...t, activo: !t.activo }),
    });
    await load();
  }

  function f(k: keyof Tienda) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : e.target.value;
      setForm(prev => ({ ...prev, [k]: v }));
    };
  }

  const filtered = tiendas.filter(t =>
    t.codigo.toLowerCase().includes(search.toLowerCase()) ||
    t.nombre.toLowerCase().includes(search.toLowerCase()) ||
    t.region.toLowerCase().includes(search.toLowerCase())
  );

  const activas  = filtered.filter(t => t.activo).length;
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
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => router.push('/')}>← Volver</button>
        <div style={S.title}>Gestión de Tiendas</div>
        <button style={S.syncBtn} onClick={handleSync} disabled={syncing}>
          {syncing ? 'Sincronizando…' : '↻ Sincronizar Sheet'}
        </button>
        <button style={S.addBtn} onClick={openAdd}>+ Nueva</button>
      </div>

      {msg && (
        <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, color: '#34D399', padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {/* Stats + Search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por código, nombre o región…"
          style={{ ...S.input, flex: 1, minWidth: 200 }}
        />
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, whiteSpace: 'nowrap' }}>
          <span style={{ color: '#34D399', fontWeight: 700 }}>{activas}</span> activas
          {' · '}
          <span style={{ color: '#F87171', fontWeight: 700 }}>{inactivas}</span> inactivas
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>
          {tiendas.length === 0 ? 'No hay tiendas. Usa "Sincronizar Sheet" para importar.' : 'Sin resultados'}
        </div>
      ) : (
        filtered.map(t => (
          <div key={t.codigo} style={S.card}>
            <div style={{ ...S.row, marginBottom: 4 }}>
              <span style={S.codBadge}>{t.codigo}</span>
              <span style={S.name}>{t.nombre}</span>
              <span style={S.activeBadge(t.activo)}>{t.activo ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div style={{ ...S.row, marginBottom: 8 }}>
              {t.region && <span style={S.sub}>{t.region}</span>}
              {t.corredor && <><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span><span style={S.sub}>{t.corredor}</span></>}
              {t.ventana && <><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span><span style={{ ...S.sub, color: '#FCD34D' }}>{t.ventana}</span></>}
              {t.supervisor && <><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span><span style={S.sub}>Sup: {t.supervisor}</span></>}
            </div>
            {t.direccion && <div style={{ ...S.sub, marginBottom: 8, fontSize: 11 }}>{t.direccion}</div>}
            <div style={S.row}>
              {t.correos && <span style={{ ...S.sub, fontSize: 11 }}>✉ {t.correos}</span>}
              {t.tel_encargado && <span style={{ ...S.sub, fontSize: 11 }}>📞 {t.tel_encargado}</span>}
              <div style={{ flex: 1 }} />
              <button style={S.btn('255,255,255')} onClick={() => handleToggleActivo(t)}>
                {t.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button style={S.btn('96,165,250')} onClick={() => openEdit(t)}>
                Editar
              </button>
            </div>
          </div>
        ))
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
              <input
                type="checkbox"
                id="activo-check"
                checked={form.activo}
                onChange={f('activo')}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
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
    </div>
  );
}
