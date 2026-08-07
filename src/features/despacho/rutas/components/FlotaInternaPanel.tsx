'use client';

import { useEffect, useMemo, useState } from 'react';
import { Truck, Search, X, Plus, MapPin, Check } from 'lucide-react';
import type { TiendaInfo } from '../data/tiendas';
import type { ParadaSalida, SalidaVehiculo } from '../utils/flotaInterna';

interface Props { tiendas: Record<string, TiendaInfo> }

const TIPOS = ['Entrega', 'Retiro', 'Mixto'];
const CONTENIDOS = ['Congelados', 'Muebles', 'Merma', 'Maquila', 'Espejos', 'Clorox', 'Varios'];
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function FlotaInternaPanel({ tiendas }: Props) {
  const [fecha,       setFecha]       = useState(hoyISO());
  const [conductor,   setConductor]   = useState('');
  const [vehiculo,    setVehiculo]    = useState('Furgón Frío');
  const [patente,     setPatente]     = useState('');
  const [tipo,        setTipo]        = useState('Entrega');
  const [contenido,   setContenido]   = useState('');
  const [obsGeneral,  setObsGeneral]  = useState('');
  const [horaSalida,  setHoraSalida]  = useState('');
  const [horaRegreso, setHoraRegreso] = useState('');
  const [paradas,     setParadas]     = useState<ParadaSalida[]>([]);
  const [search,      setSearch]      = useState('');
  const [destinoLibre, setDestinoLibre] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');

  const [conductores, setConductores] = useState<string[]>([]);
  const [patentes,    setPatentes]    = useState<string[]>([]);
  const [vehiculos,   setVehiculos]   = useState<string[]>([]);
  const [salidas,     setSalidas]     = useState<Record<string, string>[]>([]);

  useEffect(() => {
    fetch('/api/conductores').then(r => r.json()).then((j: { conductores?: { nombre: string }[] }) => {
      setConductores([...new Set((j.conductores ?? []).map(c => c.nombre).filter(Boolean))]);
    }).catch(() => {});
    fetch('/api/flota').then(r => r.json()).then((j: { flota?: { p: string; t?: string }[] }) => {
      setPatentes([...new Set((j.flota ?? []).map(v => v.p).filter(Boolean))]);
      setVehiculos([...new Set((j.flota ?? []).map(v => v.t).filter(Boolean) as string[])]);
    }).catch(() => {});
    loadSalidas();
  }, []);

  function loadSalidas() {
    fetch('/api/flota-interna').then(r => r.json()).then((j: { salidas?: Record<string, string>[] }) => setSalidas(j.salidas ?? [])).catch(() => {});
  }

  const resultados = useMemo(() => {
    const q = search.trim().toLowerCase();
    const yaCod = new Set(paradas.map(p => p.ref));
    return Object.entries(tiendas)
      .filter(([cod, inf]) => !yaCod.has(cod) && (!q || `${cod} ${inf.n ?? ''} ${inf.z ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 25);
  }, [tiendas, search, paradas]);

  function addParada(ref: string) { if (ref.trim()) setParadas(prev => [...prev, { ref: ref.trim(), obs: '' }]); }
  function addDestino() { if (destinoLibre.trim()) { addParada(destinoLibre); setDestinoLibre(''); } }
  function setObs(i: number, v: string) { setParadas(prev => prev.map((p, idx) => idx === i ? { ...p, obs: v } : p)); }
  function quitar(i: number) { setParadas(prev => prev.filter((_, idx) => idx !== i)); }

  async function registrar() {
    setMsg('');
    if (!conductor.trim() || !vehiculo.trim()) { setMsg('⚠ Completa conductor y vehículo'); return; }
    if (paradas.length === 0) { setMsg('⚠ Agrega al menos una parada'); return; }
    setSaving(true);
    const payload: SalidaVehiculo = { fecha, conductor, vehiculo, patente, tipo, contenido, obsGeneral, horaSalida, horaRegreso, paradas };
    try {
      const res = await fetch('/api/flota-interna', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json() as { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Error');
      setMsg('✓ Salida registrada');
      setParadas([]); setContenido(''); setObsGeneral(''); setHoraSalida(''); setHoraRegreso('');
      loadSalidas();
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg('⚠ ' + (e instanceof Error ? e.message : 'Error')); }
    finally { setSaving(false); }
  }

  const inp = 'w-full border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none';
  const lbl = 'text-[11px] font-bold uppercase tracking-wider text-kmuted mb-1 block';
  const nombre = (cod: string) => tiendas[cod]?.n ?? cod;

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col lg:flex-row gap-4">
      {/* ── Form ── */}
      <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-ktext font-bold text-[15px]"><Truck size={16} className="text-knavy" /> Registro de salida de vehículos</div>

        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>Fecha</label><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Conductor</label><input list="fi-conductores" value={conductor} onChange={e => setConductor(e.target.value)} placeholder="Nombre" className={inp} />
            <datalist id="fi-conductores">{conductores.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className={lbl}>Vehículo</label><input list="fi-vehiculos" value={vehiculo} onChange={e => setVehiculo(e.target.value)} placeholder="Furgón Frío" className={inp} />
            <datalist id="fi-vehiculos">{vehiculos.map(v => <option key={v} value={v} />)}</datalist></div>
          <div><label className={lbl}>Patente</label><input list="fi-patentes" value={patente} onChange={e => setPatente(e.target.value)} placeholder="PKZW-16" className={inp} />
            <datalist id="fi-patentes">{patentes.map(p => <option key={p} value={p} />)}</datalist></div>
          <div><label className={lbl}>Tipo</label><select value={tipo} onChange={e => setTipo(e.target.value)} className={inp}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={lbl}>Contenido</label><input list="fi-contenidos" value={contenido} onChange={e => setContenido(e.target.value)} placeholder="Congelados…" className={inp} />
            <datalist id="fi-contenidos">{CONTENIDOS.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className={lbl}>Hora salida</label><input type="time" value={horaSalida} onChange={e => setHoraSalida(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Hora regreso</label><input type="time" value={horaRegreso} onChange={e => setHoraRegreso(e.target.value)} className={inp} /></div>
        </div>

        {/* Paradas */}
        <div>
          <label className={lbl}>Paradas ({paradas.length})</label>
          <div className="flex items-center gap-2 border border-black/[0.12] rounded-[8px] px-2.5 py-2 bg-white mb-1">
            <Search size={14} className="text-kmuted flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tienda por código/nombre/comuna…" className="flex-1 text-[13px] outline-none bg-transparent text-ktext" />
          </div>
          {search.trim() && (
            <div className="max-h-[140px] overflow-y-auto flex flex-col gap-0.5 mb-1 border border-black/[0.08] rounded-[8px] p-1">
              {resultados.map(([cod, inf]) => (
                <button key={cod} onClick={() => { addParada(cod); setSearch(''); }} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-kbg text-left cursor-pointer">
                  <Plus size={12} className="text-knavy flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-ktext">{cod}</span>
                  <span className="text-[12px] text-kmuted truncate">· {inf.n}</span>
                </button>
              ))}
              {resultados.length === 0 && <div className="text-[12px] text-kmuted text-center py-2">Sin resultados</div>}
            </div>
          )}
          <div className="flex gap-1.5 mb-2">
            <input value={destinoLibre} onChange={e => setDestinoLibre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDestino(); }}
              placeholder="+ Destino libre (Oficina, Luniben, Fundación…)" className="flex-1 border border-dashed border-black/20 rounded-[8px] px-2.5 py-1.5 text-[13px] bg-white text-ktext outline-none" />
            <button onClick={addDestino} className="px-3 rounded-[8px] bg-kbg border border-black/[0.12] text-kmuted text-[12px] font-semibold cursor-pointer">Agregar</button>
          </div>
          <div className="flex flex-col gap-1">
            {paradas.map((p, i) => {
              const esTienda = !!tiendas[p.ref];
              return (
                <div key={`${p.ref}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-white border border-black/[0.09]">
                  <span className="w-5 h-5 rounded-full bg-knavy text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {esTienda ? <MapPin size={12} className="text-knavy flex-shrink-0" /> : <span className="text-[10px] text-kmuted flex-shrink-0">libre</span>}
                  <span className="text-[13px] font-semibold text-ktext flex-shrink-0">{p.ref}</span>
                  {esTienda && <span className="text-[11px] text-kmuted truncate hidden sm:block">{nombre(p.ref)}</span>}
                  <input value={p.obs} onChange={e => setObs(i, e.target.value)} placeholder="obs (qué lleva/retira)…" className="flex-1 min-w-0 text-[12px] bg-kbg rounded-[6px] px-2 py-1 outline-none text-ktext" />
                  <button onClick={() => quitar(i)} className="text-kmuted hover:text-[#D42B2B] cursor-pointer flex-shrink-0"><X size={14} /></button>
                </div>
              );
            })}
            {paradas.length === 0 && <div className="text-[12px] text-kmuted text-center py-2 border border-dashed border-black/10 rounded-[8px]">Agrega tiendas o destinos.</div>}
          </div>
        </div>

        <div><label className={lbl}>Observación general</label><textarea value={obsGeneral} onChange={e => setObsGeneral(e.target.value)} rows={2} placeholder="Ej: ruta congelados" className={inp} /></div>

        {msg && <div className={`text-[12px] font-semibold ${msg.startsWith('✓') ? 'text-[#16A34A]' : 'text-[#D42B2B]'}`}>{msg}</div>}
        <button onClick={registrar} disabled={saving} className="flex items-center justify-center gap-2 py-2.5 rounded-[10px] bg-[#1B2A6B] text-white text-[14px] font-bold cursor-pointer disabled:opacity-50">
          <Check size={15} /> {saving ? 'Registrando…' : 'Registrar salida'}
        </button>
      </div>

      {/* ── Log de salidas recientes ── */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted mb-2">Últimas salidas</div>
        <div className="overflow-x-auto border border-black/[0.09] rounded-[10px]">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>{['Fecha', 'Conductor', 'Patente', 'Tipo', 'N°', 'Tiendas/Destinos'].map(h => (
                <th key={h} className="text-left px-2.5 py-2 bg-kbg text-kmuted font-bold uppercase tracking-wider text-[10px] border-b border-black/[0.09] whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {salidas.map((s, i) => (
                <tr key={i} className={i % 2 ? 'bg-[#FAFBFC]' : 'bg-white'}>
                  <td className="px-2.5 py-1.5 border-b border-black/[0.05] whitespace-nowrap">{s['Fecha']}</td>
                  <td className="px-2.5 py-1.5 border-b border-black/[0.05] whitespace-nowrap">{s['Conductor']}</td>
                  <td className="px-2.5 py-1.5 border-b border-black/[0.05] whitespace-nowrap">{s['Patente']}</td>
                  <td className="px-2.5 py-1.5 border-b border-black/[0.05] whitespace-nowrap">{s['Tipo']}</td>
                  <td className="px-2.5 py-1.5 border-b border-black/[0.05] text-center">{s['N° Puntos']}</td>
                  <td className="px-2.5 py-1.5 border-b border-black/[0.05] max-w-[280px] truncate" title={s['Tiendas/Destinos']}>{s['Tiendas/Destinos']}</td>
                </tr>
              ))}
              {salidas.length === 0 && <tr><td colSpan={6} className="text-center text-kmuted py-6">Aún no hay salidas registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
