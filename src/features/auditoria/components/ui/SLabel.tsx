'use client';

import React from 'react';

export function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-barlow-condensed text-[12px] font-bold uppercase tracking-[0.14em] text-text-3 mb-2 mt-5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">
      {children}
    </div>
  );
}
