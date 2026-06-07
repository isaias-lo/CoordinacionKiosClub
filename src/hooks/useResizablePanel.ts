import { useState, useRef, useEffect } from 'react';

interface UseResizablePanelOpts {
  storageKey: string;
  defaultWidth: number;
  min?: number;
  max?: number;
  /** Breakpoint (px) above which the panel is shown. Default 1024. */
  desktopBreakpoint?: number;
}

interface UseResizablePanelReturn {
  width: number;
  isDesktop: boolean;
  /** Pass to the drag handle element. */
  handleMouseDown: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
}

/**
 * Manages a resizable panel with localStorage persistence and desktop detection.
 * Used by PickingScreen, StepForm, and TiendasPage.
 */
export function useResizablePanel({
  storageKey,
  defaultWidth,
  min = 180,
  max = 480,
  desktopBreakpoint = 1024,
}: UseResizablePanelOpts): UseResizablePanelReturn {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return defaultWidth;
    return Number(localStorage.getItem(storageKey) || defaultWidth);
  });

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.innerWidth >= desktopBreakpoint
  );

  const isResizingRef     = useRef(false);
  const dragStartXRef     = useRef(0);
  const dragStartWidthRef = useRef(0);

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= desktopBreakpoint);
    window.addEventListener('resize', checkDesktop);

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.min(max, Math.max(min, dragStartWidthRef.current + e.clientX - dragStartXRef.current));
      setWidth(next);
    };
    const onMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth(w => { localStorage.setItem(storageKey, String(w)); return w; });
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.min(max, Math.max(min, dragStartWidthRef.current + e.touches[0].clientX - dragStartXRef.current));
      setWidth(next);
    };
    const onTouchEnd = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setWidth(w => { localStorage.setItem(storageKey, String(w)); return w; });
    };

    document.addEventListener('mousemove',  onMouseMove);
    document.addEventListener('mouseup',    onMouseUp);
    document.addEventListener('touchmove',  onTouchMove, { passive: true });
    document.addEventListener('touchend',   onTouchEnd);
    return () => {
      window.removeEventListener('resize',    checkDesktop);
      document.removeEventListener('mousemove',  onMouseMove);
      document.removeEventListener('mouseup',    onMouseUp);
      document.removeEventListener('touchmove',  onTouchMove);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, [storageKey, min, max, desktopBreakpoint]);

  function startResize(clientX: number) {
    isResizingRef.current     = true;
    dragStartXRef.current     = clientX;
    dragStartWidthRef.current = width;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startResize(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startResize(e.touches[0].clientX);
  };

  return { width, isDesktop, handleMouseDown, handleTouchStart };
}
