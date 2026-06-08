'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { ProfilePill } from '@/components/ProfilePill';
import ControlCruceContent from '@/features/control-interno/ControlCruceContent';

export default function ControlCrucePage() {
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.push('/control-interno')}
          style={{
            width: 34, height: 34, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={18} color="rgba(255,255,255,0.8)" />
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
            Control Interno
          </div>
          <div className="font-barlow-condensed" style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>
            Control Cruce
          </div>
        </div>

        <ProfilePill />
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
        <ControlCruceContent />
      </div>
    </div>
  );
}
