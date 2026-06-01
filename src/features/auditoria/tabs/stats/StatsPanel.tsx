'use client';

import { useState } from 'react';
import { LayoutDashboard, Trophy, History, BarChart3 } from 'lucide-react';
import { DashboardContent } from '../dashboard/DashboardContent';
import { RankingContent } from '../dashboard/RankingContent';
import { TendenciasContent } from '../dashboard/TendenciasContent';
import { HistoryContent } from '../history/HistoryContent';
import { exportarPDF } from '../../utils/pdfExport';
import type { AuditEntry, OdooConfig } from '../../types';

export function StatsPanel({ history, today, onReaudit, odooConfig, onlyHistory = false, pickerNames, onRefresh }: {
  history: AuditEntry[]; today: string;
  onReaudit: (e: AuditEntry) => void; odooConfig: OdooConfig;
  onlyHistory?: boolean; pickerNames: Record<string, string>; onRefresh?: () => void;
}) {
  const [tab, setTab] = useState<'dashboard' | 'ranking' | 'history' | 'tendencias'>(onlyHistory ? 'history' : 'dashboard');
  return (
    <div className="flex flex-col h-full bg-bg">
      {!onlyHistory && (
        <div className="flex border-b border-border bg-white flex-shrink-0 overflow-x-auto">
          {([
            { key: 'dashboard'  as const, label: 'Dashboard',  Icon: LayoutDashboard },
            { key: 'ranking'    as const, label: 'Ranking',    Icon: Trophy },
            { key: 'tendencias' as const, label: 'Tendencias', Icon: BarChart3 },
            { key: 'history'    as const, label: 'Historial',  Icon: History },
          ]).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-3 text-[12px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${tab === key ? 'border-navy text-navy bg-[rgba(26,37,80,0.02)]' : 'border-transparent text-text-3 bg-white'}`}>
              <Icon size={12} strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>
      )}
      {onlyHistory && (
        <div className="px-4 py-2.5 bg-white border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: 'linear-gradient(145deg, rgba(26,37,80,0.12), rgba(26,37,80,0.06))', border: '1px solid rgba(26,37,80,0.10)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
              <History size={14} color="#1a2550" strokeWidth={2} />
            </div>
            <span className="font-barlow-condensed text-[15px] font-bold text-navy">Tu historial</span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!onlyHistory && tab === 'dashboard'  && <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={pickerNames} /></div>}
        {!onlyHistory && tab === 'ranking'    && <RankingContent history={history} odooConfig={odooConfig} pickerNames={pickerNames} />}
        {!onlyHistory && tab === 'tendencias' && <div className="flex-1 overflow-y-auto flex flex-col"><TendenciasContent history={history} pickerNames={pickerNames} /></div>}
        {(onlyHistory || tab === 'history')   && <HistoryContent history={history} today={today} onReaudit={onReaudit} onExportPDF={exportarPDF} onRefresh={onRefresh} pickerNames={pickerNames} />}
      </div>
    </div>
  );
}
