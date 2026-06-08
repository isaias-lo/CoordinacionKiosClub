'use client';

import { AppSidebar } from './AppSidebar';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { ErrorBoundary } from '../ErrorBoundary';
import { PanelLeft } from 'lucide-react';

function MobileMenuButton() {
  const { openMobile } = useSidebar();
  return (
    <button
      onClick={openMobile}
      className="fixed top-3 left-3 z-50 w-9 h-9 rounded-lg lg:hidden flex items-center justify-center transition-all active:scale-95"
      style={{ background: 'rgba(17,30,56,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}
      aria-label="Abrir menú"
    >
      <PanelLeft size={16} color="white" strokeWidth={1.8} />
    </button>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <AppSidebar />
      {/*
        transform: translateZ(0) turns this element into a containing block
        for position:fixed descendants — so all full-screen pages render
        within this area instead of the full viewport.
      */}
      <main
        className="flex-1 min-w-0 overflow-hidden relative bg-kbg"
        style={{ transform: 'translateZ(0)' }}
      >
        <ErrorBoundary module="App">
          {children}
        </ErrorBoundary>
      </main>
      <MobileMenuButton />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}
