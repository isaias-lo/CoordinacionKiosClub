'use client';

// [E8] Pestaña "Transportistas" de Config. Tiendas — la capa 3 del Enrutador: qué empresa cubre
// cada zona y si se rutea o se consolida. Cuatro filas (zona fija). Guarda con PATCH por fila; si el
// servidor responde 409, muestra su mensaje (tabla o fila inexistente). No calcula nada del motor.

import { useEffect, useMemo, useState } from 'react';
import { Truck, Save, Loader2, Check, AlertTriangle } from 'lucide-react';
import { ZONAS_DEFAULT, type ConfigZonas, type ConfigZona, type ModoZona } from '@/features/despacho/rutas/utils/zonasTransporte';

const ZONA_LABEL: Record<string, string> = { santiago: 'Santiago', costa: 'Costa', sur: 'Sur', norte: 'Norte' };
const MODOS: { id: ModoZona; label: string }[] = [
  { id: 'ruta',          label: 'Ruta' },
  { id: 'consolidacion', label: 'Consolidación' },
];

type Estado = 'idle' | 'saving' | 'ok' | 'error';

export default function TransportistasTab({ canEdit }: { canEdit: boolean }) {
  const [cfg, setCfg]         = useState<ConfigZonas | null>(null);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado]   = useState<Record<string, Estado>>({});
  const [msg, setMsg]         = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch('/api/zonas-transporte?refresh=1').then(r => r.json()).catch(() => ({ data: ZONAS_DEFAULT })),
      fetch('/api/flota').then(r => r.json()).catch(() => ({ flota: [] })),
    ]).then(([zRes, fRes]) => {
      if (!alive) return;
      setCfg((zRes?.data ?? ZONAS_DEFAULT) as ConfigZonas);
      const deFlota = ((fRes?.flota ?? []) as { empresa?: string }[]).map(v => (v.empresa ?? '').trim()).filter(Boolean);
      setEmpresas([...new Set(deFlota)].sort((a, b) => a.localeCompare(b)));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Empresas a ofrecer por fila: las de flota + las ya configuradas (para no perder una que no
  // tenga vehículo activo hoy, como Ortiz durante el traspaso).
  const empresasPorFila = useMemo(() => {
    if (!cfg) return empresas;
    const configuradas = Object.values(cfg).flatMap(z => z.empresas);
    return [...new Set([...empresas, ...configuradas])].sort((a, b) => a.localeCompare(b));
  }, [cfg, empresas]);

  const filas = useMemo(
    () => (cfg ? Object.values(cfg).sort((a, b) => a.orden - b.orden) : []),
    [cfg],
  );

  function editar(zona: string, patch: Partial<ConfigZona>) {
    setCfg(prev => prev ? { ...prev, [zona]: { ...prev[zona as keyof ConfigZonas], ...patch } } : prev);
    setEstado(e => ({ ...e, [zona]: 'idle' }));
  }

  function toggleEmpresa(z: ConfigZona, empresa: string) {
    const yaEsta = z.empresas.some(e => e === empresa);
    editar(z.zona, { empresas: yaEsta ? z.empresas.filter(e => e !== empresa) : [...z.empresas, empresa] });
  }

  async function guardar(z: ConfigZona) {
    setEstado(e => ({ ...e, [z.zona]: 'saving' }));
    setMsg(m => ({ ...m, [z.zona]: '' }));
    try {
      const res = await fetch('/api/zonas-transporte', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zona: z.zona, modo: z.modo, empresas: z.empresas, activo: z.activo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado(e => ({ ...e, [z.zona]: 'error' }));
        setMsg(m => ({ ...m, [z.zona]: json?.error ?? `Error ${res.status}` }));
        return;
      }
      setEstado(e => ({ ...e, [z.zona]: 'ok' }));
      setTimeout(() => setEstado(e => ({ ...e, [z.zona]: 'idle' })), 2500);
    } catch (err) {
      setEstado(e => ({ ...e, [z.zona]: 'error' }));
      setMsg(m => ({ ...m, [z.zona]: String(err) }));
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', padding: 40 }}>
      <Loader2 size={16} className="animate-spin" /> Cargando transportistas…
    </div>;
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Truck size={18} color="#2563EB" />
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Transportistas por zona</h3>
      </div>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748B', lineHeight: 1.5, maxWidth: 620 }}>
        Qué empresa puede cubrir cada zona y si se calcula una <b>ruta</b> (recorrido, orden, horarios)
        o solo se <b>consolida</b> (se entrega a un transportista que reparte). Cambiar quién lleva una
        zona es editar una fila, no un despliegue.
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {filas.map(z => {
          const st = estado[z.zona] ?? 'idle';
          return (
            <div key={z.zona} style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px',
              opacity: z.activo ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', minWidth: 90 }}>
                  {ZONA_LABEL[z.zona] ?? z.zona}
                </div>

                {/* Modo */}
                <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
                  {MODOS.map(m => (
                    <button key={m.id} disabled={!canEdit} onClick={() => editar(z.zona, { modo: m.id })}
                      style={{
                        padding: '5px 12px', fontSize: 12.5, fontWeight: z.modo === m.id ? 700 : 500,
                        border: 0, borderRadius: 6, cursor: canEdit ? 'pointer' : 'default',
                        background: z.modo === m.id ? '#fff' : 'transparent',
                        color: z.modo === m.id ? '#2563EB' : '#64748B',
                        boxShadow: z.modo === m.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Activo */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569', cursor: canEdit ? 'pointer' : 'default', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={z.activo} disabled={!canEdit}
                    onChange={e => editar(z.zona, { activo: e.target.checked })} />
                  Activa
                </label>

                {/* Guardar */}
                {canEdit && (
                  <button onClick={() => guardar(z)} disabled={st === 'saving'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12.5,
                      fontWeight: 700, border: 0, borderRadius: 8, cursor: 'pointer', color: '#fff',
                      background: st === 'ok' ? '#16A34A' : st === 'error' ? '#DC2626' : '#2563EB',
                    }}>
                    {st === 'saving' ? <Loader2 size={13} className="animate-spin" />
                      : st === 'ok' ? <Check size={13} />
                      : st === 'error' ? <AlertTriangle size={13} /> : <Save size={13} />}
                    {st === 'saving' ? 'Guardando…' : st === 'ok' ? 'Guardado' : st === 'error' ? 'Error' : 'Guardar'}
                  </button>
                )}
              </div>

              {/* Empresas habilitadas (multi-selección) */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7 }}>
                  Empresas habilitadas
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {empresasPorFila.length === 0 && <span style={{ fontSize: 12.5, color: '#94A3B8' }}>No hay empresas en la flota.</span>}
                  {empresasPorFila.map(emp => {
                    const sel = z.empresas.some(e => e === emp);
                    return (
                      <button key={emp} disabled={!canEdit} onClick={() => toggleEmpresa(z, emp)}
                        style={{
                          padding: '5px 11px', fontSize: 12.5, fontWeight: sel ? 700 : 500,
                          border: `1.5px solid ${sel ? '#2563EB' : '#E2E8F0'}`, borderRadius: 999,
                          cursor: canEdit ? 'pointer' : 'default',
                          background: sel ? '#EFF6FF' : '#fff', color: sel ? '#1D4ED8' : '#64748B',
                        }}>
                        {sel ? '✓ ' : ''}{emp}
                      </button>
                    );
                  })}
                </div>
                {z.empresas.length === 0 && (
                  <div style={{ fontSize: 11.5, color: z.modo === 'consolidacion' ? '#B45309' : '#64748B', marginTop: 7 }}>
                    {z.modo === 'consolidacion'
                      ? 'Sin empresas: nadie puede llevar esta zona (queda para asignar a mano).'
                      : 'Sin empresas: sin preferencia — el motor asigna el camión que mejor calce.'}
                  </div>
                )}
              </div>

              {msg[z.zona] && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 10px' }}>
                  {msg[z.zona]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
