// El MCP de Supabase tiene que apuntar al MISMO proyecto que usa la app.
//
// ── POR QUÉ ESTE TEST ─────────────────────────────────────────────────────────────────────────
//
// Hay DOS proyectos de Supabase, y no son copias: son mitades. El viejo
// (`aiclobncdhxjxdlvkezk`) quedó congelado el 28/09/2026 y guarda toda la historia anterior; el
// vivo (`epiwlmegimfftivqzzup`) empieza justo donde el otro termina. Medido el 07/10/2026:
//
//     picking_eventos    viejo 26.728 (17/06→28/09)   vivo  2.132 (28/09→hoy)
//     actividad_bodega   viejo  9.538 (13/07→26/09)   vivo  2.392 (29/09→hoy)
//     rutas_despacho     viejo    612 (15/09→27/09)   vivo     46 (29/09→hoy)
//
// Como las dos bases tienen datos parecidos hasta el 26/09, consultar la equivocada devuelve algo
// PLAUSIBLE en vez de un error. El 29/09 eso me llevó a afirmar que el 28 y el 29 "no existían"
// en `despacho_rm` — existían, en la otra base.
//
// El #701 corrigió `.mcp.json`. Este test impide que vuelva a desviarse: en otra máquina, al
// volver a una rama vieja, o si alguien lo edita sin darse cuenta.
//
// ── LO QUE ESTE TEST NO PUEDE ATRAPAR ─────────────────────────────────────────────────────────
//
// El MCP se carga al ARRANCAR la sesión, así que una sesión abierta antes del #701 siguió
// hablando con el proyecto viejo aunque el archivo ya estuviera bien. Ningún test de
// configuración puede ver eso. Para esa mitad está la regla de `CLAUDE.md`: antes de creerle a
// una consulta por MCP, pedirle `max(date)` de una tabla que se escriba a diario.
//
// ── POR QUÉ CORRE EN LOCAL Y NO EN CI ─────────────────────────────────────────────────────────
//
// `.env.local` está en `.gitignore`, así que en CI no existe y el test se salta solo. Está bien:
// la falla que previene es local —CI nunca usa el MCP— y es en la máquina de quien trabaja donde
// la consulta equivocada hace daño.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

/** El `--project-ref` que `.mcp.json` le pasa al servidor de Supabase. */
export function refDelMcp(mcpJson: string): string | null {
  const cfg = JSON.parse(mcpJson) as { mcpServers?: Record<string, { args?: string[] }> };
  const args = cfg.mcpServers?.supabase?.args ?? [];
  const arg = args.find(a => a.startsWith('--project-ref='));
  return arg ? arg.slice('--project-ref='.length) : null;
}

/** El proyecto que usa la app, sacado de `NEXT_PUBLIC_SUPABASE_URL`. */
export function refDelEnv(envLocal: string): string | null {
  const m = envLocal.match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*https:\/\/([a-z0-9]+)\.supabase\.co/m);
  return m ? m[1] : null;
}

describe('el MCP de Supabase apunta al proyecto que usa la app', () => {
  it('`.mcp.json` declara un `--project-ref`', () => {
    // Sin esto el servidor pediría el proyecto por otra vía y este control no serviría de nada.
    expect(refDelMcp(readFileSync(join(RAIZ, '.mcp.json'), 'utf8'))).toMatch(/^[a-z0-9]{20}$/);
  });

  it('coincide con el de `.env.local`', () => {
    const env = join(RAIZ, '.env.local');
    if (!existsSync(env)) return;   // CI: no hay `.env.local` y no hay nada que comparar
    const deLaApp = refDelEnv(readFileSync(env, 'utf8'));
    if (!deLaApp) return;           // un `.env.local` sin esa variable no es asunto de este test
    expect(refDelMcp(readFileSync(join(RAIZ, '.mcp.json'), 'utf8'))).toBe(deLaApp);
  });
});

describe('las dos lecturas, sobre texto fijo', () => {
  // Sin estos casos el test de arriba podría pasar con funciones que devuelvan siempre `null`.
  it('lee el ref del `.mcp.json`', () => {
    const json = JSON.stringify({ mcpServers: { supabase: {
      args: ['-y', '@supabase/mcp-server-supabase@latest', '--project-ref=epiwlmegimfftivqzzup'],
    } } });
    expect(refDelMcp(json)).toBe('epiwlmegimfftivqzzup');
  });

  it('sin `--project-ref`, null', () => {
    expect(refDelMcp(JSON.stringify({ mcpServers: { supabase: { args: ['-y', 'x'] } } }))).toBeNull();
    expect(refDelMcp(JSON.stringify({ mcpServers: {} }))).toBeNull();
  });

  it('lee el ref del `.env.local`, entre otras variables', () => {
    const env = [
      'GOOGLE_SPREADSHEET_ID=16UHW1',
      'NEXT_PUBLIC_SUPABASE_URL=https://epiwlmegimfftivqzzup.supabase.co',
      'NEXT_PUBLIC_APP_URL=http://localhost:3002/',
    ].join('\n');
    expect(refDelEnv(env)).toBe('epiwlmegimfftivqzzup');
  });

  it('DETECTA LA DESVIACIÓN: el caso que motivó todo esto', () => {
    const json = JSON.stringify({ mcpServers: { supabase: { args: ['--project-ref=aiclobncdhxjxdlvkezk'] } } });
    const env = 'NEXT_PUBLIC_SUPABASE_URL=https://epiwlmegimfftivqzzup.supabase.co';
    expect(refDelMcp(json)).not.toBe(refDelEnv(env));
  });

  it('sin la variable, null', () => {
    expect(refDelEnv('OTRA=1')).toBeNull();
  });
});
