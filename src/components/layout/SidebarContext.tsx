'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SidebarContextValue {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  toggleCollapsed: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  isCollapsed: false,
  isMobileOpen: false,
  toggleCollapsed: () => {},
  openMobile: () => {},
  closeMobile: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('sidebar_collapsed');
    if (stored === '1') setIsCollapsed(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }, []);

  const openMobile  = useCallback(() => setIsMobileOpen(true),  []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  // Update CSS variable so fixed-positioned pages can account for sidebar width
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty('--sidebar-w', isCollapsed ? '64px' : '220px');
  }, [isCollapsed, mounted]);

  return (
    <SidebarContext.Provider value={{ isCollapsed, isMobileOpen, toggleCollapsed, openMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}
