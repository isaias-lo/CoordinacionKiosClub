'use client';

import { useAuth } from '@/components/AuthProvider';
import TiendasAdminContent from '@/features/control-interno/TiendasAdminContent';

export default function TiendasAdminPage() {
  const { profile } = useAuth();
  const paths = profile?.allowedPaths ?? [];
  const hasAccess = paths.includes('*') || paths.includes('/admin/tiendas');

  if (profile && !hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[14px] text-red-500">Acceso restringido</p>
      </div>
    );
  }

  return <TiendasAdminContent source="armado" />;
}
