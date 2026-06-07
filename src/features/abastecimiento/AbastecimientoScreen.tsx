'use client';

import React, { useState } from 'react';
import { Layers, Candy } from 'lucide-react';
import { PickingScreen } from '@/features/picking/PickingScreen';

type AbastTab = 'picking' | 'chocolates';

const TABS: { id: AbastTab; label: string; Icon: React.ElementType; color: string; bg: string; border: string }[] = [
  { id: 'picking',    label: 'Picking',    Icon: Layers, color: '#D97706', bg: 'rgba(234,179,8,0.14)',   border: 'rgba(234,179,8,0.50)'   },
  { id: 'chocolates', label: 'Chocolates', Icon: Candy,  color: '#92400E', bg: 'rgba(146,64,14,0.14)',   border: 'rgba(146,64,14,0.50)'   },
];

export function AbastecimientoScreen() {
  const [activeTab, setActiveTab] = useState<AbastTab>('picking');

  return (
    <div className="flex flex-col h-full w-full bg-slate-950">
      {/* Sub-tab bar */}
      <div className="flex gap-2 px-4 pt-3 pb-0 shrink-0">
        {TABS.map(t => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-bold tracking-wider uppercase transition-all border-b-2"
              style={{
                background: active ? t.bg : 'rgba(255,255,255,0.04)',
                borderColor: active ? t.color : 'transparent',
                color: active ? t.color : 'rgba(255,255,255,0.35)',
                borderTop: `1px solid ${active ? t.border : 'rgba(255,255,255,0.06)'}`,
                borderLeft: `1px solid ${active ? t.border : 'rgba(255,255,255,0.06)'}`,
                borderRight: `1px solid ${active ? t.border : 'rgba(255,255,255,0.06)'}`,
              }}>
              <t.Icon size={15} strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10 shrink-0" />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'picking' && <PickingScreen mode="picking" />}
        {activeTab === 'chocolates' && <PickingScreen mode="chocolates" />}
      </div>
    </div>
  );
}
