'use client';

import { useRouter } from 'next/navigation';
import { SantiagoProvider } from '../features/despacho/santiago/context/SantiagoContext';
import { SantiagoPage } from '../features/despacho/santiago/pages/SantiagoPage';

function SantiagoContent() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-navy gap-2 flex-shrink-0"
        style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <img
          src="/logo.png"
          className="h-7 brightness-0 invert"
          alt="KiosClub"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="font-barlow-condensed text-[13px] text-white/60 tracking-wide flex-1 text-center">
          🏙️ Bodega Santiago
        </div>
        <button
          onClick={() => router.push('/')}
          className="px-3 py-1.5 bg-white/12 text-white/85 border border-white/20 rounded-full font-barlow text-xs cursor-pointer whitespace-nowrap transition-all active:bg-white/20">
          ← Inicio
        </button>
      </div>

      <SantiagoPage />
    </div>
  );
}

export function SantiagoScreen() {
  return (
    <SantiagoProvider>
      <SantiagoContent />
    </SantiagoProvider>
  );
}
