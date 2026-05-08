'use client';

import { useRouter } from 'next/navigation';
import { AppProvider } from '../context/AppContext';
import { EstadoPage } from '../features/despacho/estado/EstadoPage';

const NAV_TABS = [
  { label: 'INICIO',    path: '/',                    color: 'bg-white/12 border-white/20' },
  { label: 'SANTIAGO',  path: '/despacho/santiago',   color: 'bg-[rgba(37,99,235,0.22)] border-[rgba(37,99,235,0.50)]' },
  { label: 'REGIONES',  path: '/despacho/regiones',   color: 'bg-[rgba(211,47,47,0.22)] border-[rgba(211,47,47,0.50)]' },
  { label: 'DESPACHO',  path: '/despacho',            color: 'bg-[rgba(34,197,94,0.18)] border-[rgba(34,197,94,0.40)]' },
  { label: 'AUDITORÍA', path: '/auditoria',           color: 'bg-[rgba(124,58,237,0.22)] border-[rgba(124,58,237,0.50)]' },
];

function EstadoContent() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="flex-shrink-0 bg-navy"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>

        {/* Fila principal: logo + título */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <img
            src="/logo.png"
            className="h-7 brightness-0 invert"
            alt="KiosClub"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="font-barlow-condensed text-[16px] font-bold text-white/90 tracking-widest uppercase">
            Estado / Seguimiento
          </div>
        </div>

        {/* Fila de navegación: botones hacia otros tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {NAV_TABS.map(({ label, path, color }) => (
            <button
              key={path}
              onClick={() => router.push(path)}
              className={`flex-shrink-0 px-3 py-1.5 ${color} text-white border rounded-full font-barlow-condensed text-[13px] font-bold tracking-widest uppercase cursor-pointer transition-all active:opacity-70`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <EstadoPage />
      </div>
    </div>
  );
}

export function EstadoScreen() {
  return (
    <AppProvider>
      <EstadoContent />
    </AppProvider>
  );
}
