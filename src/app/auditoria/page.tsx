export const dynamic = 'force-dynamic';

import { AuditoriaScreen } from '../../features/auditoria/AuditoriaScreen';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AuditoriaPage() {
  return (
    <ErrorBoundary module="Auditoría">
      <AuditoriaScreen />
    </ErrorBoundary>
  );
}
