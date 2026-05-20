'use client';
import { useState, useRef, useEffect } from 'react';
import type { Vehiculo } from '../data/flota';

interface Props {
  flota: Vehiculo[];
  conductores: string[];
  onToggle: (idx: number) => void;
  onToggleTlbd: (idx: number) => void;
  onConductorChange: (idx: number, nombre: string) => void;
  onAgregarConductor: (nombre: string) => void;
  onAgregarVehiculo: (v: Vehiculo) => void;
  onEliminarVehiculo: (idx: number) => void;
}

const NUEVO_KEY = '__nuevo__';

interface NuevoVehiculoState {
  p: string; c: number | string; b: number | string; t: string; ch: string; tel: string;
  porton: boolean | null; refrigerado: boolean; on: boolean; tlbd: boolean; empresa: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-kmuted uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full text-[14px] px-3 h-[38px] rounded-[8px] border border-black/[0.15] text-ktext focus:outline-none focus:border-kred bg-white";

export default function FlotaGrid({ flota, conductores, onToggle, onToggleTlbd, onConductorChange, onAgregarConductor, onAgregarVehiculo, onEliminarVehiculo }: Props) {
  const [showAgregar, setShowAgregar] = useState(false);
  const [error, setError] = useState('');
  const [nuevoVehiculo, setNuevoVehiculo] = useState<NuevoVehiculoState>({
    p: '', c: 10, b: 20, t: '', ch: '', tel: '',
    porton: null, refrigerado: false, on: true, tlbd: false, empresa: '',
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
    });

    setNuevoVehiculo({ p: '', c: 10, b: 20, t: '', ch: '', tel: '', porton: null, refrigerado: false, on: true, tlbd: false, empresa: '' });
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
        <button
          onClick={() => { setShowAgregar(!showAgregar); setError(''); }}
          className={`h-[36px] px-4 rounded-[9px] text-[13px] font-bold transition-all border-2 ${showAgregar ? 'bg-kbg border-black/[0.12] text-kmuted' : 'bg-kred border-kred text-white'}`}
        >
          {showAgregar ? '✕ Cancelar' : '＋ Nuevo vehículo'}
        </button>
      </div>

      {/* ── Formulario nuevo vehículo ── */}
      {showAgregar && (
        <div className="bg-[#FFF8F8] border-2 border-kred/[0.25] rounded-[14px] p-4 mb-5">
          <div className="text-[16px] font-bold text-kred mb-4">Nuevo vehículo</div>
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

          <div className="mb-4">
            <Field label="Empresa">
              <input type="text" value={nv.empresa} onChange={e => setNv({ empresa: e.target.value })}
                placeholder="Nombre de la empresa" className={inputCls} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-[13px] text-ktext mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={nv.porton === true} onChange={e => setNv({ porton: e.target.checked ? true : null })} />
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
            className="w-full h-[44px] rounded-[10px] bg-kred text-white text-[15px] font-bold">
            Agregar vehículo
          </button>
        </div>
      )}

      {/* ── Aviso TLBD ── */}
      <div className="text-[12px] text-kmuted bg-knavy/[0.05] border border-knavy/[0.12] rounded-[10px] px-3.5 py-2.5 mb-4 leading-relaxed">
        💡 <strong className="text-knavy">TLBD53</strong> (3P máx) se reserva para 2ª vuelta o válvula de alivio.
      </div>

      {/* ── Grid de tarjetas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {flota.map((v, i) => (
          <VehicleCard
            key={v.p} v={v} idx={i}
            conductores={conductores}
            onToggle={onToggle}
            onToggleTlbd={onToggleTlbd}
            onConductorChange={onConductorChange}
            onAgregarConductor={onAgregarConductor}
            onEliminar={onEliminarVehiculo}
          />
        ))}
      </div>
    </div>
  );
}

function VehicleCard({ v, idx, conductores, onToggle, onToggleTlbd, onConductorChange, onAgregarConductor, onEliminar }: {
  v: Vehiculo; idx: number; conductores: string[];
  onToggle: (i: number) => void;
  onToggleTlbd: (i: number) => void;
  onConductorChange: (i: number, n: string) => void;
  onAgregarConductor: (n: string) => void;
  onEliminar: (i: number) => void;
}) {
  const [modoNuevo, setModoNuevo]         = useState(false);
  const [nuevoNombre, setNuevoNombre]     = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTel, setShowTel]             = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modoNuevo && inputRef.current) inputRef.current.focus();
  }, [modoNuevo]);

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === NUEVO_KEY) { setModoNuevo(true); setNuevoNombre(''); }
    else { onConductorChange(idx, val); }
  }

  function confirmarNuevo() {
    const n = nuevoNombre.trim();
    if (n) { onAgregarConductor(n); onConductorChange(idx, n); }
    setModoNuevo(false); setNuevoNombre('');
  }

  function cancelarNuevo() { setModoNuevo(false); setNuevoNombre(''); }

  return (
    <div className={`rounded-[14px] border-2 bg-white transition-all overflow-hidden
      ${v.on ? 'border-kred shadow-[0_2px_12px_rgba(212,43,43,0.12)]' : 'border-black/[0.10] shadow-sm'}
      ${v.tlbd ? 'border-dashed' : ''}`}>

      {/* ── Top: patente + toggle ── */}
      <div
        onClick={() => onToggle(idx)}
        className={`px-4 pt-4 pb-3 cursor-pointer select-none ${v.on ? 'bg-kred/[0.03]' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {v.tlbd && (
              <div className="inline-flex items-center text-[11px] font-bold text-knavy bg-knavy/[0.10] border border-knavy/[0.20] rounded-[5px] px-2 py-0.5 mb-2 tracking-wide">
                2ª VUELTA
              </div>
            )}
            <div className={`font-mono text-[20px] font-extrabold tracking-wider leading-none mb-1 ${v.on ? 'text-kred' : 'text-ktext'}`}>
              {v.p}
              {v.tel && (
                <button
                  onClick={e => { e.stopPropagation(); setShowTel(s => !s); }}
                  className="ml-2 text-[14px] text-kmuted hover:text-knavy transition-colors align-middle"
                  title={showTel ? 'Ocultar teléfono' : 'Ver teléfono'}
                >📞</button>
              )}
            </div>
            {showTel && v.tel && (
              <div className="text-[13px] text-knavy font-semibold mb-1">{v.tel}</div>
            )}
            <div className="text-[13px] text-kmuted font-medium">{v.t} · {v.c}P / {v.b}B</div>
            {v.empresa && <div className="text-[12px] text-kmuted/70 mt-0.5">{v.empresa}</div>}
          </div>

          {/* Toggle activo */}
          <div className={`w-[28px] h-[28px] rounded-full border-2 flex items-center justify-center text-[13px] flex-shrink-0 mt-0.5 transition-all
            ${v.on ? 'bg-kred border-kred text-white' : 'border-black/[0.15] bg-white'}`}>
            {v.on ? '✓' : ''}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {v.porton === true  && <span className="text-[11px] font-semibold text-[#1A7D3A] bg-[#E8F5EC] border border-[#1A7D3A]/[0.3] rounded-[5px] px-2 py-0.5">PORTÓN</span>}
          {v.porton === false && <span className="text-[11px] font-semibold text-kmuted bg-kbg border border-black/[0.09] rounded-[5px] px-2 py-0.5">Sin portón</span>}
          {v.refrigerado      && <span className="text-[11px] font-semibold text-[#4B48C8] bg-[#ECEAFF] border border-[#4B48C8]/[0.3] rounded-[5px] px-2 py-0.5">FRÍO</span>}
        </div>
      </div>

      {/* ── Bottom: conductor + acciones ── */}
      <div className="px-4 pb-4 pt-3 border-t border-black/[0.06]" onClick={e => e.stopPropagation()}>

        {/* Conductor */}
        <div className="mb-2.5">
          <div className="text-[11px] font-semibold text-kmuted uppercase tracking-wide mb-1.5">Conductor</div>
          {modoNuevo ? (
            <div className="flex gap-1.5">
              <input
                ref={inputRef} type="text" value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmarNuevo(); if (e.key === 'Escape') cancelarNuevo(); }}
                placeholder="Nombre del conductor..."
                className="flex-1 min-w-0 text-[13px] px-3 h-[36px] rounded-[8px] border border-knavy/[0.4] text-ktext focus:outline-none focus:border-knavy bg-white"
              />
              <button onClick={confirmarNuevo} className="w-[36px] h-[36px] rounded-[8px] bg-knavy text-white text-[15px] flex items-center justify-center flex-shrink-0">✓</button>
              <button onClick={cancelarNuevo}  className="w-[36px] h-[36px] rounded-[8px] bg-kbg border border-black/[0.09] text-kmuted text-[15px] flex items-center justify-center flex-shrink-0">✕</button>
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] pointer-events-none">👤</span>
              <select
                value={v.ch || ''}
                onChange={handleSelect}
                className={`w-full text-[13px] pl-8 pr-3 h-[36px] rounded-[8px] border appearance-none cursor-pointer focus:outline-none bg-white transition-colors
                  ${v.ch ? 'border-knavy/[0.4] text-knavy font-semibold' : 'border-black/[0.12] text-kmuted'}`}
              >
                <option value="">— Asignar conductor —</option>
                {conductores.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
                <option disabled>──────────────</option>
                <option value={NUEVO_KEY}>➕ Nuevo conductor...</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-kmuted pointer-events-none">▼</span>
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2">
          <button
            onClick={() => onToggleTlbd(idx)}
            className={`flex-1 h-[32px] rounded-[7px] text-[12px] font-bold border-2 transition-all
              ${v.tlbd ? 'bg-knavy text-white border-knavy' : 'bg-transparent text-kmuted border-black/[0.10] hover:border-knavy/[0.4] hover:text-knavy'}`}
          >
            {v.tlbd ? '✓ 2ª Vuelta' : '2ª Vuelta'}
          </button>

          {confirmDelete ? (
            <div className="flex gap-1.5 flex-1">
              <span className="flex-1 text-[12px] text-kred font-semibold flex items-center justify-center">¿Eliminar?</span>
              <button onClick={() => onEliminar(idx)} className="h-[32px] px-3 rounded-[7px] bg-kred text-white text-[12px] font-bold">Sí</button>
              <button onClick={() => setConfirmDelete(false)} className="h-[32px] px-3 rounded-[7px] border border-black/[0.10] text-kmuted text-[12px]">No</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="h-[32px] px-3 rounded-[7px] text-[12px] text-kmuted border border-black/[0.09] bg-transparent hover:border-kred/[0.4] hover:text-kred transition-all"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
