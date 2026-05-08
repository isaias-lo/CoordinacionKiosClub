export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { RecepcionClient } from './RecepcionClient';

export default function RecepcionPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      }>
      <RecepcionClient />
    </Suspense>
  );
}
