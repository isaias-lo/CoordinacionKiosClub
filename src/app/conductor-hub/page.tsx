'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WifiOff, Truck, Package, Send, Thermometer, Check, RefreshCw, Snowflake, Box, MapPin } from 'lucide-react';
import { RecepcionTiendaScreen } from '@/features/tiendas/RecepcionTiendaScreen';
import { guiaHref } from '@/lib/guiaUrl';
import { rutaDeTienda, eventoLlegada, eventoSalida, type EventoRuta } from '@/features/tiendas/llegadaChofer';
import { fechaChile } from '@/lib/fechaChile';
import { progresoRuta, proximaParadaPendiente } from './progreso';

// Registra salida / llegada en ruta_eventos. Fire-and-forget: nunca frena al chofer en la calle.
function registrarEvento(e: EventoRuta) {
  void fetch('/api/ruta-eventos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e),
  }).catch(() => { /* sin señal: se pierde este dato, no la entrega */ });
}

const TAB_ICON = { ruta: Truck, recepcion: Package } as const;

/* ── Types ──────────────────────────────────────────────── */
interface TiendaRuta {
  id: number; store_cod: string; orden: number;
  pallets: number; bultos: number; estado_entrega: string;
}
interface GuiaRuta {
  id: number; folio_dte: string; drive_url?: string; store_cod?: string;
}
interface RutaData {
  id: number; codigo_ruta: string; fecha: string;
  chofer: string; patente: string; bodega_origen: string; estado: string;
  /** [Panel Conductor] Ausente en cachés viejos de localStorage (de antes de la migración) — se
   *  trata como 'seco', el default del server. */
  tipo?: 'seco' | 'congelado';
  token_qr?: string;
  pioneta_1?: string | null;
  pioneta_2?: string | null;
  ruta_tiendas: TiendaRuta[];
  ruta_guias:   GuiaRuta[];
}

/* ── Constants ──────────────────────────────────────────── */
const PATENTE_KEY = 'conductor_patente';
const CACHE_KEY   = 'conductor_rutas_cache';

// [Fase 1 · enterprise claro] Badges de dos tonos (fondo suave + texto sólido), mismo patrón que
// el resto de la app (ver design_system.md → "Badge de estado"). Antes era una píldora rellena de
// un solo color con texto blanco — quedaba bien sobre el header oscuro, pero no calzaba con el
// resto de la pantalla una vez que el fondo pasó a ser claro.
const ESTADO_BADGE: Record<string, { bg: string; color: string }> = {
  pendiente: { bg: '#FEF3C7', color: '#92400E' },
  en_camino: { bg: 'rgba(37,99,235,0.10)', color: '#2563EB' },
  entregado: { bg: '#DCFCE7', color: '#16A34A' },
  recibido:  { bg: '#F1F5F9', color: '#64748B' },
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_camino: 'En Camino', entregado: 'Entregado', recibido: 'Recibido',
};

// [Fase 1] Nuevo — antes no existía ninguna señal visual de si la ruta es congelada o seca, y es
// justamente lo que decide qué fotos va a pedir el flujo de entrega en la Fase 3.
const TIPO_BADGE = {
  seco:      { bg: '#F1F5F9', color: '#64748B', icon: Box, label: 'Seco' },
  congelado: { bg: 'rgba(37,99,235,0.10)', color: '#2563EB', icon: Snowflake, label: 'Congelado' },
} as const;

function todayISO(): string {
  // Un solo "hoy" para toda la app: el día del CD (America/Santiago). Ver lib/fechaChile.ts.
  return fechaChile();
}

