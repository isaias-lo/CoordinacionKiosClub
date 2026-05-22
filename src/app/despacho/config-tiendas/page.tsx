'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ProfilePill } from '@/components/ProfilePill';
import TiendasAdminContent from '@/features/control-interno/TiendasAdminContent';

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
    </div>
  );
}
