import { NextResponse } from 'next/server';
import { VERSION_DESCONOCIDA } from '@/lib/versionApp';

// Qué versión está publicada AHORA. La pestaña compara esto con el commit con el que se compiló
// su propio código (NEXT_PUBLIC_APP_VERSION) para saber si quedó vieja (ver lib/versionApp.ts).
// Sin caché: una respuesta cacheada diría "la misma" para siempre, que es justo lo que se evita.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA ?? VERSION_DESCONOCIDA },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
