'use client';

import { useState } from 'react';
import { ChevronLeft, LayoutDashboard, Trophy } from 'lucide-react';
import { ProfilePill } from '../../../../components/ProfilePill';
import { DashboardContent } from '../dashboard/DashboardContent';
import { RankingContent } from '../dashboard/RankingContent';
import type { AuditEntry, OdooConfig } from '../../types';

export function AdminAudStats({ history, today, odooConfig, onBack, pickerNames }: {
  history: AuditEntry[]; today: string; odooConfig: OdooConfig; onBack: () => void; pickerNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking'>('dashboard');
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        <button onClick={onBack}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Estadísticas</div>
        <ProfilePill />
      </div>
      <div className="flex border-b border-border bg-white flex-shrink-0">
        {([
          { key: 'dashboard' as const, label: 'Dashboard del día',  Icon: LayoutDashboard },
          { key: 'ranking'   as const, label: 'Ranking de Pickers', Icon: Trophy },
        ]).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 text-[13px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${tab === key ? 'border-navy text-navy' : 'border-transparent text-text-3'}`}>
            <Icon size={13} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'dashboard' && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={pickerNames} /></div>}
        {tab === 'ranking'   && <RankingContent history={history} odooConfig={odooConfig} pickerNames={pickerNames} />}
      </div>
    </div>
  );
}
