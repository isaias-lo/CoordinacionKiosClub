'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ProfilePill } from '@/components/ProfilePill';

interface EntregaRow {
  id: string;
  cod: string;
  tienda: string;
  tipo: string;
  n_pallet_bulto: string;
  seguimiento: string;
  fecha: string;
  conductor?: string;
  fuente?: string;
}

interface RecepcionRow {
  cod: string;
  pallets_sent: number;
  bultos_sent: number;
  contenedores_sent: number;
  pallets_recibidos: number;
  bultos_recibidos: number;
  contenedores_recibidos: number;
  conductor: string;
  receptor: string;
  observaciones: string;
  created_at: string;
  fuente: string;
}

interface Pendiente {
  despacho: EntregaRow;
  recepcion: RecepcionRow | null;
}

type ConfirmState = { palletsRec: string; bultosRec: string; contenedoresRec: string; saving: boolean; error: string };

export function ValidacionTiendaScreen() {
  const router      = useRouter();
  const { profile } = useAuth();

  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [confirming, setConfirming] = useState<Record<string, ConfirmState>>({});
  const [done,       setDone]       = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [rmRes, regRes, recRes] = await Promise.all([
        fetch('/api/despacho-records?table=despacho_rm'),
        fetch('/api/despacho-records?table=despacho_regiones'),
        fetch('/api/despacho-records?table=recepcion'),
      ]);
      const [rmData, regData, recData] = await Promise.all([
        rmRes.json()  as Promise<{ data?: EntregaRow[] }>,
        regRes.json() as Promise<{ data?: EntregaRow[] }>,
        recRes.json() as Promise<{ data?: RecepcionRow[] }>,
      ]);

      const despachos = [
        ...(rmData.data  ?? []),
        ...(regData.data ?? []),
      ].filter(r => r.seguimiento === 'Entregado');

      const recepciones = recData.data ?? [];

      // For each despacho, find the most recent matching recepcion
      const result: Pendiente[] = despachos.map(d => {
        const matches = recepciones
          .filter(r => r.cod === d.cod)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return { despacho: d, recepcion: matches[0] ?? null };
      });

      // Deduplicate by cod (keep first occurrence — most recent despacho)
      const seen = new Set<string>();
      const unique = result.filter(p => {
        if (seen.has(p.despacho.cod)) return false;
        seen.add(p.despacho.cod);
        return true;
      });

      setPendientes(unique);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function initConfirm(cod: string, rec: RecepcionRow | null) {
    setConfirming(prev => ({
      ...prev,
      [cod]: {
        palletsRec:      String(rec?.pallets_recibidos      ?? rec?.pallets_sent      ?? 0),
        bultosRec:       String(rec?.bultos_recibidos       ?? rec?.bultos_sent       ?? 0),
        contenedoresRec: String(rec?.contenedores_recibidos ?? rec?.contenedores_sent ?? 0),
        saving: false,
        error:  '',
      },
    }));
  }

  function cancelConfirm(cod: string) {
    setConfirming(prev => { const n = { ...prev }; delete n[cod]; return n; });
  }

  async function handleConfirm(p: Pendiente) {
    const c = confirming[p.despacho.cod];
    if (!c) return;
    const palletsRec      = parseInt(c.palletsRec)      || 0;
    const bultosRec       = parseInt(c.bultosRec)       || 0;
    const contenedoresRec = parseInt(c.contenedoresRec) || 0;
    const palletsSent      = p.recepcion?.pallets_sent      ?? 0;
    const bultosSent       = p.recepcion?.bultos_sent       ?? 0;
    const contenedoresSent = p.recepcion?.contenedores_sent ?? 0;
    const nuevoEstado = palletsRec === palletsSent && bultosRec === bultosSent && contenedoresRec === contenedoresSent
      ? 'Recibido'
      : 'Diferencia';

    setConfirming(prev => ({ ...prev, [p.despacho.cod]: { ...c, saving: true, error: '' } }));
    try {
      const res = await fetch('/api/seguimiento', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod: p.despacho.cod, estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setDone(prev => [...prev, p.despacho.cod]);
      setConfirming(prev => { const n = { ...prev }; delete n[p.despacho.cod]; return n; });
      setPendientes(prev => prev.filter(x => x.despacho.cod !== p.despacho.cod));
    } catch (e) {
      setConfirming(prev => ({ ...prev, [p.despacho.cod]: { ...c, saving: false, error: e instanceof Error ? e.message : 'Error' } }));
    }
  }

  const filtered = pendientes.filter(p =>
    !search || [p.despacho.cod, p.despacho.tienda]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const hdrBtn: React.CSSProperties = {
    width: 36, height: 36, flexShrink: 0,
    background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
    border: '1px solid rgba(255,255,255,0.15)',
    boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
    borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFF', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ background: '#6366F1', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', flexShrink: 0 }}>
        <button onClick={() => router.push('/control-interno')} style={hdrBtn}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '0.02em' }}>Validación Tienda</div>
          {profile && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 }}>{profile.full_name ?? profile.id}</div>}
        </div>
        <ProfilePill />
      </div>

      {/* Search + refresh */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', background: '#fff', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por código o tienda…"
          style={{ flex: 1, border: '2px solid #E5E7EB', borderRadius: 12, padding: '9px 14px', fontSize: 14, outline: 'none', color: '#1F2937' }}
        />
        <button onClick={load} style={{ background: 'none', border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#6B7280', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
          ↺
        </button>
      </div>

      {/* Counter */}
      {!loading && (
        <div style={{ padding: '10px 16px', flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.12)', color: '#6366F1', borderRadius: 99, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366F1' }} />
            {filtered.length} entrega{filtered.length !== 1 ? 's' : ''} pendiente{filtered.length !== 1 ? 's' : ''} de validar
          </span>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {loading && <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 40, fontSize: 14 }}>Cargando…</div>}
        {error   && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C' }}>⚠️ {error}</div>}

        {!loading && filtered.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1F2937', margin: '0 0 6px' }}>Todo validado</p>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>No hay entregas pendientes de confirmación</p>
          </div>
        )}

        {done.length > 0 && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#166534', fontWeight: 600 }}>
            ✅ {done.length} entrega{done.length !== 1 ? 's' : ''} validada{done.length !== 1 ? 's' : ''} en esta sesión
          </div>
        )}

        {filtered.map(p => {
          const { despacho: d, recepcion: r } = p;
          const conf = confirming[d.cod];
          const isOpen = !!conf;

          return (
            <div key={d.id} style={{ background: '#fff', borderRadius: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.07)', overflow: 'hidden', border: isOpen ? '2px solid #6366F1' : '2px solid transparent' }}>

              {/* Card header */}
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#1B2A6B', fontFamily: 'monospace' }}>{d.cod}</span>
                    <span style={{ background: 'rgba(99,102,241,0.12)', color: '#6366F1', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>ENTREGADO</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', marginBottom: 2 }}>{d.tienda}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>
                    {d.fecha}
                    {r?.conductor ? ` · Conductor: ${r.conductor}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, marginBottom: 2 }}>ENVIADO</div>
                  {(r?.pallets_sent      ?? 0) > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#1B2A6B' }}>{r?.pallets_sent} pallets</div>}
                  {(r?.bultos_sent       ?? 0) > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706' }}>{r?.bultos_sent} bultos</div>}
                  {(r?.contenedores_sent ?? 0) > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#6B21A8' }}>{r?.contenedores_sent} contenedores</div>}
                  {!r && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{d.n_pallet_bulto}</div>}
                </div>
              </div>

              {/* Conductor reported quantities */}
              {r && (
                <div style={{ margin: '0 16px 12px', background: '#F8FAFF', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Conductor reportó recibido</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {r.pallets_sent > 0 && (
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 800, color: r.pallets_recibidos === r.pallets_sent ? '#10B981' : '#EF4444' }}>{r.pallets_recibidos}</span>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}> / {r.pallets_sent} pallets</span>
                      </div>
                    )}
                    {r.bultos_sent > 0 && (
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 800, color: r.bultos_recibidos === r.bultos_sent ? '#10B981' : '#EF4444' }}>{r.bultos_recibidos}</span>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}> / {r.bultos_sent} bultos</span>
                      </div>
                    )}
                    {(r.contenedores_sent ?? 0) > 0 && (
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 800, color: (r.contenedores_recibidos ?? 0) === r.contenedores_sent ? '#10B981' : '#EF4444' }}>{r.contenedores_recibidos ?? 0}</span>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}> / {r.contenedores_sent} contenedores</span>
                      </div>
                    )}
                  </div>
                  {r.observaciones && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280', fontStyle: 'italic' }}>"{r.observaciones}"</div>
                  )}
                </div>
              )}

              {/* Confirm panel */}
              {isOpen ? (
                <div style={{ borderTop: '1px solid #E5E7EB', padding: '14px 16px', background: '#FAFBFF' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6366F1', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Confirmar cantidades reales recibidas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: (p.recepcion?.contenedores_sent ?? 0) > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Pallets recibidos</label>
                      <input
                        type="number" min="0" inputMode="numeric"
                        value={conf.palletsRec}
                        onChange={e => setConfirming(prev => ({ ...prev, [d.cod]: { ...prev[d.cod], palletsRec: e.target.value } }))}
                        style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 10, padding: '10px 0', fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none', color: '#1F2937', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Bultos recibidos</label>
                      <input
                        type="number" min="0" inputMode="numeric"
                        value={conf.bultosRec}
                        onChange={e => setConfirming(prev => ({ ...prev, [d.cod]: { ...prev[d.cod], bultosRec: e.target.value } }))}
                        style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 10, padding: '10px 0', fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none', color: '#1F2937', boxSizing: 'border-box' }}
                      />
                    </div>
                    {(p.recepcion?.contenedores_sent ?? 0) > 0 && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Contenedores recibidos</label>
                        <input
                          type="number" min="0" inputMode="numeric"
                          value={conf.contenedoresRec}
                          onChange={e => setConfirming(prev => ({ ...prev, [d.cod]: { ...prev[d.cod], contenedoresRec: e.target.value } }))}
                          style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 10, padding: '10px 0', fontSize: 22, fontWeight: 800, textAlign: 'center', outline: 'none', color: '#6B21A8', boxSizing: 'border-box' }}
                        />
                      </div>
                    )}
                  </div>
                  {conf.error && <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 8 }}>⚠️ {conf.error}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => cancelConfirm(d.cod)} style={{ flex: 1, padding: '12px 0', background: 'none', border: '1.5px solid #E5E7EB', borderRadius: 12, fontSize: 14, color: '#6B7280', cursor: 'pointer', fontWeight: 600 }}>
                      Cancelar
                    </button>
                    <button onClick={() => handleConfirm(p)} disabled={conf.saving}
                      style={{ flex: 2, padding: '12px 0', background: conf.saving ? '#E5E7EB' : '#6366F1', color: conf.saving ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: conf.saving ? 'not-allowed' : 'pointer' }}>
                      {conf.saving ? 'Guardando…' : 'Confirmar →'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '0 16px 14px' }}>
                  <button onClick={() => initConfirm(d.cod, r)}
                    style={{ width: '100%', padding: '13px 0', background: '#6366F1', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
                    Validar recepción →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
