'use client';

import { useState } from 'react';
import { LayoutDashboard, Trophy, History } from 'lucide-react';
import { DashboardContent } from '../dashboard/DashboardContent';
import { RankingContent } from '../dashboard/RankingContent';
import { HistoryContent } from '../history/HistoryContent';
import { exportarPDF } from '../../utils/pdfExport';
import type { AuditEntry, OdooConfig } from '../../types';

export function AdminDesktopPanel({ history, today, odooConfig, pickerNames, onReaudit, onRefresh }: {
  history: AuditEntry[]; today: string; odooConfig: OdooConfig;
  pickerNames: Record<string, string>; onReaudit: (e: AuditEntry) => void; onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking' | 'historial'>('dashboard');
  const tabs = [
    { key: 'dashboard' as const, label: 'Dashboard', Icon: LayoutDashboard },
    { key: 'ranking'   as const, label: 'Ranking',   Icon: Trophy },
    { key: 'historial' as const, label: 'Historial', Icon: History },
  ];
  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-bg">
      <div className="flex border-b border-border bg-white flex-shrink-0">
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-[12px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${tab === key ? 'border-navy text-navy' : 'border-transparent text-text-3'}`}>
            <Icon size={12} strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'dashboard' && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={pickerNames} /></div>}
        {tab === 'ranking'   && <RankingContent history={history} odooConfig={odooConfig} pickerNames={pickerNames} />}
        {tab === 'historial' && <HistoryContent history={history} today={today} onReaudit={onReaudit} onRefresh={onRefresh} pickerNames={pickerNames} onExportPDF={exportarPDF} />}
      </div>
    </div>
  );
}
