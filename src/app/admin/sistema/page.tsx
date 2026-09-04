'use client';

import { useCallback, useEffect, useState } from 'react';
import { Power, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const C = {
  ground: '#F8FAFC', surface: '#fff', border: '#E2E8F0', borderSoft: '#F1F5F9',
  ink: '#0F172A', ink2: '#374151', muted: '#475569', muted2: '#64748B', faint: '#94A3B8',
  navy: '#1B2A6B',
};

const CLAVE = 'odoo_activo';

export default function SistemaAdminPage() {
  const { profile, loading: authLoading } = useAuth();
  const esAdmin = profile?.role === 'admin';

  const [activo, setActivo] = useState<boolean | null>(null); // null = cargando
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    fetch('/api/parametros-sistema')
      .then(r => (r.ok ? r.json() : null))
      .then((json: { data?: Record<string, string> } | null) => {
        if (!json?.data) return;
        setActivo(json.data[CLAVE] !== 'false'); // sin fila todavía ⇒ activo por defecto
      })
      .catch(() => {});
  }, []);

  useEffect(() => { if (esAdmin) cargar(); }, [esAdmin, cargar]);
  useRealtimeRefresh('config_despacho', cargar, esAdmin, 15_000, 300);

  const toggle = async () => {
    if (activo === null || guardando) return;
    const next = !activo;
    if (!next && !confirm(
      '¿Desactivar Odoo? Picking, Auditoría, Control Cruce y el semáforo de Bodega dejan de recibir datos de Odoo de inmediato — todo pasa a modo manual.'
    )) return;
    setGuardando(true);
    setError('');
    setActivo(next); // optimista
    try {
      const res = await fetch('/api/parametros-sistema', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: CLAVE, valor: String(next) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setActivo(!next); // revertir si falló
      setError('No se pudo guardar el cambio. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  if (authLoading) return <div style={{ position: 'fixed', inset: 0, background: C.ground }} />;

  if (!esAdmin) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', background: C.ground }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, marginBottom: 6 }}>Acceso restringido</div>
          <div style={{ fontSize: 13, color: C.muted2 }}>Esta pantalla es solo para administradores.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: C.ground, fontFamily: 'inherit' }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Power size={18} color="#2563EB" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>Sistema</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>Integraciones globales</div>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Conexión con Odoo</div>
              <div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>
                Afecta Picking, Auditoría, Control Cruce y el semáforo de progreso en Bodega.
              </div>
            </div>
            {activo !== null && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                background: activo ? '#F0FDF4' : '#FEF2F2',
                color: activo ? '#16A34A' : '#DC2626',
                border: `1px solid ${activo ? '#16A34A' : '#DC2626'}55`,
              }}>
                {activo ? 'Activo' : 'Desactivado'}
              </span>
            )}
          </div>

          <button
            onClick={toggle}
            disabled={activo === null || guardando}
            style={{
              width: '100%', padding: '11px 16px', borderRadius: 8, border: 'none',
              background: activo ? '#DC2626' : '#16A34A', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: activo === null || guardando ? 'default' : 'pointer',
              opacity: activo === null || guardando ? 0.6 : 1,
            }}>
            {activo === null ? 'Cargando…' : guardando ? 'Guardando…' : activo ? 'Desactivar Odoo' : 'Activar Odoo'}
          </button>

          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#DC2626', fontSize: 13 }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
            Al desactivar, ningún request sale hacia Odoo desde ningún módulo — corta de raíz, no
            solo esconde el error en pantalla. <strong style={{ color: C.muted }}>Ojo:</strong> por ahora
            Picking no puede armar ni imprimir etiquetas sin Odoo (no hay todavía un modo manual
            para crear pallets a mano ahí) — Bodega, que ya es 100% manual, no se ve afectada.
          </div>
        </div>
      </div>
    </div>
  );
}
