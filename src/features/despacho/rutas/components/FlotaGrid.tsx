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
}

const NUEVO_KEY = '__nuevo__';

interface NuevoVehiculoState {
  p: string; c: number | string; b: number | string; t: string; ch: string;
  porton: boolean | null; refrigerado: boolean; on: boolean; tlbd: boolean; empresa: string;
}

export default function FlotaGrid({ flota, conductores, onToggle, onToggleTlbd, onConductorChange, onAgregarConductor, onAgregarVehiculo }: Props) {
  const [showAgregar, setShowAgregar] = useState(false);
  const [error, setError] = useState('');
  const [nuevoVehiculo, setNuevoVehiculo] = useState<NuevoVehiculoState>({
    p: '', c: 10, b: 20, t: '', ch: '',
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
      porton: v.porton,
      refrigerado: v.refrigerado,
      tlbd: v.tlbd,
      on: true,
      empresa: v.empresa || '',
    });

    setNuevoVehiculo({ p: '', c: 10, b: 20, t: '', ch: '', porton: null, refrigerado: false, on: true, tlbd: false, empresa: '' });
    setError('');
    setShowAgregar(false);
  }

  return (
    <div className="bg-white rounded-kios shadow-kios overflow-hidden mb-3.5">
      <div className="px-4 py-3 border-b border-black/[0.09] flex items-center justify-between">
        <span className="text-[15px] font-bold text-ktext">🚛 Flota</span>
        <button onClick={() => { setShowAgregar(!showAgregar); setError(''); }} className="text-[13px] text-kred font-semibold">
          {showAgregar ? '✕ Cancelar' : '➕ Agregar'}
        </button>
      </div>
      <div className="px-4 py-3.5">
        {showAgregar && (
          <div className="bg-kred/[0.05] border border-kred/[0.2] rounded-kios2 p-3 mb-3">
            <div className="text-[12px] font-bold text-kred mb-2">Nuevo Vehículo</div>
            {error && <div className="text-[11px] text-kred mb-2 bg-kred/[0.1] px-2 py-1 rounded">{error}</div>}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="text" value={nuevoVehiculo.p} onChange={e => setNuevoVehiculo({...nuevoVehiculo, p: e.target.value.toUpperCase()})}
                placeholder="Patente *" maxLength={6}
                className="text-[13px] px-2 h-[34px] rounded-[6px] border border-black/[0.2] text-ktext focus:outline-none focus:border-kred bg-white" />
              <input type="text" value={nuevoVehiculo.t} onChange={e => setNuevoVehiculo({...nuevoVehiculo, t: e.target.value})}
                placeholder="Tipo"
                className="text-[13px] px-2 h-[34px] rounded-[6px] border border-black/[0.2] text-ktext focus:outline-none focus:border-kred bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="number" value={nuevoVehiculo.c} onChange={e => setNuevoVehiculo({...nuevoVehiculo, c: e.target.value})}
                placeholder="Cap. Pallets"
                className="text-[13px] px-2 h-[34px] rounded-[6px] border border-black/[0.2] text-ktext focus:outline-none focus:border-kred bg-white" />
              <input type="number" value={nuevoVehiculo.b} onChange={e => setNuevoVehiculo({...nuevoVehiculo, b: e.target.value})}
                placeholder="Cap. Bultos"
                className="text-[13px] px-2 h-[34px] rounded-[6px] border border-black/[0.2] text-ktext focus:outline-none focus:border-kred bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input type="text" value={nuevoVehiculo.ch} onChange={e => setNuevoVehiculo({...nuevoVehiculo, ch: e.target.value})}
                placeholder="Conductor"
                className="text-[13px] px-2 h-[34px] rounded-[6px] border border-black/[0.2] text-ktext focus:outline-none focus:border-kred bg-white" />
              <input type="text" value={nuevoVehiculo.empresa} onChange={e => setNuevoVehiculo({...nuevoVehiculo, empresa: e.target.value})}
                placeholder="Empresa"
                className="text-[13px] px-2 h-[34px] rounded-[6px] border border-black/[0.2] text-ktext focus:outline-none focus:border-kred bg-white" />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ktext mb-3">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={nuevoVehiculo.porton === true} onChange={e => setNuevoVehiculo({...nuevoVehiculo, porton: e.target.checked ? true : null})} />
                Portón Hidraúlico
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={nuevoVehiculo.refrigerado} onChange={e => setNuevoVehiculo({...nuevoVehiculo, refrigerado: e.target.checked})} />
                Refrigerado
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={nuevoVehiculo.tlbd} onChange={e => setNuevoVehiculo({...nuevoVehiculo, tlbd: e.target.checked})} />
                2ª Vuelta (TLBD)
              </label>
            </div>
            <button onClick={handleAgregarVehiculo} className="w-full h-[38px] rounded-[6px] bg-kred text-white text-[13px] font-bold">
              Agregar Vehículo
            </button>
          </div>
        )}
        <div className="text-[12px] text-kmuted bg-kred/[0.05] border border-kred/[0.1] rounded-kios2 px-3 py-2 mb-3 leading-relaxed">
          💡 <strong>TLBD53</strong> (3P máx) se reserva para 2a vuelta o válvula de alivio.
        </div>
        <div className="grid grid-cols-2 gap-[7px]">
          {flota.map((v, i) => (
            <VehicleCard
              key={v.p} v={v} idx={i}
              conductores={conductores}
              onToggle={onToggle}
              onToggleTlbd={onToggleTlbd}
              onConductorChange={onConductorChange}
              onAgregarConductor={onAgregarConductor}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function VehicleCard({ v, idx, conductores, onToggle, onToggleTlbd, onConductorChange, onAgregarConductor }: {
  v: Vehiculo; idx: number; conductores: string[];
  onToggle: (i: number) => void;
  onToggleTlbd: (i: number) => void;
  onConductorChange: (i: number, n: string) => void;
  onAgregarConductor: (n: string) => void;
}) {
  const [modoNuevo, setModoNuevo]     = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
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

  const portonBadge = v.porton === true
    ? <span className="text-[9px] font-semibold text-[#34C759] bg-[#EAF7EE] border border-[#34C759] rounded px-1 ml-1">PORTÓN</span>
    : v.porton === false
    ? <span className="text-[9px] font-semibold text-kmuted bg-kbg border border-[#E5E5EA] rounded px-1 ml-1">Sin portón</span>
    : null;

  const refrBadge = v.refrigerado
    ? <span className="text-[9px] font-semibold text-[#5856D6] bg-[#EBEAFC] border border-[#5856D6] rounded px-1 ml-1">FRÍO</span>
    : null;

  return (
    <div className={`rounded-kios2 border-[1.5px] bg-kbg transition-all relative overflow-hidden
      ${v.on ? 'border-kred bg-kred/[0.04]' : 'border-black/[0.09]'}
      ${v.tlbd ? 'border-dashed' : ''}`}>
      <div onClick={() => onToggle(idx)} className="px-3 pt-[11px] pb-2 cursor-pointer select-none">
        {v.tlbd && (
          <div className="inline-block text-[9px] font-bold text-knavy bg-knavy/[0.09] border border-knavy/[0.15] rounded-[3px] px-1 py-px mb-1 tracking-[0.5px]">
            2a VUELTA
          </div>
        )}
        <div className={`absolute top-[9px] right-[9px] w-[19px] h-[19px] rounded-full border-[1.5px] flex items-center justify-center text-[10px]
          ${v.on ? 'bg-kred border-kred text-white' : 'border-black/[0.09]'}`}>
          {v.on ? '✓' : ''}
        </div>
        <div className={`font-mono text-[13px] font-bold mb-0.5 flex items-center flex-wrap pr-6 ${v.on ? 'text-kred' : 'text-ktext'}`}>
          {v.p}{portonBadge}{refrBadge}
        </div>
        <div className="text-[11px] text-kmuted">{v.c}P máx · {v.t}</div>
      </div>

      <div className="px-3 pb-[10px]" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onToggleTlbd(idx)}
          className={`w-full h-[24px] rounded-[5px] text-[10px] font-bold mb-1.5 border transition-all
            ${v.tlbd
              ? 'bg-knavy text-white border-knavy'
              : 'bg-transparent text-kmuted border-black/[0.09] hover:border-knavy/[0.35] hover:text-knavy'}`}
        >
          {v.tlbd ? '✓ 2ª Vuelta' : '2ª Vuelta'}
        </button>
        {modoNuevo ? (
          <div className="flex gap-1">
            <input
              ref={inputRef} type="text" value={nuevoNombre}
              onChange={e => setNuevoNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmarNuevo(); if (e.key === 'Escape') cancelarNuevo(); }}
              placeholder="Nombre del conductor..."
              className="flex-1 min-w-0 text-[12px] px-2 h-[28px] rounded-[6px] border border-knavy/[0.4] text-ktext focus:outline-none focus:border-knavy bg-white"
            />
            <button onClick={confirmarNuevo} className="w-[28px] h-[28px] rounded-[6px] bg-knavy text-white text-[13px] flex items-center justify-center flex-shrink-0">✓</button>
            <button onClick={cancelarNuevo} className="w-[28px] h-[28px] rounded-[6px] bg-kbg border border-black/[0.09] text-kmuted text-[13px] flex items-center justify-center flex-shrink-0">✕</button>
          </div>
        ) : (
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none">👤</span>
            <select
              value={v.ch || ''}
              onChange={handleSelect}
              className={`w-full text-[12px] pl-6 pr-2 h-[28px] rounded-[6px] border appearance-none cursor-pointer transition-colors focus:outline-none bg-white
                ${v.ch ? 'border-knavy/[0.4] text-knavy font-semibold' : 'border-black/[0.09] text-kmuted'}`}
            >
              <option value="">— Asignar conductor —</option>
              {conductores.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
              <option disabled>──────────────</option>
              <option value={NUEVO_KEY}>➕ Nuevo conductor...</option>
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-kmuted pointer-events-none">▼</span>
          </div>
        )}
      </div>
    </div>
  );
}
