'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Package, Truck, Clock, AlertTriangle, Boxes, Search } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { norm, todayStr } from '@/features/despacho/rutas/utils/helpers';
import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL, type TiendaInfo } from '@/features/despacho/rutas/data/tiendas';
import type { Vehiculo } from '@/features/despacho/rutas/data/flota';
import { planificarIncremental, type EsperadoTienda, type EstadoTienda } from '@/features/despacho/rutas/utils/enrutadorIncremental';
import { unidadesDesdeFilas, ahoraMinutoChile, type FilaPicking } from '@/features/despacho/rutas/utils/tableroVivo';
import { parseParametros, aOpcionesMotor, PARAMETROS_DEFAULT } from '@/features/despacho/rutas/utils/parametrosMotor';
import { filasPorTienda, type FilaTiendaConteo } from '@/features/despacho/rutas/utils/conteoFlota';
import { grupoTienda } from '@/features/despacho/rutas/utils/tipoTienda';

const RUTA = '/conteo-flota';
const POLL_MS = 60_000;

const C = {
  ground: '#F8FAFC', surface: '#fff', border: '#E2E8F0', borderSoft: '#F1F5F9',
  ink: '#0F172A', ink2: '#374151', muted: '#475569', muted2: '#64748B', faint: '#94A3B8',
  navy: '#1B2A6B',
};

type EstadoMeta = { label: string; color: string; bg: string; border: string };

const ESTADO_META: Record<EstadoTienda, EstadoMeta> = {
  completa:  { label: 'Completa',          color: '#16A34A', bg: '#F0FDF4', border: '#16A34A' },
  probable:  { label: 'Probable completa', color: '#B45309', bg: '#FFFBEB', border: '#D97706' },
  esperando: { label: 'Esperando carga',   color: '#DC2626', bg: '#FEF2F2', border: '#DC2626' },
};

// Cuando `completa` llega SOLO por la hora de corte (15:00 por defecto) — no por silencio
// confirmado tras alcanzar lo esperado — es una señal mucho más débil: Bodega podría seguir
// cargando esta tienda. Se muestra con el mismo lenguaje visual que "probable" (ámbar), no
// verde, para no sugerir una certeza que no existe.
const COMPLETA_POR_CORTE_META: EstadoMeta = { label: 'Cierre del día (sin confirmar)', color: '#B45309', bg: '#FFFBEB', border: '#D97706' };

function metaDeFila(f: FilaTiendaConteo): EstadoMeta {
  if (f.estado === 'completa' && f.completaPorCorte) return COMPLETA_POR_CORTE_META;
  return ESTADO_META[f.estado];
}

// Mismo agrupador que ya usa el filtro RM/Costa/Nacional del Planificador (`grupoTienda`,
// fuente canónica = campo `region` del catálogo) — evita reinventar la clasificación y
// queda consistente con el resto de la app. 'fal' es el nombre interno histórico de
// Regiones (Falabella hacía todo el reparto antes de partir sur/norte); acá se muestra
// como "Región", que es como lo pidió la persona que usa esta pantalla.
type ZonaFiltro = 'todas' | 'rm' | 'costa' | 'fal';
const ZONA_LABEL: Record<'rm' | 'costa' | 'fal', string> = { rm: 'Santiago', costa: 'Costa', fal: 'Región' };
const ZONA_FILTROS: ZonaFiltro[] = ['todas', 'rm', 'costa', 'fal'];

// Ordena primero lo que más le importa a quien arma rutas: lo que todavía no está
// confirmado. `completa` genuina (silencio real) queda al final; `completa` solo por la
// hora de corte pesa igual que "probable", porque en la práctica tiene la misma certeza.
function urgencia(f: FilaTiendaConteo): number {
  if (f.estado === 'esperando') return 0;
  if (f.estado === 'probable') return 1;
  if (f.estado === 'completa' && f.completaPorCorte) return 1;
  return 2; // completa genuina
}

function coincideBusqueda(f: FilaTiendaConteo, nombre: string, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return f.cod.toLowerCase().includes(needle) || nombre.toLowerCase().includes(needle);
}

