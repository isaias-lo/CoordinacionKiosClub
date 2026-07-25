'use client';

import { useAuth }            from '@/components/AuthProvider';
import TiendasAdminContent    from '@/features/control-interno/TiendasAdminContent';

export default function DespachoConfigTiendasPage() {
  const { can } = useAuth();

  return (
    <div style={{
      position: 'fixed', inset: 0, overflowY: 'auto',
      background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)',
      padding: '20px 16px 40px',
    }}>
      <TiendasAdminContent
        canEditTiendas={can('config-tiendas/tiendas', 'edit')}
        canEditCalendario={can('config-tiendas/calendario', 'edit')}
        source="despacho"
      />
    </div>
  );
}
