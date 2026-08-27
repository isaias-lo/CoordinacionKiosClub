'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, X, RefreshCw, AlertTriangle, Clock, Check, Sliders, Radio, PackageCheck, MapPin } from 'lucide-react';
import type { Vehiculo } from '../data/flota';
import type { TiendaInfo } from '../data/tiendas';
import type { StoreItem } from '../utils/routing';
import { fechaTxt } from '../utils/helpers';
import {
  planificarIncremental, prioridadPicking, acumular,
  type EsperadoTienda,
} from '../utils/enrutadorIncremental';
import { enrutarV2, kmRuta, horariosLlegada, aMinutos, OPCIONES_DEFAULT, type OpcionesEnrutador } from '../utils/enrutadorV2';
import { unidadesDesdeFilas, ahoraMinutoChile, type FilaPicking } from '../utils/tableroVivo';
import {
  parseParametros, serializarParametros, aOpcionesMotor, minutosAHHMM,
  PARAMETROS_DEFAULT, type ParametrosMotor,
} from '../utils/parametrosMotor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  flota: Vehiculo[];
  gps: Record<string, number[]>;
  tiendas: Record<string, TiendaInfo>;
  cd: number[];
  fecha: string; // ISO 'YYYY-MM-DD'
}

const ESTADO_STYLE: Record<string, { label: string; cls: string }> = {
  abierto:     { label: 'Abierto',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  listo:       { label: 'Listo',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  'cerrar-ya': { label: 'Cerrar ya', cls: 'bg-kred/10 text-kred border-kred/30' },
};

const ESTADO_TIENDA: Record<string, string> = {
  esperando: 'esperando carga',
  probable:  'probablemente completa',
  completa:  'completa',
};

function Num({ label, value, onChange, step = 1, min = 0, suffix }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-kmuted uppercase tracking-[0.4px]">{label}</span>
      <div className="flex items-center gap-1">
        <input type="number" value={value} step={step} min={min}
          onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
          className="w-full h-[34px] px-2 rounded-[8px] bg-white border border-black/[0.12] text-[13px] font-semibold text-knavy tabular-nums" />
        {suffix && <span className="text-[10px] text-kmuted flex-shrink-0">{suffix}</span>}
      </div>
    </label>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-kmuted uppercase tracking-[0.4px]">{label}</span>
      <input type="time" value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-[34px] px-2 rounded-[8px] bg-white border border-black/[0.12] text-[13px] font-semibold text-knavy tabular-nums" />
    </label>
  );
}

export default function TableroVivo({ isOpen, onClose, flota, gps, tiendas, cd, fecha }: Props) {
  const [filas, setFilas]       = useState<FilaPicking[]>([]);
  const [historial, setHist]    = useState<Record<string, EsperadoTienda>>({});
  const [params, setParams]     = useState<ParametrosMotor>(PARAMETROS_DEFAULT);
  const [ahora, setAhora]       = useState<number>(() => ahoraMinutoChile());
  const [sel, setSel]           = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [ultimaAct, setUltAct]  = useState(0);
  const [showParams, setShowP]  = useState(false);
  const [savingP, setSavingP]   = useState(false);
  const [paramsMsg, setPMsg]    = useState('');

  const cargar = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(`/api/picking-pallets?date=${encodeURIComponent(fecha)}`).then(r => r.json()),
        fetch(`/api/rutas-historial?fecha=${encodeURIComponent(fecha)}`).then(r => r.json()),
      ]);
      setFilas((pRes?.data ?? []) as FilaPicking[]);
      setHist((hRes?.data ?? {}) as Record<string, EsperadoTienda>);
      setAhora(ahoraMinutoChile());
      setUltAct(Date.now());
    } catch {
      setError('No se pudo cargar el tablero.');
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  // Al abrir: params + primera carga, y refresco por poll de 60 s mientras esté abierto.
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/parametros-sistema').then(r => r.json())
      .then(j => setParams(parseParametros(j?.data ?? {}))).catch(() => {});
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => clearInterval(id);
  }, [isOpen, cargar]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const opcEnr: Required<OpcionesEnrutador> = useMemo(() => ({
    ...OPCIONES_DEFAULT,
    maxDiametroKm: params.maxDiametroKm, velocidadKmH: params.velocidadKmH,
    minutosPorParada: params.minutosPorParada, horaSalida: params.horaSalida,
  }), [params]);

  // El motor: plan incremental + fueraDeRadio (que PlanIncremental no expone → misma v2 sobre el
  // pool acumulado real, solo para la lista de tiendas que caen fuera del radio RM).
  const { plan, fueraDeRadio } = useMemo(() => {
    const unidades = unidadesDesdeFilas(filas);
    const opciones = aOpcionesMotor(params);
    const plan = planificarIncremental(unidades, flota, gps, cd, tiendas, historial, ahora, opciones);
    const pool: StoreItem[] = Object.entries(acumular(unidades))
      .map(([cod, a]) => ({ c: cod, p: a.p + a.c_, b: a.b, ch: a.ch ?? 0 }));
    const fueraDeRadio = pool.length ? enrutarV2(pool, flota, gps, cd, tiendas, opciones).fueraDeRadio : [];
    return { plan, fueraDeRadio };
  }, [filas, historial, params, ahora, flota, gps, cd, tiendas]);

  const prioridades = useMemo(() => prioridadPicking(plan), [plan]);
  const camionSel   = useMemo(() => plan.camiones.find(k => k.v.p === sel) ?? null, [plan, sel]);
  const horariosSel = useMemo(
    () => camionSel ? horariosLlegada(camionSel.orden, gps, cd, opcEnr) : [],
    [camionSel, gps, cd, opcEnr],
  );

  const setP = <K extends keyof ParametrosMotor>(k: K, v: ParametrosMotor[K]) =>
    setParams(p => ({ ...p, [k]: v }));

  const guardarParams = async () => {
    setSavingP(true); setPMsg('');
    try {
      const rs = await Promise.all(serializarParametros(params).map(({ clave, valor }) =>
        fetch('/api/parametros-sistema', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave, valor }),
        })));
      setPMsg(rs.every(r => r.ok) ? 'Guardado ✓' : 'Sin permiso para guardar');
    } catch {
      setPMsg('Error al guardar');
    } finally {
      setSavingP(false);
    }
  };

  if (!isOpen) return null;

  const listos = plan.camiones.filter(k => k.estado !== 'abierto').length;
  const segs = ultimaAct ? Math.round((Date.now() - ultimaAct) / 1000) : 0;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-knavy text-white flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Radio size={18} className="text-emerald-300 animate-pulse" aria-hidden="true" />
          <div>
            <div className="font-barlow-condensed text-[20px] font-bold tracking-widest uppercase">Tablero vivo</div>
            <div className="text-white/50 text-[11px] mt-0.5">
              {fechaTxt(fecha)} · {minutosAHHMM(ahora)} · {ultimaAct ? `actualizado hace ${segs}s` : '…'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={loading}
            className="h-9 px-3 rounded-full flex items-center gap-1.5 text-white/80 hover:text-white text-[12px] font-semibold transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Actualizar
          </button>
          <button onClick={onClose} aria-label="Cerrar"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto bg-kbg px-4 py-5">
        <div className="max-w-[720px] mx-auto">

          {error && (
            <div className="mb-3 text-[13px] text-kred bg-kred/[0.06] border border-kred/20 rounded-kios px-3 py-2">{error}</div>
          )}

          {/* Parámetros (PASO 5) */}
          <div className="bg-white rounded-kios shadow-kios mb-4">
            <button onClick={() => setShowP(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left">
              <span className="flex items-center gap-2 text-[12px] font-bold text-knavy uppercase tracking-[0.5px]">
                <Sliders size={14} aria-hidden="true" /> Parámetros del motor
              </span>
              <span className="text-[11px] text-kmuted">
                {params.velocidadKmH} km/h · parada {params.minutosPorParada}′ · corte {minutosAHHMM(params.corteCierre)}
              </span>
            </button>
            {showParams && (
              <div className="px-4 pb-4 pt-1 border-t border-black/[0.06]">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Num label="Máx. diámetro" value={params.maxDiametroKm} onChange={v => setP('maxDiametroKm', v)} suffix="km" />
                  <Num label="Velocidad" value={params.velocidadKmH} onChange={v => setP('velocidadKmH', Math.max(1, v))} suffix="km/h" min={1} />
                  <Num label="Min. por parada" value={params.minutosPorParada} onChange={v => setP('minutosPorParada', Math.max(1, v))} suffix="min" min={1} />
                  <TimeField label="Hora de salida" value={params.horaSalida} onChange={v => setP('horaSalida', v)} />
                  <TimeField label="Corte de cierre" value={minutosAHHMM(params.corteCierre)}
                    onChange={v => { const m = aMinutos(v); if (m != null) setP('corteCierre', m); }} />
                  <Num label="Silencio" value={params.silencioMin} onChange={v => setP('silencioMin', Math.max(1, v))} suffix="min" min={1} />
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button onClick={guardarParams} disabled={savingP}
                    className="h-[34px] px-4 rounded-[10px] bg-knavy text-white text-[12px] font-bold disabled:opacity-60">
                    {savingP ? 'Guardando…' : 'Guardar parámetros'}
                  </button>
                  <button onClick={() => setParams(PARAMETROS_DEFAULT)}
                    className="h-[34px] px-3 rounded-[10px] bg-kbg border border-black/[0.10] text-kmuted text-[12px] font-semibold">
                    Restablecer
                  </button>
                  {paramsMsg && <span className="text-[12px] text-kmuted">{paramsMsg}</span>}
                </div>
                <p className="text-[11px] text-kmuted mt-2 leading-snug">
                  Cada cambio recalcula el tablero al instante. &laquo;Guardar&raquo; los deja fijos para todos.
                </p>
              </div>
            )}
          </div>

          {/* Resumen */}
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[12px]">
            <span className="font-bold text-knavy">{plan.camiones.length} camión{plan.camiones.length === 1 ? '' : 'es'}</span>
            {listos > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold">
                <PackageCheck size={12} aria-hidden="true" /> {listos} para despachar
              </span>
            )}
            <span className="text-kmuted">· {plan.enEspera.length} en espera</span>
          </div>

          {/* Camiones */}
          {plan.camiones.length === 0 ? (
            <div className="text-[13px] text-kmuted bg-white rounded-kios shadow-kios px-4 py-5 text-center">
              {loading ? 'Cargando…' : 'Todavía no sale mercadería para armar camiones.'}
            </div>
          ) : (
            <div className="space-y-2">
              {plan.camiones.map(k => {
                const st = ESTADO_STYLE[k.estado] ?? ESTADO_STYLE.abierto;
                const km = kmRuta(k.orden, gps, cd);
                const llegadas = horariosLlegada(k.orden, gps, cd, opcEnr);
                const ultima = llegadas.length ? llegadas[llegadas.length - 1] : null;
                const abierto = sel === k.v.p;
                return (
                  <div key={k.v.p} className={`bg-white rounded-kios shadow-kios border ${abierto ? 'border-knavy/40' : 'border-transparent'}`}>
                    <button onClick={() => setSel(abierto ? null : k.v.p)} className="w-full text-left px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Truck size={15} className="text-knavy flex-shrink-0" aria-hidden="true" />
                        <span className="font-bold text-knavy text-[14px]">{k.v.p}</span>
                        {k.v.empresa && <span className="text-[11px] text-kmuted">{k.v.empresa}</span>}
                        <span className={`text-[10px] font-bold uppercase tracking-[0.4px] px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                        <span className="ml-auto text-[11px] text-kmuted tabular-nums flex items-center gap-2">
                          <span>{k.tp}P{k.tb > 0 ? ` · ${k.tb}B` : ''}</span>
                          <span className="flex items-center gap-0.5"><MapPin size={11} aria-hidden="true" />{km.toFixed(0)}km</span>
                          {ultima != null && <span className="flex items-center gap-0.5"><Clock size={11} aria-hidden="true" />{minutosAHHMM(ultima)}</span>}
                        </span>
                      </div>
                      <div className="text-[12px] text-kmuted mt-1 flex items-center gap-1.5">
                        {k.estado === 'listo' && <Check size={13} className="text-emerald-600 flex-shrink-0" aria-hidden="true" />}
                        {k.estado === 'cerrar-ya' && <AlertTriangle size={13} className="text-kred flex-shrink-0" aria-hidden="true" />}
                        <span>{k.motivo}</span>
                      </div>
                    </button>

                    {k.estado === 'listo' && (
                      <div className="px-4 pb-3 -mt-1">
                        <button onClick={() => setSel(k.v.p)}
                          className="h-[32px] px-3 rounded-[9px] bg-emerald-600 text-white text-[12px] font-bold flex items-center gap-1.5">
                          <PackageCheck size={13} aria-hidden="true" /> Despachar {k.v.p}
                        </button>
                      </div>
                    )}

                    {abierto && (
                      <div className="px-4 pb-4 border-t border-black/[0.06] pt-3">
                        <div className="text-[11px] font-bold text-knavy uppercase tracking-[0.5px] mb-1">Orden de carga (LIFO)</div>
                        <p className="text-[11px] text-kmuted mb-2 leading-snug">
                          Cargá en este orden: la <b>primera</b> va al fondo del camión, la <b>última</b> queda en la puerta
                          (es la primera en entregarse).
                        </p>
                        {k.ordenCarga.length === 0 ? (
                          <div className="text-[12px] text-kmuted">Sin carga salida todavía.</div>
                        ) : (
                          <ol className="space-y-1">
                            {k.ordenCarga.map((cod, i) => {
                              // ordenCarga es el inverso de la entrega: su hora de llegada es la del final de la lista de entrega.
                              const idxEntrega = k.orden.indexOf(cod);
                              const hora = idxEntrega >= 0 ? horariosSel[idxEntrega] : null;
                              return (
                                <li key={cod} className="flex items-center gap-2 text-[12px]">
                                  <span className="w-5 h-5 rounded-full bg-knavy/[0.08] text-knavy text-[10px] font-bold flex items-center justify-center flex-shrink-0 tabular-nums">{i + 1}</span>
                                  <span className="font-mono font-semibold text-knavy">{cod}</span>
                                  <span className="text-kmuted truncate">{tiendas[cod]?.n ?? ''}</span>
                                  {hora != null && <span className="ml-auto text-[11px] text-kmuted tabular-nums flex-shrink-0">entrega ~{minutosAHHMM(hora)}</span>}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Prioridad de picking */}
          {prioridades.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">Que bodega termine primero</div>
              <p className="text-[11px] text-kmuted mb-2 leading-snug">Completar estas tiendas libera el próximo camión (menos faltantes primero).</p>
              <div className="flex flex-wrap gap-1.5">
                {prioridades.map(p => (
                  <span key={`${p.patente}-${p.cod}`} className="text-[11px] font-semibold px-2 py-1 rounded-[7px] bg-white shadow-kios border border-black/[0.08]">
                    <span className="font-mono text-knavy">{p.cod}</span>
                    <span className="text-kmuted"> → {p.patente} · faltan {p.faltanEnEseCamion}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* En espera */}
          {plan.enEspera.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">En espera (aún no entran en un camión)</div>
              <div className="flex flex-wrap gap-1.5">
                {plan.enEspera.map(e => (
                  <span key={e.cod} className="text-[11px] font-semibold px-2 py-1 rounded-[7px] bg-white shadow-kios border border-black/[0.08]">
                    <span className="font-mono text-knavy">{e.cod}</span>
                    <span className="text-kmuted"> · {e.recibido}/{e.esperado || '?'} · {ESTADO_TIENDA[e.estado] ?? e.estado}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fuera de radio RM */}
          {fueraDeRadio.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">Fuera del radio RM (van por Regiones)</div>
              <div className="flex flex-wrap gap-1.5">
                {fueraDeRadio.map(s => (
                  <span key={s.c} className="text-[11px] font-mono font-semibold px-2 py-1 rounded-[7px] bg-amber-50 text-amber-800 border border-amber-200">{s.c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Avisos */}
          {plan.avisos.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-semibold text-kmuted uppercase tracking-[1px] mb-2">Avisos</div>
              <ul className="space-y-1.5">
                {plan.avisos.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-ktext bg-white rounded-kios shadow-kios px-3 py-2">
                    <AlertTriangle size={13} className="text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
