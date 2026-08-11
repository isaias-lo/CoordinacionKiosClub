'use client';
import { useState } from 'react';
import { Save, Check, AlertTriangle, Loader2, Lightbulb, Phone, Pencil, Trash2 } from 'lucide-react';
import type { Vehiculo } from '../data/flota';

// [Fase 3] Conductor y pionetas se asignan en FLOTA → Gestionar (por ruta, post-registro),
// no en la tarjeta de Vehículos. Por eso esta tarjeta ya no recibe conductores ni sus handlers.
interface Props {
  flota: Vehiculo[];
  flotaStatus?: string;
  onToggle: (idx: number) => void;
  onToggleTlbd: (idx: number) => void;
  onAgregarVehiculo: (v: Vehiculo) => void;
  onEliminarVehiculo: (idx: number) => void;
  onActualizarVehiculo?: (patente: string, updates: Partial<Vehiculo>) => void;
  onGuardarFlota?: () => void;
}

interface NuevoVehiculoState {
  p: string; c: number | string; b: number | string; t: string; ch: string; tel: string;
  porton: boolean | null; refrigerado: boolean; on: boolean; tlbd: boolean; empresa: string;
  p1: string; p2: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-kmuted uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full text-[14px] px-3 h-[38px] rounded-[8px] border border-black/[0.15] text-ktext focus:outline-none focus:border-knavy bg-white";

export default function FlotaGrid({ flota, flotaStatus, onToggle, onToggleTlbd, onAgregarVehiculo, onEliminarVehiculo, onActualizarVehiculo, onGuardarFlota }: Props) {
  const [showAgregar, setShowAgregar] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Buscador por patente + "seleccionar todos" aplicado a lo VISIBLE (respeta el filtro).
  const q = search.trim().toUpperCase();
  const visibles = flota.map((v, i) => ({ v, i })).filter(({ v }) => !q || v.p.toUpperCase().includes(q));
  const todosVisiblesOn = visibles.length > 0 && visibles.every(({ v }) => v.on);
  const toggleTodosVisibles = () => {
    // Si todos los visibles están activos → desactivarlos; si no → activar los que estén apagados.
    for (const { v, i } of visibles) {
      if (todosVisiblesOn ? v.on : !v.on) onToggle(i);
    }
  };
  const [nuevoVehiculo, setNuevoVehiculo] = useState<NuevoVehiculoState>({
    p: '', c: 10, b: 20, t: '', ch: '', tel: '',
    porton: null, refrigerado: false, on: true, tlbd: false, empresa: '', p1: '', p2: '',
  });

  const patentesExistentes = new Set(flota.map(v => v.p.toUpperCase()));

  function handleAgregarVehiculo() {
    const v = nuevoVehiculo;
    const patente = v.p.trim().toUpperCase();
    if (!patente) { setError('Ingresa la patente'); return; }
    if (patentesExistentes.has(patente)) { setError('Esta patente ya existe en la flota'); return; }

    onAgregarVehiculo({
      p: patente,
      c: parseInt(String(v.c)) || 10,
      b: parseInt(String(v.b)) || 20,
      t: v.t || 'Por confirmar',
      ch: v.ch || '',
      tel: v.tel || '',
      porton: v.porton,
      refrigerado: v.refrigerado,
      tlbd: v.tlbd,
      on: true,
      empresa: v.empresa || '',
      p1: v.p1 || '',
      p2: v.p2 || '',
    });

    setNuevoVehiculo({ p: '', c: 10, b: 20, t: '', ch: '', tel: '', porton: null, refrigerado: false, on: true, tlbd: false, empresa: '', p1: '', p2: '' });
    setError('');
    setShowAgregar(false);
  }

  const nv = nuevoVehiculo;
  const setNv = (patch: Partial<NuevoVehiculoState>) => setNuevoVehiculo(prev => ({ ...prev, ...patch }));

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[11px] font-semibold text-kmuted uppercase tracking-widest mb-0.5">Vehículos registrados</div>
          <div className="text-[15px] font-bold text-ktext">{flota.filter(v => v.on).length} activos · {flota.length} en total</div>
        </div>
        <div className="flex items-center gap-2">
          {onGuardarFlota && (
            <button
              onClick={onGuardarFlota}
              disabled={flotaStatus === 'saving'}
              className={`h-[36px] px-3 rounded-[9px] text-[13px] font-bold transition-all border-2 border-knavy/[0.3] flex items-center justify-center gap-1.5
                ${flotaStatus === 'success' ? 'text-[#34C759] border-[#34C759]/30' : flotaStatus === 'error' ? 'text-kred border-kred/30' : 'text-knavy'}`}
            >
              {flotaStatus === 'saving' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                : flotaStatus === 'success' ? <><Check size={15} aria-hidden="true" /> Guardado</>
                : flotaStatus === 'error' ? <><AlertTriangle size={15} aria-hidden="true" /> Error</>
                : <><Save size={15} aria-hidden="true" /> Guardar</>}
            </button>
          )}
          <button
            onClick={() => { setShowAgregar(!showAgregar); setError(''); }}
            className={`h-[36px] px-4 rounded-[9px] text-[13px] font-bold transition-all border-2 ${showAgregar ? 'bg-kbg border-black/[0.12] text-kmuted' : 'bg-knavy border-knavy text-white'}`}
          >
            {showAgregar ? '✕ Cancelar' : '＋ Nuevo vehículo'}
          </button>
        </div>
      </div>

      {/* ── Formulario nuevo vehículo ── */}
      {showAgregar && (
        <div className="bg-bg border-2 border-knavy/[0.15] rounded-[14px] p-4 mb-5">
          <div className="text-[16px] font-bold text-knavy mb-4">Nuevo vehículo</div>
          {error && (
            <div className="text-[13px] text-kred mb-3 bg-kred/[0.08] px-3 py-2 rounded-[8px] font-semibold">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Patente *">
              <input type="text" value={nv.p} onChange={e => setNv({ p: e.target.value.toUpperCase() })}
                placeholder="Ej: TYKK42" maxLength={6} className={inputCls} />
            </Field>
            <Field label="Tipo de vehículo">
              <input type="text" value={nv.t} onChange={e => setNv({ t: e.target.value })}
                placeholder="Ej: Camión grande" className={inputCls} />
            </Field>
          </div>

          {/* Empresa de transporte → se escribe en la columna TRANSPORTE al registrar/cerrar el camión. */}
          <div className="mb-3">
            <Field label="Empresa de transporte">
              <input type="text" value={nv.empresa} onChange={e => setNv({ empresa: e.target.value })}
                placeholder="Ej: Luis Fica, Ortiz, Falabella" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Cap. Pallets">
              <input type="number" value={nv.c} onChange={e => setNv({ c: e.target.value })}
                placeholder="10" className={inputCls} />
            </Field>
            <Field label="Cap. Bultos">
              <input type="number" value={nv.b} onChange={e => setNv({ b: e.target.value })}
                placeholder="20" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label="Conductor">
              <input type="text" value={nv.ch} onChange={e => setNv({ ch: e.target.value })}
                placeholder="Nombre completo" className={inputCls} />
            </Field>
            <Field label="Teléfono conductor">
              <input type="tel" value={nv.tel} onChange={e => setNv({ tel: e.target.value })}
                placeholder="+56 9 ..." className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Pioneta 1 (opcional)">
              <input type="text" value={nv.p1} onChange={e => setNv({ p1: e.target.value })}
                placeholder="Nombre pioneta" className={inputCls} />
            </Field>
            <Field label="Pioneta 2 (opcional)">
              <input type="text" value={nv.p2} onChange={e => setNv({ p2: e.target.value })}
                placeholder="Nombre pioneta" className={inputCls} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-[13px] text-ktext mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={nv.porton === true} onChange={e => setNv({ porton: e.target.checked ? true : false })} />
              <span>Portón hidráulico</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={nv.refrigerado} onChange={e => setNv({ refrigerado: e.target.checked })} />
              <span>Refrigerado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={nv.tlbd} onChange={e => setNv({ tlbd: e.target.checked })} />
              <span>2ª Vuelta (TLBD)</span>
            </label>
          </div>

          <button onClick={handleAgregarVehiculo}
            className="w-full h-[44px] rounded-[10px] bg-knavy text-white text-[15px] font-bold">
            Agregar vehículo
          </button>
        </div>
      )}

      {/* ── Aviso TLBD ── */}
      <div className="flex items-start gap-2 text-[12px] text-kmuted bg-knavy/[0.05] border border-knavy/[0.12] rounded-[10px] px-3.5 py-2.5 mb-4 leading-relaxed">
        <Lightbulb size={15} className="text-knavy flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>Los mismos autos pueden hacer <strong className="text-knavy">1ª y 2ª vuelta</strong>. Marca un vehículo como &quot;2ª Vuelta&quot; cuando regrese al CD para asignarle las tiendas pendientes.</span>
      </div>

      {/* ── Buscador de patente + seleccionar todos ── */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar patente…"
          className="flex-1 h-[38px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-[10px] text-[13px] font-semibold text-ktext uppercase placeholder:normal-case placeholder:text-kmuted focus:border-knavy focus:outline-none"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="h-[38px] px-3 rounded-[10px] bg-kbg border border-black/[0.09] text-[12px] font-bold text-kmuted">✕</button>
        )}
        <button
          type="button" onClick={toggleTodosVisibles} disabled={visibles.length === 0}
          className="h-[38px] px-3 rounded-[10px] bg-knavy text-white text-[12px] font-bold whitespace-nowrap disabled:opacity-40"
          title={q ? 'Aplica a los resultados del buscador' : 'Aplica a toda la flota'}
        >
          {todosVisiblesOn ? '☐ Ninguno' : '☑ Seleccionar todos'}
        </button>
      </div>

      {/* ── Grid de tarjetas ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibles.length === 0 && (
          <div className="col-span-full text-center text-[13px] text-kmuted py-6">Sin patentes que coincidan con “{search}”.</div>
        )}
        {visibles.map(({ v, i }) => (
          <VehicleCard
            key={v.p} v={v} idx={i}
            onToggle={onToggle}
            onToggleTlbd={onToggleTlbd}
            onEliminar={onEliminarVehiculo}
            onActualizar={onActualizarVehiculo}
          />
        ))}
      </div>
    </div>
  );
}

interface EditVehiculoState {
  t: string; c: string; b: string; empresa: string;
  porton: boolean | null; refrigerado: boolean;
}

function VehicleCard({ v, idx, onToggle, onToggleTlbd, onEliminar, onActualizar }: {
  v: Vehiculo; idx: number;
  onToggle: (i: number) => void;
  onToggleTlbd: (i: number) => void;
  onEliminar: (i: number) => void;
  onActualizar?: (patente: string, updates: Partial<Vehiculo>) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTel, setShowTel]             = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [editState, setEditState]         = useState<EditVehiculoState>({ t: '', c: '', b: '', empresa: '', porton: null, refrigerado: false });

  function openEdit() {
    setEditState({ t: v.t, c: String(v.c), b: String(v.b), empresa: v.empresa ?? '', porton: v.porton, refrigerado: v.refrigerado });
    setEditOpen(true);
  }

  function saveEdit() {
    onActualizar?.(v.p, {
      t:          editState.t || v.t,
      c:          parseInt(editState.c) || v.c,
      b:          parseInt(editState.b) || v.b,
      empresa:    editState.empresa,
      porton:     editState.porton,
      refrigerado: editState.refrigerado,
    });
    setEditOpen(false);
  }

  const eInputCls = "w-full text-[13px] px-2.5 h-[34px] rounded-[7px] border border-black/[0.15] text-ktext focus:outline-none focus:border-knavy bg-white";

  return (
    <div className={`rounded-[14px] border-2 bg-white transition-all overflow-hidden
      ${v.on ? 'border-knavy shadow-[0_2px_12px_rgba(27,42,107,0.12)]' : 'border-black/[0.10] shadow-sm'}
      ${v.tlbd ? 'border-dashed' : ''}`}>

      {/* ── Top: patente + toggle ── */}
      <div
        onClick={() => onToggle(idx)}
        className={`px-4 pt-4 pb-3 cursor-pointer select-none ${v.on ? 'bg-knavy/[0.03]' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {v.tlbd && (
              <div className="inline-flex items-center text-[11px] font-bold text-knavy bg-knavy/[0.10] border border-knavy/[0.20] rounded-[5px] px-2 py-0.5 mb-2 tracking-wide">
                2ª VUELTA
              </div>
            )}
            <div className={`font-mono text-[20px] font-extrabold tracking-wider leading-none mb-1 ${v.on ? 'text-knavy' : 'text-ktext'}`}>
              {v.p}
              {v.tel && (
                <button
                  onClick={e => { e.stopPropagation(); setShowTel(s => !s); }}
                  className="ml-2 text-kmuted hover:text-knavy transition-colors align-middle inline-flex"
                  title={showTel ? 'Ocultar teléfono' : 'Ver teléfono'}
                  aria-label={showTel ? 'Ocultar teléfono' : 'Ver teléfono'}
                ><Phone size={14} aria-hidden="true" /></button>
              )}
            </div>
            {showTel && v.tel && (
              <div className="text-[13px] text-knavy font-semibold mb-1">{v.tel}</div>
            )}
            <div className="text-[13px] text-kmuted font-medium">{v.t} · {v.c}P / {v.b}B</div>
            {v.empresa && <div className="text-[12px] text-kmuted/70 mt-0.5">{v.empresa}</div>}
          </div>

          {/* Toggle activo */}
          <div className={`w-[28px] h-[28px] rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
            ${v.on ? 'bg-knavy border-knavy text-white' : 'border-black/[0.15] bg-white'}`}>
            {v.on ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : null}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {v.porton === true  && <span className="text-[11px] font-semibold text-[#1A7D3A] bg-[#E8F5EC] border border-[#1A7D3A]/[0.3] rounded-[5px] px-2 py-0.5">PORTÓN</span>}
          {v.porton === false && <span className="text-[11px] font-semibold text-kmuted bg-kbg border border-black/[0.09] rounded-[5px] px-2 py-0.5">Sin portón</span>}
          {v.refrigerado      && <span className="text-[11px] font-semibold text-[#4B48C8] bg-[#ECEAFF] border border-[#4B48C8]/[0.3] rounded-[5px] px-2 py-0.5">FRÍO</span>}
        </div>
      </div>

      {/* ── Bottom: acciones (editar/eliminar). Conductor y pionetas → FLOTA → Gestionar ── */}
      <div className="px-4 pb-4 pt-3 border-t border-black/[0.06]" onClick={e => e.stopPropagation()}>

        {/* Edit form inline */}
        {editOpen && (
          <div className="mb-3 bg-kbg border border-black/[0.10] rounded-[10px] p-3">
            <div className="text-[11px] font-semibold text-kmuted uppercase tracking-wide mb-2">Editar vehículo</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[10px] font-semibold text-kmuted uppercase mb-0.5">Tipo</label>
                <input type="text" value={editState.t} onChange={e => setEditState(s => ({ ...s, t: e.target.value }))} className={eInputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-kmuted uppercase mb-0.5">Empresa</label>
                <input type="text" value={editState.empresa} onChange={e => setEditState(s => ({ ...s, empresa: e.target.value }))} className={eInputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[10px] font-semibold text-kmuted uppercase mb-0.5">Cap. Pallets</label>
                <input type="number" value={editState.c} onChange={e => setEditState(s => ({ ...s, c: e.target.value }))} className={eInputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-kmuted uppercase mb-0.5">Cap. Bultos</label>
                <input type="number" value={editState.b} onChange={e => setEditState(s => ({ ...s, b: e.target.value }))} className={eInputCls} />
              </div>
            </div>
            <div className="flex gap-4 text-[12px] text-ktext mb-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={editState.porton === true} onChange={e => setEditState(s => ({ ...s, porton: e.target.checked ? true : false }))} />
                Portón
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={editState.refrigerado} onChange={e => setEditState(s => ({ ...s, refrigerado: e.target.checked }))} />
                Refrigerado
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="flex-1 h-[32px] rounded-[7px] bg-knavy text-white text-[12px] font-bold">Guardar</button>
              <button onClick={() => setEditOpen(false)} className="h-[32px] px-3 rounded-[7px] border border-black/[0.10] text-kmuted text-[12px]">Cancelar</button>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex gap-2">
          <button
            onClick={() => onToggleTlbd(idx)}
            className={`flex-1 h-[32px] rounded-[7px] text-[12px] font-bold border-2 transition-all flex items-center justify-center gap-1
              ${v.tlbd ? 'bg-knavy text-white border-knavy' : 'bg-transparent text-kmuted border-black/[0.10] hover:border-knavy/[0.4] hover:text-knavy'}`}
          >
            {v.tlbd ? <><Check size={14} aria-hidden="true" /> 2ª Vuelta</> : '2ª Vuelta'}
          </button>

          {onActualizar && (
            <button
              onClick={() => editOpen ? setEditOpen(false) : openEdit()}
              aria-label="Editar vehículo"
              className={`h-[32px] px-3 rounded-[7px] text-[12px] border transition-all inline-flex items-center justify-center
                ${editOpen ? 'border-knavy/[0.4] text-knavy bg-knavy/[0.07]' : 'border-black/[0.09] text-kmuted hover:border-knavy/[0.4] hover:text-knavy'}`}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}

          {confirmDelete ? (
            <div className="flex gap-1.5 flex-1">
              <span className="flex-1 text-[12px] text-kred font-semibold flex items-center justify-center">¿Eliminar?</span>
              <button onClick={() => onEliminar(idx)} className="h-[32px] px-3 rounded-[7px] bg-kred text-white text-[12px] font-bold">Sí</button>
              <button onClick={() => setConfirmDelete(false)} className="h-[32px] px-3 rounded-[7px] border border-black/[0.10] text-kmuted text-[12px]">No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Eliminar vehículo"
              className="h-[32px] px-3 rounded-[7px] text-[12px] text-kmuted border border-black/[0.09] bg-transparent hover:border-kred/[0.4] hover:text-kred transition-all inline-flex items-center justify-center"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
