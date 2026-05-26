'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { RecepcionTiendaScreen } from '@/features/tiendas/RecepcionTiendaScreen';

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
  token_qr?: string;
  ruta_tiendas: TiendaRuta[];
  ruta_guias:   GuiaRuta[];
}

/* ── Constants ──────────────────────────────────────────── */
const PATENTE_KEY = 'conductor_patente';
const CACHE_KEY   = 'conductor_rutas_cache';

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#FF9500', en_camino: '#007AFF', entregado: '#34C759', recibido: '#8E8E93',
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_camino: 'En Camino', entregado: 'Entregado', recibido: 'Recibido',
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── Page ───────────────────────────────────────────────── */
export default function ConductorHubPage() {
  const router = useRouter();
  const [patente,  setPatente]  = useState('');
  const [input,    setInput]    = useState('');
  const [rutas,    setRutas]    = useState<RutaData[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [offline,  setOffline]  = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tab,      setTab]      = useState<'ruta' | 'recepcion'>('ruta');

  useEffect(() => {
    const saved = localStorage.getItem(PATENTE_KEY);
    if (saved) { setPatente(saved); void cargar(saved); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), patente: pat, data }));
    } catch {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { patente: string; data: RutaData[] };
          if (cached.patente.toUpperCase() === pat.toUpperCase()) {
            setRutas(cached.data);
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

  /* ── Login ──────────────────────────────────────────── */
  if (!patente) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1a2550 100%)', position: 'relative' }}>

      <button
        onClick={() => router.push('/panel-choferes')}
        style={{
          position: 'absolute', top: 20, left: 20,
          width: 38, height: 38, borderRadius: 12,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        ‹
      </button>

      <div className="text-center mb-10">
        <div style={{ fontSize: 36, fontWeight: 900, color: '#C62828', letterSpacing: -1 }}>
          KIOS<span style={{ fontStyle: 'italic' }}>Club</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 3 }}>
          Hub Conductor
        </div>
      </div>

      <div className="w-full max-w-xs">
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>
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
            background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)',
            color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 4,
            outline: 'none', textAlign: 'center', marginBottom: 12,
          }}
        />
        <button
          onClick={handleIngresar}
          style={{
            width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #C62828, #a51f1f)',
            color: '#fff', fontSize: 15, fontWeight: 800,
          }}>
          Ingresar
        </button>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, marginTop: 24, textAlign: 'center', maxWidth: 240 }}>
        Ingresa la patente del auto asignado para ver tu ruta de hoy
      </p>
    </div>
  );

  /* ── Hub (autenticado) ──────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a2550 0%, #2d3f8a 100%)', padding: '18px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => router.push('/panel-choferes')}
              style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.7)', fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              ‹
            </button>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2 }}>Hub Conductor</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: 2, marginTop: 2 }}>{patente}</div>
            </div>
          </div>
          <button onClick={handleSalir}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>
            Salir
          </button>
        </div>

        {offline && (
          <div style={{ marginBottom: 12, padding: '5px 10px', background: 'rgba(255,149,0,0.15)', border: '1px solid rgba(255,149,0,0.3)', borderRadius: 8, fontSize: 10, color: '#FF9500' }}>
            📴 Modo offline — mostrando datos guardados
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {([['ruta', '🚚 Mi Ruta'], ['recepcion', '✅ Recepción en Tienda']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '10px 8px', border: 'none', cursor: 'pointer',
                background: 'transparent',
                borderBottom: tab === key ? '2.5px solid #fff' : '2.5px solid transparent',
                color: tab === key ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: tab === key ? 800 : 500,
                transition: 'all 0.15s',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Mi Ruta ────────────────────────────────── */}
      {tab === 'ruta' && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {loading && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div className="w-8 h-8 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Buscando tu ruta…</p>
            </div>
          )}

          {!loading && rutas.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 }}>
                No hay rutas asignadas hoy para {patente}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 4 }}>
                Si crees que es un error, contacta al supervisor
              </p>
              <button onClick={() => void cargar(patente)}
                style={{ marginTop: 16, padding: '8px 20px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                Reintentar
              </button>
            </div>
          )}

          {!loading && rutas.map(r => {
            const isOpen    = expanded === r.id;
            const estadoCol = ESTADO_COLOR[r.estado] ?? '#8E8E93';
            const estadoLbl = ESTADO_LABEL[r.estado] ?? r.estado;
            const qrUrl     = r.token_qr ? `${window.location.origin}/r/${r.token_qr}` : '';
            const totalP    = r.ruta_tiendas.reduce((s, t) => s + t.pallets, 0);
            const totalB    = r.ruta_tiendas.reduce((s, t) => s + t.bultos, 0);

            return (
              <div key={r.id} style={{ background: '#1e293b', borderRadius: 16, overflow: 'hidden' }}>

                {/* Cabecera de ruta */}
                <button
                  style={{ width: '100%', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{r.codigo_ruta}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      {r.chofer} · {r.ruta_tiendas.length} tienda{r.ruta_tiendas.length !== 1 ? 's' : ''} · {totalP}P {totalB}B
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#fff', background: estadoCol }}>
                      {estadoLbl}
                    </span>
                    <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                    {/* QR Maestro */}
                    {qrUrl && (
                      <div style={{ padding: '14px 16px', background: 'rgba(26,37,80,0.5)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ background: '#fff', padding: 8, borderRadius: 10, flexShrink: 0 }}>
                          <QRCodeSVG value={qrUrl} size={90} level="M" />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>QR de Fiscalización</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                            Muestra este QR si te detienen.<br/>Contiene guías, tiendas y estado.
                          </div>
                          <a href={qrUrl} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-block', marginTop: 8, padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', background: '#2d3f8a', textDecoration: 'none' }}>
                            Abrir página
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Orden de entrega */}
                    <div style={{ padding: '12px 16px 4px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Orden de entrega</div>
                      {[...r.ruta_tiendas].sort((a, b) => a.orden - b.orden).map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2d3f8a', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {t.orden}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{t.store_cod}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                              {t.pallets > 0 && `${t.pallets}P `}{t.bultos > 0 && `${t.bultos}B`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Guías DTE */}
                    {r.ruta_guias.length > 0 && (
                      <div style={{ padding: '4px 16px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Guías DTE</div>
                        {r.ruta_guias.map(g => (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 13, color: '#fff', fontFamily: 'monospace' }}>#{g.folio_dte}</span>
                            {g.drive_url && (
                              <a href={`https://drive.google.com/file/d/${g.drive_url}/view`} target="_blank" rel="noreferrer"
                                style={{ padding: '4px 12px', background: '#2d3f8a', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                                Ver PDF
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && rutas.length > 0 && (
            <button onClick={() => void cargar(patente)}
              style={{ padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
              🔄 Actualizar
            </button>
          )}
        </div>
      )}

      {/* ── Tab: Recepción en Tienda ─────────────────────── */}
      {tab === 'recepcion' && (
        <RecepcionTiendaScreen />
      )}
    </div>
  );
}