/* ── Carga de datos base (flota + tiendas/gps) — mismo patrón que RutasScreen.tsx ── */
function useFlota() {
  const [flota, setFlota] = useState<Vehiculo[]>([]);
  useEffect(() => {
    fetch('/api/flota')
      .then(r => (r.ok ? r.json() : null))
      .then((json: { flota?: Vehiculo[] } | null) => { if (json?.flota) setFlota(json.flota); })
      .catch(() => {});
  }, []);
  return flota;
}

function useTiendasYGps() {
  const [tiendas, setTiendas] = useState<Record<string, TiendaInfo>>(() => ({ ...TIENDAS_INICIAL }));
  const [gps, setGps]         = useState<Record<string, number[]>>(() => ({ ...GPS_INICIAL }));
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => (r.ok ? r.json() : null))
      .then((json: {
        tiendas?: Array<{
          codigo: string; nombre: string; direccion?: string; region?: string;
          sector_comuna?: string; corredor?: string; tipo?: string; ventana?: string;
          frecuencia?: string; lat?: number | null; lon?: number | null; activo?: boolean;
        }>
      } | null) => {
        if (!json?.tiendas?.length) return;
        const tiendasPatch: Record<string, TiendaInfo> = {};
        const gpsPatch: Record<string, number[]> = {};
        for (const t of json.tiendas) {
          if (t.activo === false) continue;
          const cod = norm(t.codigo);
          if (!cod) continue;
          tiendasPatch[cod] = {
            n: t.nombre, z: t.sector_comuna || t.corredor || '', sector: t.sector_comuna || '',
            v: t.ventana || '', d: t.direccion, region: t.region, corredor: t.corredor,
            tipo: t.tipo, frecuencia: t.frecuencia,
          };
          if (
            t.lat != null && t.lon != null && !isNaN(t.lat) && !isNaN(t.lon) &&
            t.lat > -60 && t.lat < -17 && t.lon > -76 && t.lon < -66
          ) {
            gpsPatch[cod] = [t.lat, t.lon];
          }
        }
        if (Object.keys(tiendasPatch).length) setTiendas(prev => ({ ...prev, ...tiendasPatch }));
        if (Object.keys(gpsPatch).length) setGps(prev => ({ ...prev, ...gpsPatch }));
      })
      .catch(() => {});
  }, []);
  return { tiendas, gps };
}

interface Resumen {
  pallets: number;
  cargados: number;
  estimadoAdicional: number;
  bultosCargados: number;
  tiendasPorCompletar: number;
  filas: FilaTiendaConteo[];
}

function StatTile({ icon: Icon, label, value, accent, big }: { icon: React.ElementType; label: string; value: string | number; accent: string; big?: boolean }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: big ? '20px 22px' : '14px 16px', flex: 1, minWidth: big ? 220 : 130, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon size={big ? 16 : 13} color={accent} aria-hidden="true" />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      </div>
      <div style={{ fontSize: big ? 40 : 24, fontWeight: 800, color: C.ink, lineHeight: 1, letterSpacing: big ? -0.5 : 0 }}>{value}</div>
    </div>
  );
}

