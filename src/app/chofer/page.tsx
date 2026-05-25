'use client';
import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/* ── Types ─────────────────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────────────── */
const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#FF9500', en_camino: '#007AFF', entregado: '#34C759', recibido: '#8E8E93',
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_camino: 'En Camino', entregado: 'Entregado', recibido: 'Recibido',
};

const CACHE_KEY = 'chofer_rutas_cache';
const NAME_KEY  = 'chofer_nombre';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── Page ─────────────────────────────────────────────── */
export default function ChoferPage() {
  const [nombre,   setNombre]   = useState('');
  const [input,    setInput]    = useState('');
  const [rutas,    setRutas]    = useState<RutaData[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [offline,  setOffline]  = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Restore saved name
  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) { setNombre(saved); void cargar(saved); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async (name: string) => {
    setLoading(true);
    setOffline(false);
    try {
      const fecha = todayISO();
      const res   = await fetch(`/api/rutas-despacho?fecha=${fecha}`);
      if (!res.ok) throw new Error('Error de servidor');
      const json  = await res.json() as { data: RutaData[] };
      const mine  = (json.data ?? []).filter(r =>
        r.chofer?.toLowerCase().includes(name.toLowerCase())
      );
      setRutas(mine);
      // Cache for offline
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), name, data: mine }));
    } catch {
      // Try cache
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const { name: cachedName, data } = JSON.parse(raw) as { name: string; data: RutaData[] };
          if (cachedName === name) { setRutas(data); setOffline(true); }
        }
      } catch { /* no cache */ }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleBuscar() {
    if (!input.trim()) return;
    const n = input.trim();
    setNombre(n);
    localStorage.setItem(NAME_KEY, n);
    void cargar(n);
  }

  function handleSalir() {
    setNombre('');
    setRutas([]);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(CACHE_KEY);
  }

  /* ── Login view ─────────────────────────────────────── */
  if (!nombre) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1a2550 100%)' }}>
      <div className="text-center mb-10">
        <div style={{ fontSize: 36, fontWeight: 900, color: '#C62828', letterSpacing: -1 }}>KIOS<span style={{ fontStyle: 'italic' }}>Club</span></div>
        <div className="text-white/40 text-sm mt-1 uppercase tracking-widest">Panel Chofer</div>
      </div>

      <div className="w-full max-w-xs">
        <label className="text-white/60 text-[11px] uppercase tracking-widest block mb-2">Tu nombre</label>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleBuscar()}
          placeholder="Ej: Juan Pérez"
          className="w-full h-12 px-4 rounded-xl text-white text-[15px] font-semibold mb-3 outline-none"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)' }}
          autoFocus
        />
        <button onClick={handleBuscar}
          className="w-full h-12 rounded-xl text-white text-[15px] font-bold"
          style={{ background: 'linear-gradient(135deg, #C62828, #a51f1f)' }}>
          Ver mis rutas de hoy
        </button>
      </div>

      <p className="text-white/20 text-xs mt-8 text-center max-w-xs">
        Ingresa tu nombre tal como aparece en el sistema de despacho
      </p>
    </div>
  );

  /* ── Dashboard view ─────────────────────────────────── */
  return (
    <div className="min-h-screen pb-10" style={{ background: '#0f172a' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a2550 0%, #2d3f8a 100%)', padding: '20px 18px 16px' }}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Panel Chofer</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 1 }}>{nombre}</div>
          </div>
          <button onClick={handleSalir}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            Salir
          </button>
        </div>

        {offline && (
          <div style={{ marginTop: 8, padding: '5px 10px', background: 'rgba(255,149,0,0.15)', border: '1px solid rgba(255,149,0,0.3)', borderRadius: 8, fontSize: 10, color: '#FF9500' }}>
            📴 Modo offline — mostrando datos guardados
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {loading && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div className="w-8 h-8 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Buscando rutas…</p>
          </div>
        )}

        {!loading && rutas.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 600 }}>No hay rutas asignadas hoy</p>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 4 }}>Si crees que es un error, contacta al supervisor</p>
            <button onClick={() => void cargar(nombre)}
              style={{ marginTop: 16, padding: '8px 20px', borderRadius: 20, fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
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

              {/* Ruta header — always visible */}
              <button
                style={{ width: '100%', padding: '14px 16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
                onClick={() => setExpanded(isOpen ? null : r.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{r.codigo_ruta}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.patente} · {r.ruta_tiendas.length} tiendas · {totalP}P {totalB}B</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#fff', background: estadoCol }}>
                    {estadoLbl}
                  </span>
                  <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Expandido */}
              {isOpen && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

                  {/* QR Maestro */}
                  {qrUrl && (
                    <div style={{ padding: '14px 16px', background: 'rgba(26,37,80,0.4)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <QRCodeSVG value={qrUrl} size={80} level="M" bgColor="transparent" fgColor="#fff" />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 3 }}>QR Maestro de Ruta</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                          Muestra este QR en fiscalización.<br/>Contiene guías, tiendas y estado.
                        </div>
                        <a href={qrUrl} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-block', marginTop: 6, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#fff', background: '#2d3f8a', textDecoration: 'none' }}>
                          Abrir página
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Tiendas */}
                  <div style={{ padding: '10px 16px 4px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Orden de entrega</div>
                    {[...r.ruta_tiendas].sort((a, b) => a.orden - b.orden).map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#2d3f8a', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

                  {/* Guías */}
                  {r.ruta_guias.length > 0 && (
                    <div style={{ padding: '4px 16px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Guías DTE</div>
                      {r.ruta_guias.map(g => (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, color: '#fff', fontFamily: 'monospace' }}>#{g.folio_dte}</span>
                          {g.drive_url && (
                            <a href={g.drive_url} target="_blank" rel="noreferrer"
                              style={{ padding: '4px 12px', background: '#2d3f8a', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                              Descargar
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

        {/* Refresh button */}
        {!loading && rutas.length > 0 && (
          <button onClick={() => void cargar(nombre)}
            style={{ padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            🔄 Actualizar rutas
          </button>
        )}
      </div>
    </div>
  );
}
