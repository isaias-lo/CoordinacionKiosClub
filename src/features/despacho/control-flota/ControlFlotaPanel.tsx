'use client';

import { useState, useEffect, useCallback } from 'react';
import { Truck, Users, Plus, Trash2, Save, X, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Pioneta { id: string; nombre: string; telefono?: string; empresa?: string; }

interface RutaTienda { store_cod: string; orden: number; pallets: number; bultos: number; }

interface Ruta {
  id: number;
  fecha: string;
  codigo_ruta: string;
  chofer: string;
  chofer_original?: string | null;
  patente: string;
  pioneta_1?: string | null;
  pioneta_2?: string | null;
  flota_modificada?: boolean;
  flota_modificada_at?: string | null;
  ruta_tiendas: RutaTienda[];
}

interface EditState {
  chofer:    string;
  pioneta_1: string;
  pioneta_2: string;
  saving:    boolean;
  error:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyEdit(ruta: Ruta): EditState {
  return { chofer: ruta.chofer ?? '', pioneta_1: ruta.pioneta_1 ?? '', pioneta_2: ruta.pioneta_2 ?? '', saving: false, error: '' };
}

function isDirty(ruta: Ruta, edit: EditState): boolean {
  return edit.chofer    !== (ruta.chofer    ?? '') ||
         edit.pioneta_1 !== (ruta.pioneta_1 ?? '') ||
         edit.pioneta_2 !== (ruta.pioneta_2 ?? '');
}

function totalUnidades(tiendas: RutaTienda[]): string {
  const p = tiendas.reduce((s, t) => s + (t.pallets ?? 0), 0);
  const b = tiendas.reduce((s, t) => s + (t.bultos  ?? 0), 0);
  const parts = [];
  if (p) parts.push(`${p}P`);
  if (b) parts.push(`${b}B`);
  return parts.join(' · ') || '—';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'hace un momento';
  if (m < 60)  return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

// ── Sub-component: Gestionar Pionetas ─────────────────────────────────────────
function GestionarPionetas({ pionetas, onRefresh }: { pionetas: Pioneta[]; onRefresh: () => void }) {
  const [nombre,   setNombre]   = useState('');
  const [telefono, setTelefono] = useState('');
  const [empresa,  setEmpresa]  = useState('');
  const [adding,   setAdding]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleAdd() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    setAdding(true); setError('');
    try {
      const res = await fetch('/api/pionetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim() || undefined, empresa: empresa.trim() || undefined }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error al agregar');
      setNombre(''); setTelefono(''); setEmpresa('');
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally { setAdding(false); }
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar a "${nombre}" del catálogo?`)) return;
    await fetch(`/api/pionetas?id=${id}`, { method: 'DELETE' });
    onRefresh();
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ background: 'linear-gradient(135deg,#1B2A6B,#2D3F8C)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users size={18} color="rgba(255,255,255,0.8)" />
        <span style={{ fontFamily: 'var(--font-barlow-condensed, sans-serif)', fontSize: 15, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Catálogo de Pionetas
        </span>
        <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700, color: '#fff' }}>
          {pionetas.length}
        </span>
      </div>

      {/* List */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
        {pionetas.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '16px 0' }}>
            Sin pionetas en el catálogo
          </div>
        )}
        {pionetas.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F8FAFF', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1F2937' }}>{p.nombre}</div>
              {(p.telefono || p.empresa) && (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                  {[p.telefono, p.empresa].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <button
              onClick={() => handleDelete(p.id, p.nombre)}
              style={{ background: 'rgba(239,68,68,0.08)', border: 'none', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      <div style={{ borderTop: '1px solid #F1F5F9', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <input
            value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre *"
            style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <input
            value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono"
            style={inputStyle} />
          <input
            value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Empresa"
            style={inputStyle} />
        </div>
        {error && <div style={{ fontSize: 12, color: '#EF4444' }}>{error}</div>}
        <button
          onClick={handleAdd} disabled={adding || !nombre.trim()}
          style={{ ...btnPrimary, opacity: adding || !nombre.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Plus size={14} />
          {adding ? 'Agregando…' : 'Agregar Pioneta'}
        </button>
      </div>
    </div>
  );
}

// ── Sub-component: Ruta Card ───────────────────────────────────────────────────
function RutaCard({
  ruta, edit, pionetas, onChange, onSave, onReset,
}: {
  ruta:     Ruta;
  edit:     EditState;
  pionetas: Pioneta[];
  onChange: (field: keyof EditState, value: string) => void;
  onSave:   () => void;
  onReset:  () => void;
}) {
  const dirty    = isDirty(ruta, edit);
  const modified = ruta.flota_modificada;

  return (
    <div style={{
      background: '#fff', borderRadius: 18, border: `2px solid ${modified ? 'rgba(249,115,22,0.35)' : '#E5E7EB'}`,
      overflow: 'hidden', boxShadow: modified ? '0 4px 20px rgba(249,115,22,0.10)' : '0 2px 12px rgba(0,0,0,0.05)',
    }}>
      {/* Card header */}
      <div style={{ background: modified ? 'linear-gradient(135deg,#EA580C,#F97316)' : 'linear-gradient(135deg,#1B2A6B,#2D3F8C)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Truck size={20} color="rgba(255,255,255,0.85)" strokeWidth={1.8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-barlow-condensed, sans-serif)', fontSize: 18, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {ruta.codigo_ruta}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{ruta.patente}</span>
            {modified && (
              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 8px', color: '#fff' }}>
                ● Modificado {ruta.flota_modificada_at ? timeAgo(ruta.flota_modificada_at) : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            {ruta.ruta_tiendas.length} tienda{ruta.ruta_tiendas.length !== 1 ? 's' : ''} · {totalUnidades(ruta.ruta_tiendas)}
          </div>
        </div>
      </div>

      {/* Tiendas chips */}
      {ruta.ruta_tiendas.length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[...ruta.ruta_tiendas].sort((a, b) => a.orden - b.orden).map(t => (
            <span key={t.store_cod} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(27,42,107,0.07)', color: '#1B2A6B', fontFamily: 'monospace' }}>
              {t.store_cod}
            </span>
          ))}
        </div>
      )}

      {/* Edit fields */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Conductor */}
        <div>
          <label style={labelStyle}>Conductor</label>
          {modified && ruta.chofer_original && ruta.chofer_original !== edit.chofer && (
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>
              Original: <span style={{ color: '#6B7280', fontWeight: 600 }}>{ruta.chofer_original}</span>
            </div>
          )}
          <input
            value={edit.chofer} onChange={e => onChange('chofer', e.target.value)}
            placeholder="Nombre del conductor"
            style={inputStyle} />
        </div>

        {/* Pionetas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Pioneta 1</label>
            <select value={edit.pioneta_1} onChange={e => onChange('pioneta_1', e.target.value)} style={selectStyle}>
              <option value="">— Sin asignar —</option>
              {pionetas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Pioneta 2</label>
            <select value={edit.pioneta_2} onChange={e => onChange('pioneta_2', e.target.value)} style={selectStyle}>
              <option value="">— Sin asignar —</option>
              {pionetas.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
        </div>

        {edit.error && (
          <div style={{ fontSize: 12, color: '#EF4444', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertCircle size={12} /> {edit.error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          {dirty && (
            <button onClick={onReset} disabled={edit.saving}
              style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
              <X size={13} /> Cancelar
            </button>
          )}
          <button onClick={onSave} disabled={!dirty || edit.saving}
            style={{ ...btnPrimary, opacity: !dirty || edit.saving ? 0.45 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Save size={13} />
            {edit.saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 10, fontSize: 13, color: '#1F2937',
  border: '1.5px solid #E5E7EB', outline: 'none', background: '#fff', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 30, cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 10, border: 'none', background: '#1B2A6B',
  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB',
  background: '#F9FAFB', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

// ── Main component ────────────────────────────────────────────────────────────
export function ControlFlotaPanel() {
  const [fecha,       setFecha]       = useState(() => new Date().toISOString().slice(0, 10));
  const [rutas,       setRutas]       = useState<Ruta[]>([]);
  const [pionetas,    setPionetas]    = useState<Pioneta[]>([]);
  const [edits,       setEdits]       = useState<Record<number, EditState>>({});
  const [loading,     setLoading]     = useState(false);
  const [showGestion, setShowGestion] = useState(false);

  const loadPionetas = useCallback(async () => {
    const res  = await fetch('/api/pionetas');
    const json = await res.json() as { data?: Pioneta[] };
    setPionetas(json.data ?? []);
  }, []);

  const loadRutas = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/control-flota?fecha=${f}`);
      const json = await res.json() as { data?: Ruta[] };
      const data = json.data ?? [];
      setRutas(data);
      setEdits(Object.fromEntries(data.map(r => [r.id, emptyEdit(r)])));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRutas(fecha); }, [fecha, loadRutas]);
  useEffect(() => { loadPionetas(); }, [loadPionetas]);

  function handleChange(rutaId: number, field: keyof EditState, value: string) {
    setEdits(prev => ({ ...prev, [rutaId]: { ...prev[rutaId], [field]: value } }));
  }

  async function handleSave(ruta: Ruta) {
    const edit = edits[ruta.id];
    if (!edit || !isDirty(ruta, edit)) return;

    setEdits(prev => ({ ...prev, [ruta.id]: { ...prev[ruta.id], saving: true, error: '' } }));
    try {
      const body: Record<string, unknown> = { ruta_id: ruta.id };
      if (edit.chofer    !== (ruta.chofer    ?? '')) body.chofer    = edit.chofer    || null;
      if (edit.pioneta_1 !== (ruta.pioneta_1 ?? '')) body.pioneta_1 = edit.pioneta_1 || null;
      if (edit.pioneta_2 !== (ruta.pioneta_2 ?? '')) body.pioneta_2 = edit.pioneta_2 || null;

      const res  = await fetch('/api/control-flota', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar');

      await loadRutas(fecha);
    } catch (e) {
      setEdits(prev => ({ ...prev, [ruta.id]: { ...prev[ruta.id], saving: false, error: e instanceof Error ? e.message : 'Error' } }));
    }
  }

  function handleReset(ruta: Ruta) {
    setEdits(prev => ({ ...prev, [ruta.id]: emptyEdit(ruta) }));
  }

  const modifiedCount = rutas.filter(r => r.flota_modificada).length;

  return (
    <div className="flex-1 overflow-y-auto bg-bg" style={{ padding: '16px 16px 32px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fecha</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '7px 12px' }} />
        </div>
        {modifiedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(249,115,22,0.10)', borderRadius: 20, padding: '4px 12px', border: '1px solid rgba(249,115,22,0.25)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F97316', display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#EA580C' }}>{modifiedCount} modificada{modifiedCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <button
          onClick={() => setShowGestion(v => !v)}
          style={{ ...btnSecondary, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} />
          Pionetas
          {showGestion ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Gestionar Pionetas (collapsible) */}
      {showGestion && <GestionarPionetas pionetas={pionetas} onRefresh={loadPionetas} />}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontSize: 14 }}>
          Cargando rutas…
        </div>
      )}

      {/* Empty state */}
      {!loading && rutas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }}>🚚</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#374151', marginBottom: 4 }}>Sin rutas para esta fecha</div>
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>No hay rutas armadas para el {fecha.split('-').reverse().join('/')}</div>
        </div>
      )}

      {/* Rutas */}
      {!loading && rutas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rutas.map(ruta => (
            <RutaCard
              key={ruta.id}
              ruta={ruta}
              edit={edits[ruta.id] ?? emptyEdit(ruta)}
              pionetas={pionetas}
              onChange={(f, v) => handleChange(ruta.id, f, v)}
              onSave={() => handleSave(ruta)}
              onReset={() => handleReset(ruta)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