export default function ConteoFlotaPage() {
  const { profile, loading: authLoading } = useAuth();
  const paths = profile?.allowedPaths ?? [];
  const puedeVer = paths.includes('*') || paths.includes(RUTA);

  const flota = useFlota();
  const { tiendas, gps } = useTiendasYGps();

  const [filasPicking, setFilasPicking] = useState<FilaPicking[]>([]);
  const [historial, setHist]  = useState<Record<string, EsperadoTienda>>({});
  const [params, setParams]   = useState(PARAMETROS_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [ultAct, setUltAct]   = useState<number | null>(null);
  const [zonaFiltro, setZonaFiltro] = useState<ZonaFiltro>('todas');
  const [busqueda, setBusqueda]     = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const fecha = todayStr();
      const [pRes, hRes] = await Promise.all([
        fetch(`/api/picking-pallets?date=${encodeURIComponent(fecha)}`).then(r => r.json()),
        fetch(`/api/rutas-historial?fecha=${encodeURIComponent(fecha)}`).then(r => r.json()),
      ]);
      setFilasPicking((pRes?.data ?? []) as FilaPicking[]);
      setHist((hRes?.data ?? {}) as Record<string, EsperadoTienda>);
      setUltAct(Date.now());
    } catch {
      setError('No se pudo cargar el conteo. Se reintenta solo cada minuto.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!puedeVer) return;
    fetch('/api/parametros-sistema').then(r => r.json())
      .then((j: { data?: Record<string, string> }) => setParams(parseParametros(j?.data ?? {})))
      .catch(() => {});
    void cargar();
    const id = setInterval(cargar, POLL_MS);
    return () => clearInterval(id);
  }, [puedeVer, cargar]);

  const resumen: Resumen | null = (() => {
    if (!filasPicking.length && !Object.keys(historial).length) return null;
    const unidades = unidadesDesdeFilas(filasPicking);
    const ahora     = ahoraMinutoChile();
    const opciones  = aOpcionesMotor(params);
    const plan = planificarIncremental(unidades, flota, gps, CD_INICIAL, tiendas, historial, ahora, opciones);
    const filas = filasPorTienda(unidades, historial, ahora, opciones);

    const cargados          = plan.camiones.reduce((s, k) => s + k.tp, 0);
    const bultosCargados    = plan.camiones.reduce((s, k) => s + k.tb, 0);
    const reservado         = plan.camiones.reduce((s, k) => s + k.reservado, 0);
    const techoEnEspera = plan.enEspera.reduce((s, e) => s + (historial[e.cod]?.techoPallets ?? 0), 0);
    const estimadoAdicional = reservado + techoEnEspera;

    return {
      pallets: cargados + estimadoAdicional,
      cargados,
      estimadoAdicional,
      bultosCargados,
      tiendasPorCompletar: plan.enEspera.length,
      filas,
    };
  })();

  const filasVisibles = (() => {
    if (!resumen) return [];
    return resumen.filas
      .filter(f => zonaFiltro === 'todas' || grupoTienda(tiendas[f.cod]?.z, tiendas[f.cod]?.region) === zonaFiltro)
      .filter(f => coincideBusqueda(f, tiendas[f.cod]?.n ?? '', busqueda))
      .sort((a, b) => urgencia(a) - urgencia(b) || a.cod.localeCompare(b.cod));
  })();

  const minsAtras = ultAct ? Math.max(0, Math.round((Date.now() - ultAct) / 60_000)) : null;

  if (authLoading) return <div style={{ position: 'fixed', inset: 0, background: C.ground }} />;

  if (!puedeVer) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: C.ground }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 6 }}>Acceso restringido</div>
          <div style={{ fontSize: 13, color: C.muted2 }}>Esta cuenta no tiene acceso al conteo de flota.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: C.ground, fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Truck size={18} color="#2563EB" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>Conteo de Flota</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>Estimación del despacho de hoy</div>
        </div>
        <button onClick={() => void cargar()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={13} aria-hidden="true" /> Actualizar
        </button>
        <div style={{ fontSize: 11, color: C.faint }}>
          {minsAtras == null ? 'Cargando…' : minsAtras === 0 ? 'Actualizado recién' : `Actualizado hace ${minsAtras} min`}
        </div>
      </div>

      <div style={{ padding: '20px 24px 40px', maxWidth: 1100, margin: '0 auto' }}>

        {loading && !resumen && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: C.faint, fontSize: 14 }}>Cargando conteo…</div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
            <AlertTriangle size={14} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {resumen && (
          <>
            {/* Estadísticas */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <StatTile icon={Package} label="Pallets estimados hoy" value={`~${resumen.pallets}`} accent={C.navy} big />
              <StatTile icon={Truck} label="Ya cargados" value={resumen.cargados} accent="#16A34A" />
              <StatTile icon={Boxes} label="Estimado adicional" value={resumen.estimadoAdicional} accent="#D97706" />
              <StatTile icon={Clock} label="Tiendas por completar" value={resumen.tiendasPorCompletar} accent="#2563EB" />
            </div>
            <div style={{ fontSize: 12, color: C.muted, background: C.borderSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              <strong style={{ color: C.ink }}>~{resumen.pallets} pallets estimados</strong> = {resumen.cargados} ya cargados (confirmado, ya está en un camión) + {resumen.estimadoAdicional} estimados (lo que falta según el historial de cada tienda, todavía no llega).
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 20 }}>
              ⚠ Estimación — puede variar hasta el cierre del día · Bultos ya contados (dato real, sin proyectar): <strong style={{ color: C.muted }}>{resumen.bultosCargados}</strong>
            </div>

            {/* Detalle por tienda */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Detalle por tienda</div>
              <div style={{ fontSize: 11, color: C.faint }}>
                {filasVisibles.length === resumen.filas.length
                  ? `${resumen.filas.length} tienda${resumen.filas.length !== 1 ? 's' : ''} con carga hoy`
                  : `${filasVisibles.length} de ${resumen.filas.length} tiendas`}
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 12 }}>
              Ordenado por urgencia — arriba lo que todavía no está confirmado. El estado es calculado por el mismo algoritmo del motor de despacho (volumen histórico + tiempo sin novedad), no es una confirmación manual de Bodega todavía.
            </div>

            {/* Buscador + filtro de zona */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
                <Search size={14} color={C.faint} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar por código o nombre de tienda"
                  style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.ink, fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ZONA_FILTROS.map(z => {
                  const activo = zonaFiltro === z;
                  return (
                    <button key={z} onClick={() => setZonaFiltro(z)}
                      style={{
                        padding: '7px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: `1px solid ${activo ? C.navy : C.border}`,
                        background: activo ? C.navy : C.surface,
                        color: activo ? '#fff' : C.muted,
                      }}>
                      {z === 'todas' ? 'Todas' : ZONA_LABEL[z]}
                    </button>
                  );
                })}
              </div>
            </div>

            {filasVisibles.length === 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: C.faint, fontSize: 13 }}>
                {resumen.filas.length === 0 ? 'Todavía no sale mercadería hoy.' : 'Ninguna tienda coincide con el filtro.'}
              </div>
            ) : (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Código', 'Tienda', 'Zona', 'Pallets', 'Bultos', 'Chocolates', 'Estado'].map(h => (
                          <th key={h} style={{ position: 'sticky', top: 0, zIndex: 1, textAlign: h === 'Código' || h === 'Tienda' ? 'left' : 'center', padding: '9px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.navy, background: C.borderSoft, borderBottom: '2px solid rgba(27,42,107,0.18)', whiteSpace: 'nowrap' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filasVisibles.map((f, i) => {
                        const meta = metaDeFila(f);
                        const genuinaCompleta = f.estado === 'completa' && !f.completaPorCorte;
                        const zebra = i % 2 ? '#FAFBFC' : C.surface;
                        const zona = grupoTienda(tiendas[f.cod]?.z, tiendas[f.cod]?.region);
                        const totalEstimado = f.pallets + f.estimadoAdicional;
                        return (
                          <tr key={f.cod} style={{ background: genuinaCompleta ? meta.bg : zebra, borderLeft: `4px solid ${meta.border}` }}>
                            <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 800, color: C.navy, whiteSpace: 'nowrap' }}>{f.cod}</td>
                            <td style={{ padding: '9px 14px', color: C.ink2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tiendas[f.cod]?.n ?? '—'}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'center', color: C.muted2, fontSize: 12, whiteSpace: 'nowrap' }}>{ZONA_LABEL[zona]}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ color: C.ink, fontWeight: 800 }}>
                                {totalEstimado}
                                {f.estimadoAdicional > 0 && <span style={{ fontWeight: 600, color: C.faint }}> aprox.</span>}
                              </div>
                              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>
                                {f.estimadoAdicional > 0 ? `${f.pallets} confirmado + ${f.estimadoAdicional} por venir` : `${f.pallets} confirmado`}
                              </div>
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center', color: C.ink2 }}>{f.bultos}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'center', color: C.ink2 }}>{f.chocolates}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}55`, whiteSpace: 'nowrap' }}>
                                {meta.label}
                              </span>
                              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 3, whiteSpace: 'nowrap' }}>{f.detalle}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !resumen && !error && (
          <div style={{ textAlign: 'center', paddingTop: 60, color: C.faint, fontSize: 14 }}>Todavía no sale mercadería hoy.</div>
        )}
      </div>
    </div>
  );
}
