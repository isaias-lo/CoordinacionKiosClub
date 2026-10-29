import type { ReactNode } from 'react';
import ConfirmarHost from '@/features/despacho/shared/ConfirmarHost';

export default function DespachoLayout({ children }: { children: ReactNode }) {
  return <>{children}<ConfirmarHost /></>;
}
