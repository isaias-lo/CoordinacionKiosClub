import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const store = new Map<string, number[]>();

export interface RateLimitOpts {
  windowMs?: number; // default 10 min
  max?: number;      // default 10 req
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function checkRateLimit(key: string, opts: RateLimitOpts = {}): boolean {
  const { windowMs = 600_000, max = 10 } = opts;
  const now  = Date.now();
  const hits = (store.get(key) ?? []).filter(t => now - t < windowMs);
  if (hits.length >= max) return false;
  store.set(key, [...hits, now]);
  return true;
}

export function tooManyRequests() {
  return NextResponse.json(
    { error: 'Demasiadas solicitudes. Intenta más tarde.' },
    { status: 429 }
  );
}
