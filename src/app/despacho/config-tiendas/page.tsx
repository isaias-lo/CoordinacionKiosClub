'use client';

import { useRouter }          from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronLeft }        from 'lucide-react';
import { ProfilePill }        from '@/components/ProfilePill';
import TiendasAdminContent    from '@/features/control-interno/TiendasAdminContent';

type Params = Record<string, string>;

const PARAM_META: { clave: string; label: string; desc: string }[] = [
  { clave: 'impresion_automatica', label: 'Impresión automática',    desc: 'Imprime original+cedible automáticamente al registrar despacho' },
  { clave: 'modo_digital',         label: 'Modo digital prioritario', desc: 'Prioriza manifiestos y QR digitales — reduce impresión de guías físicas' },
  { clave: 'manifiesto_por_ruta',  label: 'Manifiesto único por ruta', desc: 'Genera el manifiesto de ruta como documento físico principal (reemplaza guías)' },
];

function ConfigImpresion() {
  const [params,  setParams]  = useState<Params>({});
  const [saving,  setSaving]  = useState<string | null>(null);
  const [toast,   setToast]   = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/parametros-sistema')
      .then(r => r.json())
      .then((j: { data: Params }) => setParams(j.data ?? {}))
      .catch(() => {});
  }, []);

  async function toggle(clave: string) {
    const current = params[clave] === 'true';
    const next    = String(!current);
    setParams(prev => ({ ...prev, [clave]: next }));
    setSaving(clave);
    try {
      await fetch('/api/parametros-sistema', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clave, valor: next }),
      });
      setToast('✓ Guardado');
    } catch {
      setParams(prev => ({ ...prev, [clave]: String(current) }));
      setToast('Error guardando');
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.10)', marginTop: 24, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>🖨️ Configuración de Impresión</div>
        {toast && <div style={{ fontSize: 11, color: '#34C759', fontWeight: 600 }}>{toast}</div>}
      </div>
      {PARAM_META.map(({ clave, label, desc }) => {
        const active = params[clave] === 'true';
        return (
          <div key={clave} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{label}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{desc}</div>
            </div>
            <button
              onClick={() => void toggle(clave)}
              disabled={saving === clave}
              style={{
                width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: active ? '#34C759' : 'rgba(255,255,255,0.15)',
                transition: 'background .2s', flexShrink: 0, position: 'relative',
                opacity: saving === clave ? 0.5 : 1,
              }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: active ? 23 : 3,
                transition: 'left .2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>
        );
      })}
      <div style={{ padding: '10px 16px', fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
        Los cambios aplican inmediatamente a todos los usuarios del sistema
      </div>
    </div>
  );
}

export default function DespachoConfigTiendasPage() {
  const router = useRouter();

  return (
    <div style={{
      position: 'fixed', inset: 0, overflowY: 'auto',
      background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)',
      padding: '20px 16px 40px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => router.push('/despacho-hub')}
          style={{
            width: 36, height: 36, flexShrink: 0, cursor: 'pointer',
            background: 'linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '50%',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, flex: 1 }}>Config. Tiendas</div>
        <ProfilePill compact />
      </div>

      <TiendasAdminContent />
      <ConfigImpresion />
    </div>
  );
}
