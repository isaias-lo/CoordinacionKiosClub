'use client';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Package, Truck, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { norm, todayStr } from '@/features/despacho/rutas/utils/helpers';
import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL, type TiendaInfo } from '@/features/despacho/rutas/data/tiendas';
import type { Vehiculo } from '@/features/despacho/rutas/data/flota';
import { planificarIncremental, type EsperadoTienda } from '@/features/despacho/rutas/utils/enrutadorIncremental';
import { unidadesDesdeFilas, ahoraMinutoChile, type FilaPicking } from '@/features/despacho/rutas/utils/tableroVivo';
import { parseParametros, aOpcionesMotor, PARAMETROS_DEFAULT } from '@/features/despacho/rutas/utils/parametrosMotor';

const RUTA = '/conteo-flota';
const POLL_MS = 60_000;

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

/* ── Resumen del plan: solo lo que hace falta para el número grande ── */
interface Resumen {
  pallets: number;         // ya cargados + estimado adicional
  cargados: number;        // ya cargados (real)
  estimadoAdicional: number; // reservado + techo de tiendas aún sin camión
  bultosCargados: number;  // real, sin proyectar
  tiendasPorCompletar: number;
}

function StatTile({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string | number; accent: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '16px 14px', flex: 1, minWidth: 130 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon size={13} color={accent} aria-hidden="true" />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{value}</div>
    </div>
  );
}

export default function ConteoFlotaPage() {
  const { profile, loading: authLoading } = useAuth();
  const paths = profile?.allowedPaths ?? [];
  const puedeVer = paths.includes('*') || paths.includes(RUTA);

  const flota = useFlota();
  const { tiendas, gps } = useTiendasYGps();

  const [filas, setFilas]     = useState<FilaPicking[]>([]);
  const [historial, setHist]  = useState<Record<string, EsperadoTienda>>({});
  const [params, setParams]   = useState(PARAMETROS_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [ultAct, setUltAct]   = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const fecha = todayStr();
      const [pRes, hRes] = await Promise.all([
        fetch(`/api/picking-pallets?date=${encodeURIComponent(fecha)}`).then(r => r.json()),
        fetch(`/api/rutas-historial?fecha=${encodeURIComponent(fecha)}`).then(r => r.json()),
      ]);
      setFilas((pRes?.data ?? []) as FilaPicking[]);
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
    if (!filas.length && !Object.keys(historial).length) return null;
    const unidades = unidadesDesdeFilas(filas);
    const opciones  = aOpcionesMotor(params);
    const plan = planificarIncremental(unidades, flota, gps, CD_INICIAL, tiendas, historial, ahoraMinutoChile(), opciones);

    const cargados          = plan.camiones.reduce((s, k) => s + k.tp, 0);
    const bultosCargados    = plan.camiones.reduce((s, k) => s + k.tb, 0);
    const reservado         = plan.camiones.reduce((s, k) => s + k.reservado, 0);
    // Tiendas que ni siquiera entraron a un camión: se suma el mismo techo histórico que usaría
    // el motor si entraran ahora (mismo criterio que planificarIncremental para reservar espacio).
    const techoEnEspera = plan.enEspera.reduce((s, e) => s + (historial[e.cod]?.techoPallets ?? 0), 0);
    const estimadoAdicional = reservado + techoEnEspera;

    return {
      pallets: cargados + estimadoAdicional,
      cargados,
      estimadoAdicional,
      bultosCargados,
      tiendasPorCompletar: plan.enEspera.length,
    };
  })();

  const minsAtras = ultAct ? Math.max(0, Math.round((Date.now() - ultAct) / 60_000)) : null;

  if (authLoading) return <div style={{ minHeight: '100dvh', background: '#0f172a' }} />;

  if (!puedeVer) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: 'linear-gradient(160deg, #0f172a 0%, #1a2550 100%)' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Acceso restringido</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Esta cuenta no tiene acceso al conteo de flota.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', padding: '0 20px 40px', background: 'linear-gradient(160deg, #0f172a 0%, #1a2550 100%)' }}>

      {/* ── Header ── */}
      <div style={{ paddingTop: 28, paddingBottom: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: '#C62828', letterSpacing: -1 }}>
          KIOS<span style={{ fontStyle: 'italic' }}>Club</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 3 }}>
          Conteo estimado de hoy
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {loading && !resumen && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div className="w-8 h-8 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Cargando conteo…</p>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 12, color: '#FCA5A5', fontSize: 12 }}>
            <AlertTriangle size={14} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {resumen && (
          <>
            {/* Número grande */}
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: '30px 24px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', marginBottom: 16 }}>
                <AlertTriangle size={12} color="#FDBA74" aria-hidden="true" />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#FDBA74', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Estimación — puede variar hasta el cierre
                </span>
              </div>
              <div style={{ fontSize: 64, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -1 }}>
                ~{resumen.pallets}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, fontWeight: 600 }}>
                pallets estimados hoy
              </div>
            </div>

            {/* Stats de contexto */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatTile icon={Package} label="Ya cargados" value={resumen.cargados} accent="#34D399" />
              <StatTile icon={Truck} label="Estimado adicional" value={resumen.estimadoAdicional} accent="#FDBA74" />
              <StatTile icon={Clock} label="Tiendas por completar" value={resumen.tiendasPorCompletar} accent="#93C5FD" />
            </div>

            {/* Bultos reales, sin proyectar */}
            <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Bultos ya contados: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{resumen.bultosCargados}</strong> (dato real, no estimado)
            </div>
          </>
        )}

        {!loading && !resumen && !error && (
          <div style={{ textAlign: 'center', paddingTop: 20, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Todavía no sale mercadería hoy.
          </div>
        )}

        {/* Refresh */}
        <button onClick={() => void cargar()}
          style={{ marginTop: 4, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={13} aria-hidden="true" /> Actualizar
        </button>
        <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
          {minsAtras == null ? 'Cargando…' : minsAtras === 0 ? 'Actualizado recién' : `Actualizado hace ${minsAtras} min`} · se refresca solo cada minuto
        </div>
      </div>
    </div>
  );
}