/* ── Page ───────────────────────────────────────────────── */
export default function ConductorHubPage() {
  const [patente,      setPatente]      = useState('');
  const llegadasRegistradas = useRef<Set<string>>(new Set());
  const [input,        setInput]        = useState('');
  const [rutas,        setRutas]        = useState<RutaData[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [offline,      setOffline]      = useState(false);
  const [cacheTs,      setCacheTs]      = useState<number | null>(null);
  const [expanded,     setExpanded]     = useState<number | null>(null);
  const [tab,          setTab]          = useState<'ruta' | 'recepcion'>('ruta');
  // Confirmar salida CD (PUNTO 2 trazabilidad)
  const [salidaId,     setSalidaId]     = useState<number | null>(null);  // ruta_id en confirmación
  const [salidaTemp,   setSalidaTemp]   = useState('');
  const [salidaLoading, setSalidaLoading] = useState(false);
  // Vehículo refrigerado
  const [esRefrigerado, setEsRefrigerado] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PATENTE_KEY);
    if (saved) { setPatente(saved); void cargar(saved); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!patente) return;
    fetch('/api/flota')
      .then(r => r.json())
      .then(({ flota }) => {
        const v = flota?.find((v: { p: string; refrigerado: boolean }) => v.p === patente);
        setEsRefrigerado(v?.refrigerado === true);
      })
      .catch(() => {});
  }, [patente]);

  const cargar = useCallback(async (pat: string) => {
    setLoading(true);
    setOffline(false);
    try {
      const fecha = todayISO();
      const res   = await fetch(`/api/rutas-despacho?fecha=${fecha}&patente=${encodeURIComponent(pat)}`);
      if (!res.ok) throw new Error('Error de servidor');
      const json  = await res.json() as { data: RutaData[] };
      const data  = json.data ?? [];
      setRutas(data);
      setCacheTs(Date.now());
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), patente: pat, data }));
    } catch {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { ts?: number; patente: string; data: RutaData[] };
          if (cached.patente.toUpperCase() === pat.toUpperCase()) {
            setRutas(cached.data);
            setCacheTs(cached.ts ?? null);
            setOffline(true);
          }
        }
      } catch { /* no cache */ }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleIngresar() {
    const p = input.trim().toUpperCase();
    if (!p) return;
    setPatente(p);
    localStorage.setItem(PATENTE_KEY, p);
    void cargar(p);
  }

  function handleSalir() {
    setPatente('');
    setRutas([]);
    setInput('');
    setTab('ruta');
    localStorage.removeItem(PATENTE_KEY);
    localStorage.removeItem(CACHE_KEY);
  }

  async function confirmarSalida(rutaId: number) {
    setSalidaLoading(true);
    try {
      // 1. Actualizar estado de la ruta a en_camino
      await fetch('/api/rutas-despacho', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rutaId, estado: 'en_camino' }),
      });

      // 1b. La HORA real de salida del CD — el estado cambiaba, pero la hora no quedaba en ningún lado.
      registrarEvento(eventoSalida({ rutaId, horaISO: new Date().toISOString(), patente }));

      // 2. Registrar PUNTO 2 en trazabilidad
      await fetch('/api/trazabilidad', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          punto:              'despacho',
          ruta_id:            rutaId,
          usuario_despacho:   patente,
          temperatura_salida: salidaTemp ? parseFloat(salidaTemp) : undefined,
        }),
      });

      // Actualización optimista local
      setRutas(prev => prev.map(r => r.id === rutaId ? { ...r, estado: 'en_camino' } : r));
      setSalidaId(null);
      setSalidaTemp('');
    } catch {
      // silencioso — los datos se recargan en background
    } finally {
      setSalidaLoading(false);
      void cargar(patente);
    }
  }

  /* ── Login ──────────────────────────────────────────── */
  // [Fase 1] Antes era la misma pantalla oscura de la app de consumo (navy/rojo). Se pasa al
  // mismo lenguaje claro que "Entregar en Tienda" (fondo #F8FAFF, tarjeta blanca, navy de acento)
  // para que no haya un salto visual entre "entrar" y usar el resto del panel.
  if (!patente) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: '#F8FAFF' }}>

      <div className="text-center mb-8">
        <div style={{ fontSize: 34, fontWeight: 900, color: '#1B2A6B', letterSpacing: -1 }}>
          KIOS<span style={{ fontStyle: 'italic', color: '#D42B2B' }}>Club</span>
        </div>
        <div style={{ color: '#94A3B8', fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 3 }}>
          Panel Conductor
        </div>
      </div>

      <div className="w-full max-w-xs" style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
          Patente del vehículo
        </label>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleIngresar()}
          placeholder="Ej: ABCD12"
          autoFocus
          style={{
            width: '100%', height: 52, padding: '0 16px', borderRadius: 14,
            background: '#F8FAFF', border: '2px solid #E5E7EB',
            color: '#1C1C1E', fontSize: 22, fontWeight: 800, letterSpacing: 4,
            outline: 'none', textAlign: 'center', marginBottom: 12,
          }}
        />
        <button
          onClick={handleIngresar}
          style={{
            width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: '#1B2A6B',
            color: '#fff', fontSize: 15, fontWeight: 800,
          }}>
          Ingresar
        </button>
      </div>

      <p style={{ color: '#94A3B8', fontSize: 11, marginTop: 20, textAlign: 'center', maxWidth: 240 }}>
        Ingresa la patente del auto asignado para ver tu ruta de hoy
      </p>
    </div>
  );

  /* ── Hub (autenticado) ──────────────────────────────── */
  return (
    // Altura ACOTADA (fixed inset:0) + overflow hidden → el tab con flex:1/overflow:auto
    // scrollea internamente. Con minHeight:100dvh el contenedor crecía y el app-shell lo
    // recortaba (no dejaba scrollear la ruta). Mismo patrón que las pantallas de bodega.
    // [Fase 1] Fondo claro (antes #0f172a) — el mismo que ya usa "Entregar en Tienda", para que
    // cambiar de tab no salte de tema oscuro a claro.
    <div style={{ background: '#F8FAFF', position: 'fixed', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Header — mismo navy sólido (#1B2A6B) que el header de "Entregar en Tienda", sin
          gradiente: es la franja de marca que ambos tabs comparten. */}
      <div style={{ background: '#1B2A6B', padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Solo navegación interna: volver de "Entregar en Tienda" a "Mi Ruta".
                El botón a /panel-choferes se quitó (el sidebar provee la navegación). */}
            {tab === 'recepcion' && (
              <button
                onClick={() => setTab('ruta')}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: 20, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                ‹
              </button>
            )}
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 2 }}>Panel Conductor</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 2, marginTop: 2 }}>{patente}</div>
                <button onClick={handleSalir}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  cambiar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs — underline claro sobre el navy, mismo patrón de tab bar del resto de la app
            (ver design_system.md → "Tab bar"), adaptado a fondo oscuro: activo en blanco sólido,
            inactivo semitransparente, sin píldoras ni sombras. */}
        <div style={{ display: 'flex', gap: 0 }}>
          {([['ruta', 'Mi Ruta'], ['recepcion', 'Entregar en Tienda']] as const).map(([key, label]) => {
            const TabIcon = TAB_ICON[key];
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer',
                  background: 'transparent',
                  borderBottom: tab === key ? '2.5px solid #fff' : '2.5px solid transparent',
                  color: tab === key ? '#fff' : 'rgba(255,255,255,0.55)',
                  fontSize: 12, fontWeight: tab === key ? 800 : 500,
                  transition: 'all 0.15s',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                <TabIcon size={14} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab: Mi Ruta ────────────────────────────────── */}
      {tab === 'ruta' && (
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {offline && (
            <div style={{ padding: '9px 12px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, fontSize: 11, color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
              <WifiOff size={13} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
              <span>Modo offline — datos guardados{cacheTs ? ` (última sincronización ${new Date(cacheTs).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''}. Sirven de respaldo para mostrar al fiscalizador en ruta.</span>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#1B2A6B] rounded-full animate-spin mx-auto mb-3" />
              <p style={{ color: '#64748B', fontSize: 13 }}>Buscando tu ruta…</p>
            </div>
          )}

          {!loading && rutas.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ marginBottom: 12, color: '#94A3B8' }}><Truck size={40} aria-hidden="true" /></div>
              <p style={{ color: '#334155', fontSize: 14, fontWeight: 600 }}>
                No hay rutas asignadas hoy para {patente}
              </p>
              <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>
                Si crees que es un error, contacta al supervisor
              </p>
              <button onClick={() => void cargar(patente)}
                style={{ marginTop: 16, padding: '8px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#1B2A6B', background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                Reintentar
              </button>
            </div>
          )}

          {!loading && rutas.map(r => {
            const isOpen    = expanded === r.id;
            const estadoBd  = ESTADO_BADGE[r.estado] ?? { bg: '#F1F5F9', color: '#64748B' };
            const estadoLbl = ESTADO_LABEL[r.estado] ?? r.estado;
            const tipoBd    = TIPO_BADGE[r.tipo ?? 'seco'];
            const TipoIcon  = tipoBd.icon;
            const qrUrl     = r.token_qr ? `${window.location.origin}/r/${r.token_qr}` : '';
            const totalP    = r.ruta_tiendas.reduce((s, t) => s + t.pallets, 0);
            const totalB    = r.ruta_tiendas.reduce((s, t) => s + t.bultos, 0);
            const { entregadas, total: totalParadas } = progresoRuta(r.ruta_tiendas);
            const proxima   = proximaParadaPendiente(r.ruta_tiendas);

            return (
              <div key={r.id} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

                {/* Cabecera de ruta */}
                <button
                  style={{ width: '100%', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#1C1C1E' }}>{r.codigo_ruta}</div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: tipoBd.color, background: tipoBd.bg }}>
                        <TipoIcon size={11} aria-hidden="true" /> {tipoBd.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      {r.chofer} · {r.ruta_tiendas.length} tienda{r.ruta_tiendas.length !== 1 ? 's' : ''} · {totalP}P {totalB}B
                    </div>
                    {(r.pioneta_1 || r.pioneta_2) && (
                      <div className="text-xs text-[#94A3B8] mt-1">
                        Pionetas: {[r.pioneta_1, r.pioneta_2].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {/* [Fase 1] Progreso a simple vista — antes había que abrir la ruta y contar
                        las paradas entregadas a mano. Barra de 1 color sólido (sin gradiente). */}
                    {totalParadas > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 99, background: '#F1F5F9', overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 99,
                            width: `${(entregadas / totalParadas) * 100}%`,
                            background: entregadas === totalParadas ? '#16A34A' : '#1B2A6B',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: entregadas === totalParadas ? '#16A34A' : '#64748B', flexShrink: 0 }}>
                          {entregadas}/{totalParadas} paradas
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: estadoBd.color, background: estadoBd.bg }}>
                      {estadoLbl}
                    </span>
                    <span style={{ fontSize: 18, color: '#CBD5E1', lineHeight: 1 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #E2E8F0' }}>

                    {/* QR Maestro */}
                    {qrUrl && (
                      <div style={{ padding: '14px 16px', background: '#F8FAFF', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: '#fff', padding: 8, borderRadius: 10, flexShrink: 0, border: '1px solid #E2E8F0' }}>
                          <QRCodeSVG value={qrUrl} size={90} level="M" />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1C1C1E', marginBottom: 4 }}>QR de Fiscalización</div>
                          <div style={{ fontSize: 11, color: '#64748B', lineHeight: 1.6 }}>
                            Muestra este QR si te detienen.<br/>Contiene guías, tiendas y estado.
                          </div>
                          <a href={qrUrl} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-block', marginTop: 8, padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', background: '#1B2A6B', textDecoration: 'none' }}>
                            Abrir página
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Orden de entrega */}
                    <div style={{ padding: '12px 16px 4px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Orden de entrega</div>
                      {[...r.ruta_tiendas].sort((a, b) => a.orden - b.orden).map(t => {
                        const esProxima = proxima?.id === t.id;
                        const entregada = t.estado_entrega === 'entregado';
                        return (
                          <div key={t.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: esProxima ? '8px 10px' : '0 0 10px', marginBottom: 10,
                            borderBottom: esProxima ? 'none' : '1px solid #F1F5F9',
                            background: esProxima ? 'rgba(37,99,235,0.06)' : 'transparent',
                            borderRadius: esProxima ? 10 : 0,
                            border: esProxima ? '1px solid rgba(37,99,235,0.20)' : undefined,
                          }}>
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              background: entregada ? '#DCFCE7' : esProxima ? '#1B2A6B' : '#F1F5F9',
                              color: entregada ? '#16A34A' : esProxima ? '#fff' : '#64748B',
                            }}>
                              {entregada ? <Check size={13} aria-hidden="true" /> : t.orden}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1E' }}>{t.store_cod}</div>
                              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                                {t.pallets > 0 && `${t.pallets}P `}{t.bultos > 0 && `${t.bultos}B`}
                              </div>
                            </div>
                            {esProxima && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#1B2A6B', flexShrink: 0 }}>
                                <MapPin size={11} aria-hidden="true" /> Siguiente
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Guías DTE */}
                    {r.ruta_guias.length > 0 && (
                      <div style={{ padding: '4px 16px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Guías DTE</div>
                        {r.ruta_guias.map(g => (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 13, color: '#1C1C1E', fontFamily: 'monospace' }}>#{g.folio_dte}</span>
                            {g.drive_url && (
                              <a href={guiaHref(g.drive_url)} target="_blank" rel="noreferrer"
                                style={{ padding: '4px 12px', background: '#1B2A6B', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                                Ver PDF
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── PUNTO 2: Confirmar Salida del CD ────────── */}
                    <div style={{ padding: '0 16px 16px' }}>
                      {r.estado === 'pendiente' ? (
                        salidaId === r.id ? (
                          // Panel de confirmación activo
                          <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 14, padding: '14px 14px 10px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Send size={14} aria-hidden="true" /> Confirmar salida del CD
                            </div>
                            {esRefrigerado && (
                              <>
                                <div style={{ fontSize: 11, color: '#78350F', marginBottom: 8, lineHeight: 1.6 }}>
                                  Registra la temperatura de salida de la carga.
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Thermometer size={13} aria-hidden="true" /> Requerido para vehículo refrigerado
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                  <input
                                    type="number"
                                    step="0.1"
                                    inputMode="decimal"
                                    placeholder="Temp. °C"
                                    value={salidaTemp}
                                    onChange={e => setSalidaTemp(e.target.value)}
                                    style={{
                                      flex: 1, padding: '9px 12px', borderRadius: 10,
                                      background: '#fff', border: '1px solid #FDE68A',
                                      color: '#1C1C1E', fontSize: 14, outline: 'none',
                                    }}
                                  />
                                </div>
                              </>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => { setSalidaId(null); setSalidaTemp(''); }}
                                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#fff', border: '1px solid #FDE68A', color: '#92400E', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Cancelar
                              </button>
                              <button
                                onClick={() => void confirmarSalida(r.id)}
                                disabled={salidaLoading}
                                style={{ flex: 2, padding: '10px 0', borderRadius: 10, background: salidaLoading ? '#FDE68A' : '#D97706', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: salidaLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {salidaLoading ? 'Registrando…' : <><Check size={14} aria-hidden="true" /> Confirmar salida</>}
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Botón para abrir el panel
                          <button
                            onClick={() => { setSalidaId(r.id); setSalidaTemp(''); }}
                            style={{ width: '100%', padding: '12px 0', borderRadius: 12, background: '#FEF3C7', border: '1.5px solid #FDE68A', color: '#92400E', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Send size={14} aria-hidden="true" /> Confirmar salida del CD
                          </button>
                        )
                      ) : r.estado === 'en_camino' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 12 }}>
                          <Truck size={16} color="#2563EB" aria-hidden="true" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB' }}>Salida registrada — en ruta</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!loading && rutas.length > 0 && (
            <button onClick={() => void cargar(patente)}
              style={{ padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#64748B', background: '#fff', border: '1px solid #E2E8F0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <RefreshCw size={14} aria-hidden="true" /> Actualizar
            </button>
          )}
        </div>
      )}

      {/* ── Tab: Entregar en Tienda ──────────────────────── */}
      {tab === 'recepcion' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <RecepcionTiendaScreen onBack={() => setTab('ruta')} embedded
            onLlegada={(storeCod, horaISO) => {
              // Re-escanear la misma tienda (un QR que no leyó y después sí) no duplica la llegada.
              const k = `${storeCod}|${horaISO}`;
              if (llegadasRegistradas.current.has(k)) return;
              llegadasRegistradas.current.add(k);
              registrarEvento(eventoLlegada({ rutaId: rutaDeTienda(rutas, storeCod), storeCod, horaISO, patente }));
            }} />
        </div>
      )}
    </div>
  );
}
