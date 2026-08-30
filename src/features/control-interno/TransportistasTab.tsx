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

  // Empresas con vehículo ACTIVO en flota (la realidad operativa).
  const empresasFlota = useMemo(() => new Set(empresas), [empresas]);

  // Opciones a ofrecer en UNA zona: las de flota + las que ya están habilitadas EN ESA zona pero
  // no tienen vehículos (huérfanas — p. ej. Ortiz en el traspaso). Así no se pierde la config, pero
  // la huérfana se marca aparte y se puede quitar. Una huérfana NO aparece en zonas donde no está.
  function opcionesZona(z: ConfigZona): string[] {
    const huerfanasDeLaZona = z.empresas.filter(e => !empresasFlota.has(e));
    return [...new Set([...empresas, ...huerfanasDeLaZona])].sort((a, b) => a.localeCompare(b));
  }

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
                  {opcionesZona(z).length === 0 && <span style={{ fontSize: 12.5, color: '#94A3B8' }}>No hay empresas en la flota.</span>}
                  {opcionesZona(z).map(emp => {
                    const sel = z.empresas.some(e => e === emp);
                    const enFlota  = empresasFlota.has(emp);
                    const huerfana = sel && !enFlota; // habilitada pero sin vehículos activos
                    const st = huerfana
                      ? { border: '1.5px solid #F0D08A', background: '#FEF6E7', color: '#B45309' }
                      : sel
                        ? { border: '1.5px solid #2563EB', background: '#EFF6FF', color: '#1D4ED8' }
                        : { border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B' };
                    return (
                      <button key={emp} disabled={!canEdit} onClick={() => toggleEmpresa(z, emp)}
                        title={huerfana ? `${emp} no tiene vehículos activos en Flota — clic para quitarla de ${ZONA_LABEL[z.zona] ?? z.zona}` : undefined}
                        style={{
                          padding: '5px 11px', fontSize: 12.5, fontWeight: sel ? 700 : 500, borderRadius: 999,
                          cursor: canEdit ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 6, ...st,
                        }}>
                        {sel ? '✓ ' : ''}{emp}
                        {huerfana && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, padding: '1px 5px', borderRadius: 5, background: '#F0D08A', color: '#7C4A03' }}>sin vehículos</span>
                        )}
                        {huerfana && <span style={{ fontWeight: 700, opacity: 0.7 }}>✕</span>}
                      </button>
                    );
                  })}
                </div>
                {z.empresas.some(e => !empresasFlota.has(e)) && (
                  <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 7 }}>
                    {z.empresas.filter(e => !empresasFlota.has(e)).join(', ')} — habilitada(s) sin vehículos activos en Flota; quitala(s) si ya no trabaja(n) con ustedes.
                  </div>
                )}
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
