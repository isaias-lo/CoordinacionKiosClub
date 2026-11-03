# Planilla de Picking — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar al sistema la planilla de papel de Picking — una pestaña con dos vistas (matriz como el papel, y detalle con horas), cada una imprimible en su propio formato.

**Architecture:** Cuatro módulos puros sin red ni UI (zonas y colores, armado de filas, duración, CSV), un endpoint nuevo en la acción de Odoo que ya existe, y un tab que los une. Los datos salen del calendario que Picking ya carga (`todayStores`) y de Odoo; no se persiste nada.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest (`globals: true`, entorno `node`), Odoo JSON-RPC, Supabase.

**Spec:** `docs/superpowers/specs/2026-11-03-planilla-picking-design.md`

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/features/picking/planilla/zonaPlanilla.ts` | Las cinco zonas y su paleta. Única fuente de los colores. |
| `src/features/picking/planilla/armarPlanilla.ts` | De movimientos crudos a filas de la matriz, totales y descartados. |
| `src/features/picking/planilla/horasPlanilla.ts` | UTC de Odoo → hora de Chile, duración y su formato. |
| `src/features/picking/planilla/csvPlanilla.ts` | El texto del archivo, una función por vista. |
| `src/app/api/odoo/route.ts` | Agrega `lineTotal` y `assignedAt`; acción `planilla_dia`. |
| `src/features/picking/components/PlanillaTab.tsx` | Las dos vistas, el toggle, imprimir y bajar. |
| `src/features/picking/PickingScreen.tsx` | La pestaña nueva. |

Cada módulo puro va con su test en `src/features/picking/planilla/__tests__/`.

---

## Task 1: Zonas y paleta

**Files:**
- Create: `src/features/picking/planilla/zonaPlanilla.ts`
- Test: `src/features/picking/planilla/__tests__/zonaPlanilla.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/features/picking/planilla/__tests__/zonaPlanilla.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { zonaPlanilla, COLOR_ZONA } from '../zonaPlanilla';

describe('zonaPlanilla: la zona con la que se pinta una tienda', () => {
  it('una tienda de Regiones que además es MALL va por su RUTA, no de rosa', () => {
    // 46TRE, 36CHL y 60PBL son MALL y de Regiones: el calendario las pinta por ruta.
    expect(zonaPlanilla({ sector: 'Región', lat: -36.79, tipo: 'MALL' })).toBe('sur');
    expect(zonaPlanilla({ sector: 'Región Sur', lat: -38.75, tipo: 'MALL' })).toBe('sur');
  });

  it('un MALL de RM sí va de rosa', () => {
    // 26ALC (Las Condes), 29CFL y 59EGN.
    expect(zonaPlanilla({ sector: 'Las Condes', lat: -33.388, tipo: 'MALL' })).toBe('mall');
  });

  it('un stripcenter de RM queda en blanco', () => {
    expect(zonaPlanilla({ sector: 'Corredor Norte', lat: -33.347, tipo: 'STRIPCENTER' })).toBe('rm');
  });

  it('«Región» a secas se desempata por latitud', () => {
    expect(zonaPlanilla({ sector: 'Región', lat: -20.2, tipo: 'TIENDA' })).toBe('norte');
    expect(zonaPlanilla({ sector: 'Región', lat: -39.6, tipo: 'TIENDA' })).toBe('sur');
  });

  it('«Región Norte» manda sobre la latitud', () => {
    expect(zonaPlanilla({ sector: 'Región Norte', lat: -39.6, tipo: 'TIENDA' })).toBe('norte');
  });

  it('Costa es su propia zona', () => {
    expect(zonaPlanilla({ sector: 'Costa', lat: -33.04, tipo: 'TIENDA' })).toBe('costa');
  });

  it('sin sector no revienta: cae en rm', () => {
    expect(zonaPlanilla({ sector: null, lat: null, tipo: null })).toBe('rm');
    expect(zonaPlanilla(null)).toBe('rm');
  });

  it('la paleta tiene las cinco zonas con los colores del calendario impreso', () => {
    expect(COLOR_ZONA.norte.bg).toBe('#FEF08A');
    expect(COLOR_ZONA.sur.bg).toBe('#BAE6FD');
    expect(COLOR_ZONA.costa.bg).toBe('#99F6E4');
    expect(COLOR_ZONA.mall.bg).toBe('#FECDD3');
    expect(Object.keys(COLOR_ZONA)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/features/picking/planilla/__tests__/zonaPlanilla.test.ts`
Expected: FAIL — `Failed to resolve import "../zonaPlanilla"`

- [ ] **Step 3: Escribir la implementación**

Crear `src/features/picking/planilla/zonaPlanilla.ts`:

```ts
// La zona con la que se pinta cada tienda en la planilla, y sus colores. Módulo puro.
//
// ── POR QUÉ LOS COLORES VIVEN ACÁ ─────────────────────────────────────────────────────────────
//
// El coordinador pidió que las tiendas salgan con el color de su ruta, «algo así lo ves en el
// sistema». Ya existe esa paleta: `CalendarioColumnas.handlePrint` (línea 436) pinta con ella el
// calendario impreso. Si la planilla copiara los hexadecimales serían tres copias del mismo dato
// en el repositorio —ese archivo ya tiene dos—, y al cambiar un color una quedaría atrás.
//
// ── LA REGLA QUE NO ES OBVIA ──────────────────────────────────────────────────────────────────
//
// Una tienda de Regiones que además es MALL va pintada por su RUTA, no de rosa: el rosa es solo
// para los malls de RM. Es lo que hace el calendario —arma las columnas `fal` → norte/sur antes de
// preguntar por el tipo— y hay que respetarlo o la hoja contradice al calendario que está al lado.
// Hoy aplica a 46TRE, 36CHL y 60PBL.

import { grupoDeSector, esRegionNorte } from '@/lib/sectores';

export type ZonaPlanilla = 'norte' | 'sur' | 'costa' | 'mall' | 'rm';

export interface ColorZona { bg: string; text: string; border: string; label: string }

/** Los cinco colores, tal cual `CalendarioColumnas.handlePrint`. */
export const COLOR_ZONA: Record<ZonaPlanilla, ColorZona> = {
  norte: { bg: '#FEF08A', text: '#713F12', border: '#FDE047', label: 'Ruta Norte'  },
  sur:   { bg: '#BAE6FD', text: '#0C4A6E', border: '#7DD3FC', label: 'Ruta Sur'    },
  costa: { bg: '#99F6E4', text: '#134E4A', border: '#5EEAD4', label: 'Costa'       },
  mall:  { bg: '#FECDD3', text: '#881337', border: '#FDA4AF', label: 'Mall RM'     },
  rm:    { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1', label: 'Stripcenter' },
};

/** El orden en que se muestra la leyenda. */
export const ZONAS: ZonaPlanilla[] = ['norte', 'sur', 'costa', 'mall', 'rm'];

/** Lo mínimo de la ficha de `tiendas` que hace falta para decidir. */
export interface FichaZona {
  sector?: string | null;
  lat?: number | null;
  tipo?: string | null;
}

/**
 * La zona de una tienda. Sin sector no se adivina: cae en `rm`, que es el color neutro (blanco),
 * no un color que afirme una ruta que nadie verificó.
 */
export function zonaPlanilla(f: FichaZona | null | undefined): ZonaPlanilla {
  const grupo = grupoDeSector(f?.sector);
  if (grupo === 'costa') return 'costa';
  // Regiones ANTES del tipo: un MALL de Regiones va por su ruta.
  if (grupo === 'fal') return esRegionNorte(f?.sector, f?.lat) ? 'norte' : 'sur';
  const tipo = String(f?.tipo ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return tipo === 'mall' ? 'mall' : 'rm';
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run src/features/picking/planilla/__tests__/zonaPlanilla.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/picking/planilla/zonaPlanilla.ts src/features/picking/planilla/__tests__/zonaPlanilla.test.ts
git commit -m "Planilla: la zona con la que se pinta cada tienda

Los colores son los del calendario impreso, en un solo lugar. Una tienda
de Regiones que además es MALL va por su ruta, no de rosa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Horas y duración

**Files:**
- Create: `src/features/picking/planilla/horasPlanilla.ts`
- Test: `src/features/picking/planilla/__tests__/horasPlanilla.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/features/picking/planilla/__tests__/horasPlanilla.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { horaChile, duracionMinutos, formatearDuracion } from '../horasPlanilla';

describe('horaChile: Odoo guarda UTC', () => {
  it('corre las tres horas en horario de verano', () => {
    // 27MCH Hogar del 03/11/2026: Odoo dice 11:33:29, en Chile empezó 08:33.
    expect(horaChile('2026-11-03 11:33:29')).toBe('08:33');
  });

  it('corre las cuatro horas en horario de invierno', () => {
    // En junio Chile está en UTC-4.
    expect(horaChile('2026-06-10 13:00:00')).toBe('09:00');
  });

  it('acepta el formato con T y con Z', () => {
    expect(horaChile('2026-11-03T11:33:29Z')).toBe('08:33');
  });

  it('sin dato devuelve cadena vacía, no una hora inventada', () => {
    expect(horaChile(null)).toBe('');
    expect(horaChile('')).toBe('');
    expect(horaChile('no es una fecha')).toBe('');
  });
});

describe('duracionMinutos', () => {
  it('resta las dos horas de Odoo', () => {
    expect(duracionMinutos('2026-11-03 11:33:29', '2026-11-03 13:59:58')).toBe(146);
  });

  it('sin hora de inicio no hay duración', () => {
    expect(duracionMinutos(null, '2026-11-03 13:59:58')).toBeNull();
  });

  it('sin hora de validación no hay duración', () => {
    expect(duracionMinutos('2026-11-03 11:33:29', null)).toBeNull();
  });

  it('una validación anterior al inicio no devuelve un negativo', () => {
    expect(duracionMinutos('2026-11-03 13:00:00', '2026-11-03 11:00:00')).toBeNull();
  });
});

describe('formatearDuracion', () => {
  it('bajo una hora, en minutos', () => {
    expect(formatearDuracion(20)).toBe('20 min');
    expect(formatearDuracion(0)).toBe('0 min');
  });

  it('desde una hora, en horas y minutos con dos dígitos', () => {
    expect(formatearDuracion(146)).toBe('2 h 26');
    expect(formatearDuracion(60)).toBe('1 h 00');
    expect(formatearDuracion(65)).toBe('1 h 05');
  });

  it('sin duración, una raya', () => {
    expect(formatearDuracion(null)).toBe('—');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/features/picking/planilla/__tests__/horasPlanilla.test.ts`
Expected: FAIL — `Failed to resolve import "../horasPlanilla"`

- [ ] **Step 3: Escribir la implementación**

Crear `src/features/picking/planilla/horasPlanilla.ts`:

```ts
// Las horas de la planilla. Módulo puro: entra texto de Odoo, sale texto para la hoja.
//
// Odoo guarda las fechas en UTC y sin zona («2026-11-03 11:33:29»). Leerlas como si fueran locales
// deja la planilla tres horas adelantada: en el primer mockup 27MCH Hogar aparecía empezando 11:33
// cuando el picker la tomó a las 08:33. Se convierte con la zona `America/Santiago`, que además
// resuelve sola el cambio de horario (UTC-3 en verano, UTC-4 en invierno).
//
// `todayISO()` no sirve para esto (ver CLAUDE.md): usa UTC y rueda cerca de las 20:00 en Chile.

const ZONA_CHILE = 'America/Santiago';

/** Odoo → `Date`, o `null` si el texto no es una fecha. */
function aFecha(crudo: string | null | undefined): Date | null {
  const s = String(crudo ?? '').trim();
  if (!s) return null;
  // «2026-11-03 11:33:29» no trae zona: es UTC. Se le pone la T y la Z para que no se lea local.
  const iso = /[TZ]/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** La hora de Chile como `HH:MM`, o `''` si no hay dato. Nunca inventa una hora. */
export function horaChile(crudo: string | null | undefined): string {
  const d = aFecha(crudo);
  if (!d) return '';
  return d.toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_CHILE,
  });
}

/**
 * Minutos entre la asignación y la validación, o `null` si falta una de las dos.
 *
 * Una validación anterior al inicio también da `null`: un número negativo en una hoja que se firma
 * es peor que una celda vacía.
 */
export function duracionMinutos(
  asignadoEn: string | null | undefined,
  validadoEn: string | null | undefined,
): number | null {
  const a = aFecha(asignadoEn);
  const b = aFecha(validadoEn);
  if (!a || !b) return null;
  const min = Math.round((b.getTime() - a.getTime()) / 60000);
  return min < 0 ? null : min;
}

/** `146` → `'2 h 26'`; `20` → `'20 min'`; `null` → `'—'`. */
export function formatearDuracion(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run src/features/picking/planilla/__tests__/horasPlanilla.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/picking/planilla/horasPlanilla.ts src/features/picking/planilla/__tests__/horasPlanilla.test.ts
git commit -m "Planilla: hora de Chile y duración

Odoo guarda UTC sin zona: leerlo local dejaba la hoja tres horas
adelantada. Una validación anterior al inicio da null, no un negativo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Armado de la matriz

**Files:**
- Create: `src/features/picking/planilla/armarPlanilla.ts`
- Test: `src/features/picking/planilla/__tests__/armarPlanilla.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/features/picking/planilla/__tests__/armarPlanilla.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { armarPlanilla, type MovimientoPlanilla } from '../armarPlanilla';

const TIENDAS = [
  { cod: '38SP2', zona: 'sur'  as const },
  { cod: '56PZA', zona: 'rm'   as const },
  { cod: '75PUC', zona: 'sur'  as const },
];

function mov(p: Partial<MovimientoPlanilla>): MovimientoPlanilla {
  return {
    cod: '38SP2', seccion: 'Comida', registros: 10, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-03 11:00:00', validadoEn: null, estado: 'done', ...p,
  };
}

describe('armarPlanilla: una fila por tienda, en el orden que se le pasa', () => {
  it('devuelve una fila por tienda del día, aunque no tenga carga', () => {
    const p = armarPlanilla([mov({})], TIENDAS);
    expect(p.filas.map(f => f.cod)).toEqual(['38SP2', '56PZA', '75PUC']);
  });

  it('marca sinCarga la tienda del calendario que hoy no tiene movimientos', () => {
    // 75PUC está en el calendario del martes y no tiene carga: por eso el papel trae 28 y no 29.
    const p = armarPlanilla([mov({})], TIENDAS);
    expect(p.filas.find(f => f.cod === '75PUC')!.sinCarga).toBe(true);
    expect(p.filas.find(f => f.cod === '38SP2')!.sinCarga).toBe(false);
  });

  it('dos movimientos de la MISMA sección quedan en la misma celda', () => {
    // Así es el papel: el coordinador escribe «62 y 46» en la celda de Hogar de 38SP2.
    const p = armarPlanilla([
      mov({ seccion: 'Hogar', registros: 46, asignadoEn: '2026-11-03 14:00:00' }),
      mov({ seccion: 'Hogar', registros: 63, asignadoEn: '2026-11-03 11:00:00' }),
    ], TIENDAS);
    const hogar = p.filas.find(f => f.cod === '38SP2')!.celdas.Hogar;
    expect(hogar.map(c => c.registros)).toEqual([63, 46]);   // en orden de asignación
  });

  it('los sin asignar van al final de la celda, no primeros', () => {
    const p = armarPlanilla([
      mov({ seccion: 'Comida', registros: 9,   asignadoEn: null, picker: '' }),
      mov({ seccion: 'Comida', registros: 163, asignadoEn: '2026-11-03 10:00:00' }),
    ], TIENDAS);
    const comida = p.filas.find(f => f.cod === '38SP2')!.celdas.Comida;
    expect(comida.map(c => c.registros)).toEqual([163, 9]);
  });

  it('un movimiento anulado no entra, y se cuenta como descartado', () => {
    const p = armarPlanilla([
      mov({ estado: 'done' }),
      mov({ estado: 'cancel', registros: 15 }),
    ], TIENDAS);
    expect(p.filas.find(f => f.cod === '38SP2')!.celdas.Comida).toHaveLength(1);
    expect(p.descartados.anulados).toBe(1);
  });

  it('un movimiento sin stock liberado no entra, y se cuenta aparte', () => {
    const p = armarPlanilla([mov({ estado: 'confirmed', registros: 4 })], TIENDAS);
    expect(p.filas.find(f => f.cod === '38SP2')!.celdas.Comida).toHaveLength(0);
    expect(p.descartados.sinLiberar).toBe(1);
    expect(p.descartados.anulados).toBe(0);
  });

  it('un movimiento de una tienda que no está en el día se ignora', () => {
    const p = armarPlanilla([mov({ cod: '99XXX' })], TIENDAS);
    expect(p.filas.every(f => f.sinCarga)).toBe(true);
    expect(p.fueraDelDia).toBe(1);
  });

  it('los totales suman los registros de cada sección', () => {
    const p = armarPlanilla([
      mov({ seccion: 'Comida', registros: 100 }),
      mov({ seccion: 'Comida', registros: 20, cod: '56PZA' }),
      mov({ seccion: 'Hogar',  registros: 7 }),
      mov({ seccion: 'Comida', registros: 999, estado: 'cancel' }),
    ], TIENDAS);
    expect(p.totales.Comida).toBe(120);
    expect(p.totales.Hogar).toBe(7);
    expect(p.totales.Aseo).toBe(0);
    expect(p.totales.Chocolates).toBe(0);
  });

  it('cada fila trae la zona de su tienda', () => {
    const p = armarPlanilla([], TIENDAS);
    expect(p.filas.find(f => f.cod === '56PZA')!.zona).toBe('rm');
  });

  it('un picker vacío queda vacío: no se pone un nombre por defecto', () => {
    const p = armarPlanilla([mov({ picker: '', estado: 'assigned', asignadoEn: null })], TIENDAS);
    expect(p.filas.find(f => f.cod === '38SP2')!.celdas.Comida[0].picker).toBe('');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/features/picking/planilla/__tests__/armarPlanilla.test.ts`
Expected: FAIL — `Failed to resolve import "../armarPlanilla"`

- [ ] **Step 3: Escribir la implementación**

Crear `src/features/picking/planilla/armarPlanilla.ts`:

```ts
// De los movimientos de Odoo a las filas de la planilla. Módulo puro: sin red ni UI.
//
// ── UNA FILA POR TIENDA, Y LAS REPETIDAS EN LA MISMA CELDA ────────────────────────────────────
//
// La primera versión le daba una fila EXTRA a la tienda cuando una sección tenía dos movimientos,
// y dejaba las otras tres secciones en gris al lado. No es el papel: el coordinador escribe los dos
// números en la MISMA celda («en el SP2 hogar de Marcelo en la hoja tengo 62 y 46»). Medido el
// 03/11/2026: pasa en 7 tiendas de 29, y siempre en una sola sección por tienda.
//
// ── QUÉ CUENTA COMO TRABAJO ───────────────────────────────────────────────────────────────────
//
// Solo `assigned` y `done`. Un `cancel` es trabajo anulado y un `confirmed` todavía no tiene stock
// liberado. Mostrarlos daba líneas fantasma: 27MCH aparecía con dos movimientos de Comida cuando
// tiene uno. Medido el 03/11 sobre las tiendas del día: de 194 movimientos son trabajo 119, y
// quedan fuera 50 anulados y 25 sin liberar. Los descartados se devuelven contados, no escondidos:
// la hoja dice al pie cuántos hay.

import type { ZonaPlanilla } from './zonaPlanilla';

export type SeccionPlanilla = 'Comida' | 'Aseo' | 'Hogar' | 'Chocolates';

/** El orden de las columnas, igual que en el papel. */
export const SECCIONES: SeccionPlanilla[] = ['Comida', 'Aseo', 'Hogar', 'Chocolates'];

/** Un movimiento de Odoo con lo que la planilla necesita, ya normalizado. */
export interface MovimientoPlanilla {
  /**
   * El código CANÓNICO del catálogo, como lo devuelve `resolveStoreCode`. Acá se compara con
   * `===` contra el de la tienda: un código sin canonizar («23PEN» en vez de «23PEÑ») no calzaría
   * con ninguna y la tienda saldría «sin carga» teniéndola, sin ningún aviso.
   */
  cod: string;
  seccion: SeccionPlanilla;
  /** `move_ids.length`: el número que muestra Odoo. NO el `lineCount` filtrado por estado. */
  registros: number;
  /** El nombre ya traducido por `picker_canonical_names`; `''` si todavía no se asignó. */
  picker: string;
  asignadoEn: string | null;
  /**
   * La hora de validación. Este módulo no la usa —la matriz no muestra horas—, pero es parte de la
   * forma compartida del movimiento: la vista Detalle y el CSV consumen la MISMA lista de
   * movimientos, no las celdas, así que no hay dos listas en paralelo que mantener.
   */
  validadoEn: string | null;
  estado: string;
}

export interface CeldaPlanilla { registros: number; picker: string }

export interface FilaPlanilla {
  cod: string;
  zona: ZonaPlanilla;
  celdas: Record<SeccionPlanilla, CeldaPlanilla[]>;
  /** Está en el calendario del día y no tiene ningún movimiento real. */
  sinCarga: boolean;
}

export interface Planilla {
  filas: FilaPlanilla[];
  totales: Record<SeccionPlanilla, number>;
  /**
   * Lo que no entró a la hoja, contado. Ninguna rama descarta en silencio: `otros` junta los
   * estados que no son ninguno de los cuatro conocidos —`waiting`, por ejemplo—, porque una hoja
   * que se firma no puede perder un movimiento sin dejar rastro.
   */
  descartados: { anulados: number; sinLiberar: number; otros: number };
  /** Movimientos de tiendas que no están en el calendario del día. Se ignoran, pero se cuentan. */
  fueraDelCalendario: number;
}

/**
 * Los dos estados que son trabajo real.
 *
 * No es lo mismo que `PICKEABLE_STATES` de `picking-utils.ts`, que agrega
 * `partially_available`: esa es la lista blanca del semáforo y mira `stock.move`, mientras que
 * acá se miran `stock.picking`, donde ese estado no existe.
 */
const ESTADOS_REALES = new Set(['assigned', 'done']);

/**
 * Los asignados primero, en orden de asignación; los sin asignar al final.
 *
 * Compara las fechas como TEXTO, lo que vale solo porque son el naive UTC de Odoo
 * («YYYY-MM-DD HH:MM:SS»): ancho fijo y de mayor a menor significancia, así que el orden
 * lexicográfico y el cronológico coinciden. Con cualquier otro formato habría que parsear.
 */
function porAsignacion(a: MovimientoPlanilla, b: MovimientoPlanilla): number {
  if (!a.asignadoEn && !b.asignadoEn) return 0;
  if (!a.asignadoEn) return 1;
  if (!b.asignadoEn) return -1;
  return a.asignadoEn < b.asignadoEn ? -1 : a.asignadoEn > b.asignadoEn ? 1 : 0;
}

function celdasVacias(): Record<SeccionPlanilla, CeldaPlanilla[]> {
  return { Comida: [], Aseo: [], Hogar: [], Chocolates: [] };
}

/**
 * Las filas de la planilla, una por tienda del día y en ese mismo orden.
 *
 * `tiendas` viene ya ordenada como el calendario (Regiones, Costa, RM) y con su zona resuelta.
 */
export function armarPlanilla(
  movimientos: MovimientoPlanilla[],
  tiendas: Array<{ cod: string; zona: ZonaPlanilla }>,
): Planilla {
  // Una tienda repetida en la entrada daría DOS filas con la misma carga y, peor, sumaría su carga
  // dos veces en los totales: la hoja firmada mostraría el doble. `todayStores` deduplica los
  // adelantos contra el calendario, pero el calendario mismo no lo garantiza, así que se hace acá.
  const unicas: Array<{ cod: string; zona: ZonaPlanilla }> = [];
  const vistas = new Set<string>();
  for (const t of tiendas) {
    if (vistas.has(t.cod)) continue;
    vistas.add(t.cod);
    unicas.push(t);
  }

  const porCod = new Map<string, MovimientoPlanilla[]>();
  for (const t of unicas) porCod.set(t.cod, []);

  const descartados = { anulados: 0, sinLiberar: 0, otros: 0 };
  let fueraDelCalendario = 0;

  for (const m of movimientos) {
    if (m.estado === 'cancel')    { descartados.anulados++;   continue; }
    if (m.estado === 'confirmed') { descartados.sinLiberar++; continue; }
    // Cualquier otro estado —`waiting`, `draft`— también se cuenta: ninguna rama descarta callada.
    if (!ESTADOS_REALES.has(m.estado)) { descartados.otros++; continue; }
    const lista = porCod.get(m.cod);
    if (!lista) { fueraDelCalendario++; continue; }
    lista.push(m);
  }

  const filas: FilaPlanilla[] = unicas.map(t => {
    const suyos = porCod.get(t.cod) ?? [];
    const celdas = celdasVacias();
    for (const s of SECCIONES) {
      celdas[s] = suyos
        .filter(m => m.seccion === s)
        .sort(porAsignacion)
        .map(m => ({ registros: m.registros, picker: m.picker }));
    }
    return { cod: t.cod, zona: t.zona, celdas, sinCarga: suyos.length === 0 };
  });

  // Los totales salen DE LAS FILAS, no de un acumulador dentro del `map`: así el total no puede
  // divergir de lo que la hoja muestra.
  const totales: Record<SeccionPlanilla, number> = { Comida: 0, Aseo: 0, Hogar: 0, Chocolates: 0 };
  for (const fila of filas) {
    for (const s of SECCIONES) {
      for (const c of fila.celdas[s]) totales[s] += c.registros;
    }
  }

  return { filas, totales, descartados, fueraDelCalendario };
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run src/features/picking/planilla/__tests__/armarPlanilla.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/picking/planilla/armarPlanilla.ts src/features/picking/planilla/__tests__/armarPlanilla.test.ts
git commit -m "Planilla: armar la matriz, una fila por tienda

Dos movimientos de la misma sección van en la misma celda, como en el
papel. Los anulados y los sin stock liberado no entran y se cuentan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: El archivo que se baja

**Files:**
- Create: `src/features/picking/planilla/csvPlanilla.ts`
- Test: `src/features/picking/planilla/__tests__/csvPlanilla.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/features/picking/planilla/__tests__/csvPlanilla.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { csvVistaPlanilla, csvVistaDetalle } from '../csvPlanilla';
import { armarPlanilla, type MovimientoPlanilla } from '../armarPlanilla';

const TIENDAS = [{ cod: '38SP2', zona: 'sur' as const }, { cod: '75PUC', zona: 'sur' as const }];

const MOVS: MovimientoPlanilla[] = [
  { cod: '38SP2', seccion: 'Hogar', registros: 63, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-03 11:00:00', validadoEn: '2026-11-03 13:26:00', estado: 'done' },
  { cod: '38SP2', seccion: 'Hogar', registros: 46, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-03 14:00:00', validadoEn: null, estado: 'assigned' },
  { cod: '38SP2', seccion: 'Comida', registros: 119, picker: 'Ignacio Poblete',
    asignadoEn: '2026-11-03 11:30:00', validadoEn: '2026-11-03 14:00:00', estado: 'done' },
];

describe('csvVistaPlanilla', () => {
  const csv = csvVistaPlanilla(armarPlanilla(MOVS, TIENDAS), '2026-11-03');
  const lineas = csv.split('\n');

  it('la primera línea son los encabezados', () => {
    expect(lineas[0]).toBe('Fecha,#,Tienda,Zona,Comida,Usuario Comida,Aseo,Usuario Aseo,Hogar,Usuario Hogar,Chocolates,Usuario Chocolates');
  });

  it('una celda con dos movimientos NO rompe las columnas: van entre comillas y separados por " / "', () => {
    expect(lineas[1]).toContain('"63 / 46"');
    expect(lineas[1]).toContain('"Marcelo Vergara / Marcelo Vergara"');
    // 12 encabezados ⇒ 11 comas fuera de las comillas.
    expect(lineas[1].replace(/"[^"]*"/g, 'X').split(',')).toHaveLength(12);
  });

  it('la tienda sin carga sale con sus celdas vacías', () => {
    expect(lineas[2]).toBe('2026-11-03,2,75PUC,Ruta Sur,,,,,,,,');
  });

  it('la última línea son los totales', () => {
    expect(lineas[lineas.length - 1]).toBe('2026-11-03,,TOTAL,,119,,0,,109,,0,');
  });
});

describe('csvVistaDetalle', () => {
  const csv = csvVistaDetalle(MOVS, '2026-11-03');
  const lineas = csv.split('\n');

  it('la primera línea son los encabezados', () => {
    expect(lineas[0]).toBe('Fecha,Tienda,Seccion,Usuario,Registros,Inicio,Validado,Duracion,Estado');
  });

  it('una fila por movimiento, ordenada por hora de inicio', () => {
    expect(lineas).toHaveLength(4);   // encabezado + 3
    expect(lineas[1]).toBe('2026-11-03,38SP2,Hogar,Marcelo Vergara,63,08:00,10:26,2 h 26,done');
  });

  it('un movimiento sin validar deja la duración en raya y la hora vacía', () => {
    expect(lineas[3]).toBe('2026-11-03,38SP2,Hogar,Marcelo Vergara,46,11:00,,—,assigned');
  });

  it('un nombre con coma iría entre comillas', () => {
    const uno = csvVistaDetalle(
      [{ ...MOVS[0], picker: 'Vergara, Marcelo' }], '2026-11-03').split('\n')[1];
    expect(uno).toContain('"Vergara, Marcelo"');
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/features/picking/planilla/__tests__/csvPlanilla.test.ts`
Expected: FAIL — `Failed to resolve import "../csvPlanilla"`

- [ ] **Step 3: Escribir la implementación**

Crear `src/features/picking/planilla/csvPlanilla.ts`:

```ts
// El archivo que se baja, una función por vista. Módulo puro.
//
// La celda de una sección puede llevar DOS movimientos (los dos Hogar de 38SP2). En el CSV van en
// una sola celda, separados por « / » y entre comillas: una coma suelta ahí correría todas las
// columnas que siguen y el archivo se abriría torcido en la planilla de cálculo.

import { SECCIONES, type Planilla, type MovimientoPlanilla } from './armarPlanilla';
import { COLOR_ZONA } from './zonaPlanilla';
import { horaChile, duracionMinutos, formatearDuracion } from './horasPlanilla';

/** Entre comillas solo si hace falta, y las comillas de adentro se duplican (RFC 4180). */
function campo(v: string | number): string {
  const s = String(v);
  if (!/[",\n]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

const fila = (cs: Array<string | number>): string => cs.map(campo).join(',');

/** La matriz: una línea por tienda y la de totales al final. */
export function csvVistaPlanilla(p: Planilla, fecha: string): string {
  const encabezados = ['Fecha', '#', 'Tienda', 'Zona'];
  for (const s of SECCIONES) encabezados.push(s, 'Usuario ' + s);

  const lineas = [encabezados.join(',')];

  p.filas.forEach((f, i) => {
    const cs: Array<string | number> = [fecha, i + 1, f.cod, COLOR_ZONA[f.zona].label];
    for (const s of SECCIONES) {
      const celda = f.celdas[s];
      cs.push(celda.map(c => c.registros).join(' / '));
      cs.push(celda.map(c => c.picker).join(' / '));
    }
    lineas.push(fila(cs));
  });

  const tot: Array<string | number> = [fecha, '', 'TOTAL', ''];
  for (const s of SECCIONES) tot.push(p.totales[s], '');
  lineas.push(fila(tot));

  return lineas.join('\n');
}

/** El detalle: una línea por movimiento, ordenada por hora de inicio. */
export function csvVistaDetalle(movimientos: MovimientoPlanilla[], fecha: string): string {
  const lineas = ['Fecha,Tienda,Seccion,Usuario,Registros,Inicio,Validado,Duracion,Estado'];

  const ordenados = [...movimientos].sort((a, b) => {
    if (!a.asignadoEn && !b.asignadoEn) return 0;
    if (!a.asignadoEn) return 1;
    if (!b.asignadoEn) return -1;
    return a.asignadoEn < b.asignadoEn ? -1 : a.asignadoEn > b.asignadoEn ? 1 : 0;
  });

  for (const m of ordenados) {
    lineas.push(fila([
      fecha, m.cod, m.seccion, m.picker, m.registros,
      horaChile(m.asignadoEn), horaChile(m.validadoEn),
      formatearDuracion(duracionMinutos(m.asignadoEn, m.validadoEn)),
      m.estado,
    ]));
  }

  return lineas.join('\n');
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run src/features/picking/planilla/__tests__/csvPlanilla.test.ts`
Expected: PASS — 8 tests

Si la línea de totales falla, revisar la cuenta a mano: Comida 119, Aseo 0, Hogar 63+46=109, Chocolates 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/picking/planilla/csvPlanilla.ts src/features/picking/planilla/__tests__/csvPlanilla.test.ts
git commit -m "Planilla: el CSV de las dos vistas

Una celda con dos movimientos va entre comillas y separada por ' / ':
una coma suelta correría todas las columnas siguientes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Odoo — el conteo correcto y la hora de asignación

**Files:**
- Modify: `src/app/api/odoo/route.ts:62-70` (el tipo `BatchPicking`)
- Modify: `src/app/api/odoo/route.ts:188-245` (los `fields` y el mapeador)

**Por qué:** `lineCount` (línea 241) cuenta `stock.move` **filtrando por estado**, así que cuenta solo
las líneas con stock reservado: crece durante el día y recién calza cuando el movimiento se cierra.
Medido: el 29/10, día cerrado, los dos conteos coinciden en los 157 movimientos; el 03/11, día en
curso, difieren en 53 de 149. El número de Odoo —y el que calzó con la hoja de papel— es
`move_ids.length`. **`lineCount` no se toca**: se agrega un campo al lado, porque hay otros
consumidores (línea 770).

- [ ] **Step 1: Agregar los dos campos al tipo**

En `src/app/api/odoo/route.ts`, reemplazar el tipo `BatchPicking` (líneas 62-70) por:

```ts
type BatchPicking = {
  id: number; name: string; origin: string; partner: string;
  fromLocation: string; toLocation: string; state: string;
  scheduledDate: string; dateDone: string | null; pickingType: string;
  responsible: string; responsibleId: number | null; lineCount: number; batch: string;
  /** [CRUCE PESOS] `total_weight` de Odoo — la columna «Peso Total» de Traslados internos.
   *  Viene en la MISMA consulta que ya se hacía: es un campo más, no una llamada más. */
  pesoTotal: number;
  /** [PLANILLA] Todas las líneas del movimiento: el número que muestra Odoo.
   *
   *  `lineCount` filtra por estado del `stock.move`, así que cuenta solo las líneas con stock
   *  reservado y crece durante el día. Medido el 29/10 (día cerrado) los dos coinciden en 157 de
   *  157; el 03/11 (en curso) difieren en 53 de 149. La planilla necesita el total, que es el que
   *  calzó con la hoja de papel (24SPP Comida 111, 38SP2 Comida 119, 31TLC Hogar 100). */
  lineTotal: number;
  /** [PLANILLA] `user_assigned_date`: cuándo se le dio el movimiento a un picker. UTC, como todo
   *  lo que guarda Odoo. `null` cuando todavía no se asignó a nadie. */
  assignedAt: string | null;
};
```

- [ ] **Step 2: Pedir los dos campos a Odoo**

En la llamada a `stock.picking` / `search_read` (línea 193), agregar `'move_ids'` y
`'user_assigned_date'` al arreglo `fields`:

```ts
      fields: ['name', 'origin', 'partner_id', 'location_id', 'location_dest_id',
               'state', 'scheduled_date', 'date_done', 'picking_type_id', 'user_id', 'batch_id',
               'total_weight',
               // [PLANILLA] `move_ids` son ids, no registros: no agrega una consulta. Con su
               // largo se cuenta sin filtrar por estado. `user_assigned_date` es la hora de
               // asignación, lo único que la planilla no podía sacar de ningún otro campo.
               'move_ids', 'user_assigned_date'],
```

Y en el tipo del resultado (líneas 200-207), agregar las dos propiedades:

```ts
    total_weight: number | false;
    move_ids: number[];
    user_assigned_date: string | false;
```

- [ ] **Step 3: Mapearlos**

En el `return allPickings.map(...)` (línea 228), agregar las dos líneas después de `pesoTotal`:

```ts
    pesoTotal:     typeof p.total_weight === 'number' ? p.total_weight : 0,
    lineTotal:     Array.isArray(p.move_ids) ? p.move_ids.length : 0,
    assignedAt:    typeof p.user_assigned_date === 'string' ? p.user_assigned_date : null,
```

- [ ] **Step 4: Verificar que el cambio LLEGÓ, no que compila**

Un reemplazo que no encuentra su objetivo no falla: `tsc` y el build pasan igual con el archivo
intacto (CLAUDE.md, regla 7). Comprobar el contenido:

```bash
grep -n "lineTotal\|assignedAt\|move_ids\|user_assigned_date" src/app/api/odoo/route.ts
```

Expected: 7 coincidencias — 2 en el tipo `BatchPicking`, 2 en los `fields`, 2 en el tipo del
resultado y 2 en el mapeador (8 líneas en total, algunas con dos términos).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores. Si aparece «Property 'lineTotal' is missing» en la línea ~770, es el otro
consumidor de `BatchPicking`: agregarle `lineTotal: u.lines` y `assignedAt: null` ahí, porque esa
rama arma el objeto a mano y no pasa por el mapeador.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/odoo/route.ts
git commit -m "Odoo: lineTotal y assignedAt, sin tocar lineCount

lineCount filtra stock.move por estado, así que crece durante el día: el
29/10 coincide con move_ids en 157 de 157, el 03/11 difiere en 53 de 149.
La planilla necesita el total. lineCount queda igual por sus consumidores.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: La acción `planilla_dia`, con los días de las aperturas

**Files:**
- Modify: `src/app/api/odoo/route.ts` (agregar la acción después del bloque `cruce_pesos_dia`, línea 617)

**Por qué recibe VARIOS días:** una tienda de apertura tiene sus movimientos fechados en otro día —
62PLD los tuvo el 30/10 — y por eso existen `tiendas_adelanto.dia_movimientos` y
`agruparConsultasPorDia`. Si la acción recibiera una sola fecha, una apertura saldría en la planilla
sin carga aunque la tenga. Recibe la lista de días que el día de hoy necesita, que normalmente es
uno solo.

- [ ] **Step 1: Ver el nombre real de la función que trae un día**

El bloque de `cruce_pesos_dia` ya trae los pickings de una fecha. Hay que usar **esa misma**
función, no escribir otra:

```bash
sed -n '617,633p' src/app/api/odoo/route.ts
```

Anotar el nombre que aparece ahí (en los pasos de abajo se la llama `traerPickingsDelDia`) y usarlo
tal cual. Duplicar el fetch sería un segundo lugar donde arreglar el dominio de Odoo.

- [ ] **Step 2: Escribir la acción**

En `src/app/api/odoo/route.ts`, después del cierre del bloque `if (action === 'cruce_pesos_dia') { … }`,
agregar (reemplazando `traerPickingsDelDia` por el nombre real del paso 1):

```ts
    // [PLANILLA] Los movimientos de uno o varios días, para la planilla de Picking.
    //
    // Recibe VARIOS días porque una tienda de apertura tiene sus movimientos fechados en otro día
    // (62PLD los tuvo el 30/10 con la planilla del 03/11). Los días salen de
    // `agruparConsultasPorDia`, que ya es la regla de qué día pide cada tienda.
    //
    // Devuelve CRUDO, con el estado y el día de cada movimiento: filtrar y agrupar es de
    // `armarPlanilla` y `movimientosDesdeOdoo`, que son puros y testeados. Acá no se decide nada,
    // para que la regla de qué cuenta como trabajo viva en un solo lugar.
    //
    // A este endpoint NO se le aplica la ventana de 7 días de `diaDeOdoo.ts` (ver el comentario de
    // ese archivo): la fecha llega ya resuelta y se usa tal cual sobre `scheduled_date`.
    if (action === 'planilla_dia') {
      const pedidas: unknown = body.fechas;
      const fechas = Array.isArray(pedidas)
        ? [...new Set(pedidas.filter((d): d is string =>
            typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))]
        : [];
      if (fechas.length === 0) {
        return NextResponse.json({ ok: false, error: 'fechas inválidas' }, { status: 400 });
      }
      // Tope duro: hoy más una apertura son dos. Más de cuatro es un pedido mal armado y serían
      // cuatro consultas a Odoo por cada apertura de más.
      if (fechas.length > 4) {
        return NextResponse.json({ ok: false, error: 'demasiadas fechas' }, { status: 400 });
      }
      const movimientos: Array<Record<string, unknown>> = [];
      for (const fecha of fechas) {
        const ops = await traerPickingsDelDia(fecha);
        for (const p of ops) {
          movimientos.push({
            ref: p.name, origin: p.origin, estado: p.state,
            registros: p.lineTotal, responsable: p.responsible,
            asignadoEn: p.assignedAt, validadoEn: p.dateDone,
            // [PLANILLA] El destino y el partner van porque `resolveStoreCode` los necesita: el
            // `origin` es texto escrito a mano y `location_dest_id` es dato estructurado. Ver el
            // comentario de `resolveStoreCode` en `picking-utils.ts`.
            toLocation: p.toLocation, partner: p.partner,
            // El día que se pidió, no el `scheduled_date` crudo: es la clave con la que
            // `movimientosDesdeOdoo` decide si ese movimiento le corresponde a esa tienda.
            dia: fecha,
          });
        }
      }
      return NextResponse.json({ ok: true, movimientos });
    }
```

- [ ] **Step 3: Verificar que el cambio llegó**

```bash
grep -n "planilla_dia\|demasiadas fechas" src/app/api/odoo/route.ts
```

Expected: 2 coincidencias. Si no aparecen, el bloque no se insertó: abrirlo y hacerlo a mano.

- [ ] **Step 4: Probarla contra el día real**

Con `npm run dev` levantado:

```bash
curl -s -X POST http://localhost:3000/api/odoo \
  -H 'Content-Type: application/json' \
  -d '{"action":"planilla_dia","fechas":["2026-11-03"]}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      const j=JSON.parse(s);
      console.log('ok:', j.ok, '· movimientos:', (j.movimientos||[]).length);
      for (const m of (j.movimientos||[]).filter(x=>x.origin.includes('Comida 27MCH')))
        console.log(' ', m.estado, m.registros, m.asignadoEn, m.dia);})"
```

Expected:
```
ok: true · movimientos: 221
  done 134 2026-11-03 11:51:12 2026-11-03
  cancel 15 null 2026-11-03
```

Los 134 y la hora `11:51:12` (UTC — 08:51 de Chile) son la comprobación de que `lineTotal` y
`assignedAt` de la tarea 5 están llegando. El total de movimientos cambia con el día; lo que
importa es que 27MCH Comida dé 134 y no otro número.

Y que una fecha mala se rechace:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/odoo \
  -H 'Content-Type: application/json' -d '{"action":"planilla_dia","fechas":[]}'
```

Expected: `400`

- [ ] **Step 5: Typecheck y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/odoo/route.ts
git commit -m "Odoo: acción planilla_dia

Recibe varios días porque una apertura tiene sus movimientos fechados en
otro (62PLD, el 30/10). Devuelve crudo con estado y día: filtrar y
agrupar es de los módulos puros. Reutiliza el fetch del día.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Normalizar lo de Odoo, respetando el día de cada tienda

**Files:**
- Create: `src/features/picking/planilla/desdeOdoo.ts`
- Test: `src/features/picking/planilla/__tests__/desdeOdoo.test.ts`

**Por qué un módulo aparte:** del endpoint vienen `origin` y `responsable` crudos. Sacar de ahí el
código de tienda, la sección y el nombre de la persona es lógica con reglas (la Ñ, las aperturas,
las cuentas compartidas, el día de cada tienda) y por eso se testea sola, fuera del tab.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/features/picking/planilla/__tests__/desdeOdoo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { movimientosDesdeOdoo, type MovimientoOdoo } from '../desdeOdoo';

const NOMBRES = { 'Pickers 15': 'Cristobal Labra', 'Pickers 1': 'Maria Camila' };
const HOY = '2026-11-03';

function crudo(p: Partial<MovimientoOdoo>): MovimientoOdoo {
  return {
    ref: '99REC/DT/146059', origin: 'Abastecimiento Comida 27MCH 03/11/2026',
    estado: 'done', registros: 134, responsable: 'Pickers 1',
    asignadoEn: '2026-11-03 11:51:12', validadoEn: '2026-11-03 13:52:10', dia: HOY,
    toLocation: '', partner: '', ...p,
  };
}
/** Todas las tiendas piden hoy, salvo las que se pasen distinto. */
function dias(extra: Record<string, string> = {}): Map<string, string> {
  const m = new Map<string, string>();
  for (const cod of ['27MCH', '23PEÑ', '34SMB', '56PZA', '01TPS']) m.set(cod, HOY);
  for (const [cod, d] of Object.entries(extra)) m.set(cod, d);
  return m;
}

describe('movimientosDesdeOdoo', () => {
  it('saca el código, la sección y el nombre traducido', () => {
    const [m] = movimientosDesdeOdoo([crudo({})], NOMBRES, dias());
    expect(m.cod).toBe('27MCH');
    expect(m.seccion).toBe('Comida');
    expect(m.picker).toBe('Maria Camila');
    expect(m.registros).toBe(134);
    expect(m.estado).toBe('done');
  });

  it('un código con Ñ se reconoce', () => {
    const [m] = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Aseo 23PEÑ 03/11/2026', responsable: 'Pickers 15' })],
      NOMBRES, dias());
    expect(m.cod).toBe('23PEÑ');
    expect(m.picker).toBe('Cristobal Labra');
  });

  it('Congelados no es de esta planilla y se deja fuera', () => {
    expect(movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Congelados 01TPS 03/11/2026' })], NOMBRES, dias()),
    ).toHaveLength(0);
  });

  it('un origin sin sección ni código se descarta en vez de inventar', () => {
    expect(movimientosDesdeOdoo(
      [crudo({ origin: 'Merma Abastecimiento 14PF/INT/02745' })], NOMBRES, dias()),
    ).toHaveLength(0);
  });

  it('una cuenta sin persona en el catálogo sale con su nombre crudo, no vacía', () => {
    // 34SMB usa la cuenta genérica «Abastecimiento»; 04PDG, un usuario llamado «06MQH».
    const [m] = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Hogar 34SMB 03/11/2026', responsable: 'Abastecimiento' })],
      NOMBRES, dias());
    expect(m.picker).toBe('Abastecimiento');
  });

  it('sin responsable el picker queda vacío', () => {
    const [m] = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Comida 56PZA 03/11/2026', responsable: '' })],
      NOMBRES, dias());
    expect(m.picker).toBe('');
  });
});

describe('movimientosDesdeOdoo: cada tienda solo toma los movimientos de SU día', () => {
  it('una apertura toma los de su día y no los de hoy', () => {
    // 62PLD abre: sus movimientos están fechados el 30/10 aunque la planilla sea del 03/11.
    const d = dias({ '62PLD': '2026-10-30' });
    const out = movimientosDesdeOdoo([
      crudo({ origin: 'Abastecimiento Apertura Hogar 1 - 62PLD 30/10/2026',
              registros: 60, responsable: '', dia: '2026-10-30' }),
    ], NOMBRES, d);
    expect(out).toHaveLength(1);
    expect(out[0].cod).toBe('62PLD');
    expect(out[0].seccion).toBe('Hogar');   // «Abastecimiento Apertura Hogar» también se reconoce
  });

  it('un movimiento del día de la apertura NO se le cuenta a una tienda normal', () => {
    // Al traer el 30/10 por 62PLD también vienen los movimientos de 27MCH de ese día: no van.
    const d = dias({ '62PLD': '2026-10-30' });
    const out = movimientosDesdeOdoo([
      crudo({ dia: '2026-10-30' }),   // 27MCH, pero del 30/10
    ], NOMBRES, d);
    expect(out).toHaveLength(0);
  });

  it('un movimiento de hoy NO se le cuenta a la tienda de apertura', () => {
    const d = dias({ '62PLD': '2026-10-30' });
    const out = movimientosDesdeOdoo([
      crudo({ origin: 'Abastecimiento Hogar 62PLD 03/11/2026', dia: HOY }),
    ], NOMBRES, d);
    expect(out).toHaveLength(0);
  });

  it('una tienda que no está en el mapa de días se descarta', () => {
    const out = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Comida 99XXX 03/11/2026' })], NOMBRES, dias());
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run src/features/picking/planilla/__tests__/desdeOdoo.test.ts`
Expected: FAIL — `Failed to resolve import "../desdeOdoo"`

- [ ] **Step 3: Comprobar que `resolveStoreCode` se exporta y qué hace**

```bash
grep -n -B 8 "export function resolveStoreCode" src/features/picking/picking-utils.ts
```

Leé su comentario completo antes de usarla: dice en qué orden mira las tres fuentes y por qué
canoniza la Ñ. Ya está exportada.

- [ ] **Step 4: Escribir la implementación**

Crear `src/features/picking/planilla/desdeOdoo.ts`:

```ts
// De lo que devuelve `planilla_dia` a lo que consume `armarPlanilla`. Módulo puro.
//
// ── LO QUE NO SE PUEDE LEER SE DESCARTA ───────────────────────────────────────────────────────
//
// El `origin` es texto escrito a mano en Odoo. La sección sale de `categoriaDeOrigin`, que ya cubre
// las aperturas («Abastecimiento Apertura Hogar»). Un «Merma Abastecimiento 14PF/INT/02745» no es un
// movimiento de la planilla: ponerle una sección por defecto metería una fila falsa en una hoja que
// se firma.
//
// ── EL CÓDIGO SALE DE `resolveStoreCode`, NO DE `extractStoreCode` ──────────────────────────────
//
// `extractStoreCode` solo pone en mayúsculas y aplica la regex: NO canoniza la Ñ. `resolveStoreCode`
// sí, y su comentario dice por qué: «para que el semáforo/bodega (que usan el código del catálogo,
// p. ej. "37VIÑ") hagan match aunque Odoo use otra grafía de la Ñ (p. ej. "37VIN")». Además mira
// primero `location_dest_id`, que es dato estructurado, y recién después el `origin` manual.
//
// Sin eso el fallo es SILENCIOSO: un movimiento de 23PEÑ que llegue como `23PEN` no calza con
// ninguna tienda del día, cae en `fueraDelCalendario` y la tienda aparece «sin carga» teniéndola.
//
// ── CADA TIENDA TOMA LOS MOVIMIENTOS DE SU DÍA ────────────────────────────────────────────────
//
// `planilla_dia` puede traer más de un día, porque una tienda de apertura tiene sus movimientos
// fechados en otro (62PLD los tuvo el 30/10 con la planilla del 03/11). Al traer ese día vienen
// TAMBIÉN los movimientos de las demás tiendas de esa fecha, que no son de esta hoja. `diaPorTienda`
// dice qué día le toca a cada una y acá se descarta todo lo demás. Sin este filtro, una tienda
// normal sumaría dos veces: sus movimientos de hoy y los del día de la apertura.

import { categoriaDeOrigin } from '@/features/despacho/shared/aperturaOdoo';
import { resolveStoreCode } from '@/features/picking/picking-utils';
import { SECCIONES, type MovimientoPlanilla, type SeccionPlanilla } from './armarPlanilla';

/** Un movimiento tal como lo devuelve la acción `planilla_dia`. */
export interface MovimientoOdoo {
  ref: string;
  origin: string;
  estado: string;
  registros: number;
  responsable: string;
  asignadoEn: string | null;
  validadoEn: string | null;
  /** El día que se le pidió a Odoo. Es la clave para saber a qué tienda le corresponde. */
  dia: string;
  /** `location_dest_id`: dato estructurado, la primera fuente del código de tienda. */
  toLocation: string;
  /** El partner del picking: la última fuente del código, si las dos anteriores fallan. */
  partner: string;
}

const ES_SECCION = new Set<string>(SECCIONES);

/**
 * Normaliza y descarta.
 *
 * `nombres` es el mapa de `picker_canonical_names` («Pickers 15» → «Cristobal Labra»); una cuenta
 * que no esté sale con su nombre crudo, para que se vea cuál falta configurar en vez de desaparecer.
 *
 * `diaPorTienda` es `cod → día de sus movimientos`, como lo arma `agruparConsultasPorDia`. Una
 * tienda que no esté ahí no es de esta hoja.
 */
export function movimientosDesdeOdoo(
  crudos: MovimientoOdoo[],
  nombres: Record<string, string>,
  diaPorTienda: ReadonlyMap<string, string>,
): MovimientoPlanilla[] {
  const out: MovimientoPlanilla[] = [];
  for (const m of crudos) {
    const cat = categoriaDeOrigin(m.origin);
    // Congelados tiene su propia pestaña: no es de esta planilla.
    if (!cat || !ES_SECCION.has(cat)) continue;
    const cod = resolveStoreCode({ toLocation: m.toLocation, origin: m.origin, partner: m.partner });
    if (!cod) continue;
    const suDia = diaPorTienda.get(cod);
    if (!suDia || suDia !== m.dia) continue;
    out.push({
      cod,
      seccion: cat as SeccionPlanilla,
      registros: m.registros,
      picker: m.responsable ? (nombres[m.responsable] ?? m.responsable) : '',
      asignadoEn: m.asignadoEn,
      validadoEn: m.validadoEn,
      estado: m.estado,
    });
  }
  return out;
}
```

- [ ] **Step 5: Correr el test y ver que pasa**

Run: `npx vitest run src/features/picking/planilla/__tests__/desdeOdoo.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 6: Commit**

```bash
git add src/features/picking/planilla/desdeOdoo.ts src/features/picking/planilla/__tests__/desdeOdoo.test.ts src/features/picking/picking-utils.ts
git commit -m "Planilla: normalizar lo de Odoo, cada tienda con su día

La sección sale de categoriaDeOrigin (cubre aperturas) y el código de
extractStoreCode (trata la Ñ). Al traer el día de una apertura vienen
también los movimientos de las otras tiendas de esa fecha: diaPorTienda
los descarta, o una tienda normal sumaría dos veces.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: El tab, las dos vistas y la impresión

**Files:**
- Create: `src/features/picking/components/PlanillaTab.tsx`
- Modify: `src/features/picking/PickingScreen.tsx:163` (el arreglo de pestañas)
- Modify: `src/features/picking/PickingScreen.tsx:69` (el import)
- Modify: `src/features/picking/PickingScreen.tsx:2353` (donde se monta `ActivityTab`)

**Referencia visual:** el mockup aprobado, https://claude.ai/artifact/B4RMxhD2ueUYnXz4ryYvq8 —
tableros «Vista PLANILLA», «Impresa» y «Vista DETALLE».

**El selector de tiendas no se toca:** `CON_SELECTOR` (`selectorTiendas.ts:11`) es una lista blanca
de dos pestañas (`monitoreo`, `congelados`), así que `planilla` se repliega sola, como Calendario y
Actividad.

**El catálogo se pide dentro del tab.** `PickingScreen` tiene `tiendaTipoInfo` (línea 324) con
`{tipo, d, z}`, pero **sin `lat`** — y hoy 8 de las 11 tiendas de Regiones tienen el sector «Región»
a secas, que necesita la latitud para decidir norte o sur. `GET /api/tiendas` devuelve
`{ tiendas: [...] }` con `codigo`, `sector_comuna`, `tipo` y `lat` (línea 168), así que el tab lo
pide él mismo y no se le agrega estado a una pantalla de 2.440 líneas.

- [ ] **Step 1: Agregar la pestaña al arreglo**

En `src/features/picking/PickingScreen.tsx`, línea 163, agregar `'planilla'` después de
`'actividad'` (el coordinador la pidió «abajo de actividad»):

```ts
  const [rightTab, setRightTab]   = usePestanaRecordada('picking_tab',
    ['monitoreo', 'congelados', 'actividad', 'planilla', 'estadisticas', 'historial', 'configuracion', 'calendario'] as const, 'monitoreo');
```

- [ ] **Step 2: Verificar que el cambio llegó**

```bash
grep -n "'actividad', 'planilla'" src/features/picking/PickingScreen.tsx
```

Expected: una coincidencia en la línea 163. Si no aparece, el reemplazo no encontró su objetivo:
abrir el archivo y hacerlo a mano antes de seguir. Un reemplazo que falla no rompe el build
(CLAUDE.md, regla 7).

- [ ] **Step 3: Escribir la cabecera del tab**

Crear `src/features/picking/components/PlanillaTab.tsx`:

```tsx
'use client';

// La planilla de Picking: la hoja del día, en dos vistas.
//
// ── LA HOJA CAMBIA CON EL DÍA ─────────────────────────────────────────────────────────────────
//
// Hoy muestra las tiendas de hoy. No hay selector de fecha, igual que el papel. La fecha se toma
// LOCAL (`fechaISOLocal`), no con `todayISO()`, que usa UTC y rueda cerca de las 20:00 en Chile: a
// esa hora la planilla habría saltado al día siguiente con el CD todavía abierto.
//
// ── POR QUÉ SE PIDEN VARIOS DÍAS A ODOO ───────────────────────────────────────────────────────
//
// Una tienda de apertura tiene sus movimientos fechados en otro día. `agruparConsultasPorDia` ya
// sabe qué día pide cada tienda; de ahí salen las fechas que se le piden a Odoo y el mapa
// `cod → día` con el que `movimientosDesdeOdoo` descarta lo que no corresponde.
//
// Imprimir usa el mismo patrón que `CalendarioColumnas.handlePrint`: se arma el HTML y se abre una
// ventana. Cada vista imprime en SU formato, porque el botón imprime la vista en la que estás.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, Download, Loader2 } from 'lucide-react';
import { fechaISOLocal } from '@/features/despacho/shared/fechaLocal';
import { agruparConsultasPorDia } from '@/features/despacho/shared/consultasPorDia';
import { armarPlanilla, SECCIONES, type MovimientoPlanilla, type Planilla } from '../planilla/armarPlanilla';
import { movimientosDesdeOdoo, type MovimientoOdoo } from '../planilla/desdeOdoo';
import { COLOR_ZONA, ZONAS, zonaPlanilla, type ZonaPlanilla } from '../planilla/zonaPlanilla';
import { horaChile, duracionMinutos, formatearDuracion } from '../planilla/horasPlanilla';
import { csvVistaPlanilla, csvVistaDetalle } from '../planilla/csvPlanilla';

export interface PlanillaTabProps {
  /** Los códigos de las tiendas del día, en el orden del calendario. */
  cods: string[];
  /** `cod → día de sus movimientos en Odoo`, solo para las tiendas de apertura. */
  aperturas: ReadonlyMap<string, string>;
}

type Vista = 'planilla' | 'detalle';
interface FichaTienda { codigo: string; sector_comuna?: string | null; tipo?: string | null; lat?: number | null }

export function PlanillaTab({ cods, aperturas }: PlanillaTabProps) {
  const fecha = fechaISOLocal();
  const [vista, setVista]     = useState<Vista>('planilla');
  const [crudos, setCrudos]   = useState<MovimientoOdoo[] | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [fichas, setFichas]   = useState<Record<string, FichaTienda>>({});
  const [error, setError]     = useState<string | null>(null);

  // Qué día pide cada tienda: hoy, salvo las aperturas.
  const consultas = useMemo(
    () => agruparConsultasPorDia(cods, aperturas, fecha),
    [cods, aperturas, fecha]);

  const diaPorTienda = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of consultas) for (const cod of c.cods) m.set(cod, c.dia);
    return m;
  }, [consultas]);

  const fechas = useMemo(() => consultas.map(c => c.dia), [consultas]);
  // El efecto depende de un TEXTO, no del arreglo. `cods` llega como un arreglo nuevo en cada
  // render de la pantalla, así que `consultas` y `fechas` también son nuevos aunque digan lo
  // mismo: con `fechas` en las dependencias el efecto se dispara en bucle y le pega a Odoo sin
  // parar. La clave cambia solo cuando cambian los días de verdad.
  const claveFechas = fechas.join(',');

  useEffect(() => {
    if (!claveFechas) { setCrudos([]); return; }
    const fechas = claveFechas.split(',');
    let vivo = true;
    (async () => {
      try {
        const [rOdoo, rNombres, rTiendas] = await Promise.all([
          fetch('/api/odoo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'planilla_dia', fechas }),
          }),
          fetch('/api/picker-canonical-names'),
          fetch('/api/tiendas'),
        ]);
        const jOdoo = await rOdoo.json();
        if (!vivo) return;
        if (!jOdoo?.ok) { setError('No se pudo traer el día de Odoo'); return; }
        setCrudos(jOdoo.movimientos ?? []);

        // Los nombres: el endpoint devuelve filas con `key` y `display_name`.
        const jNombres = await rNombres.json().catch(() => null);
        const mapa: Record<string, string> = {};
        for (const r of (jNombres?.rows ?? jNombres?.data ?? jNombres?.names ?? [])) {
          if (r?.key) mapa[String(r.key)] = String(r.display_name ?? '');
        }
        if (vivo) setNombres(mapa);

        // El catálogo: de acá salen `sector_comuna`, `tipo` y `lat` para la zona.
        const jTiendas = await rTiendas.json().catch(() => null);
        const porCod: Record<string, FichaTienda> = {};
        for (const t of (jTiendas?.tiendas ?? [])) {
          if (t?.codigo) porCod[String(t.codigo)] = t as FichaTienda;
        }
        if (vivo) setFichas(porCod);
      } catch {
        if (vivo) setError('No se pudo traer el día de Odoo');
      }
    })();
    return () => { vivo = false; };
  }, [claveFechas]);

  const tiendas = useMemo(
    () => cods.map(cod => {
      const f = fichas[cod];
      return { cod, zona: zonaPlanilla({ sector: f?.sector_comuna, lat: f?.lat, tipo: f?.tipo }) as ZonaPlanilla };
    }),
    [cods, fichas]);

  const movimientos: MovimientoPlanilla[] = useMemo(
    () => (crudos ? movimientosDesdeOdoo(crudos, nombres, diaPorTienda) : []),
    [crudos, nombres, diaPorTienda]);

  const planilla = useMemo(() => armarPlanilla(movimientos, tiendas), [movimientos, tiendas]);

  // Solo lo que está en la hoja: los descartados no van al detalle.
  const delDia = useMemo(
    () => movimientos.filter(m => m.estado === 'done' || m.estado === 'assigned'),
    [movimientos]);

  const bajar = useCallback(() => {
    const texto = vista === 'planilla'
      ? csvVistaPlanilla(planilla, fecha)
      : csvVistaDetalle(delDia, fecha);
    // El BOM hace que Excel abra los acentos bien.
    const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planilla-${vista}-${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [vista, planilla, delDia, fecha]);

  const imprimir = useCallback(() => {
    const html = vista === 'planilla' ? htmlPlanilla(planilla, fecha) : htmlDetalle(delDia, fecha);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [vista, planilla, delDia, fecha]);

  if (error) return <div style={{ padding: 20, color: '#B91C1C' }}>{error}</div>;
  if (!crudos) return (
    <div style={{ padding: 20, display: 'flex', gap: 8, alignItems: 'center', color: '#475569' }}>
      <Loader2 size={16} /> Trayendo el día…
    </div>
  );

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1.5px solid #CBD5E1', borderRadius: 10, overflow: 'hidden' }}>
          {(['planilla', 'detalle'] as Vista[]).map(v => (
            <button key={v} type="button" onClick={() => setVista(v)} style={{
              minHeight: 44, padding: '0 16px', fontSize: 13.5, fontWeight: 700, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              background: vista === v ? '#1E40AF' : '#fff',
              color: vista === v ? '#fff' : '#475569',
            }}>{v === 'planilla' ? 'Planilla' : 'Detalle'}</button>
          ))}
        </div>
        <button type="button" onClick={bajar} style={BTN_SEC}><Download size={15} /> Bajar archivo</button>
        <button type="button" onClick={imprimir} style={BTN_PRI}>
          <Printer size={15} /> {vista === 'planilla' ? 'Imprimir planilla' : 'Imprimir detalle'}
        </button>
      </div>

      {/* Las cinco zonas siempre: una que no aparece se leería como un dato que falta. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {ZONAS.map(z => {
          const n = planilla.filas.filter(f => f.zona === z).length;
          const c = COLOR_ZONA[z];
          return (
            <span key={z} style={{
              display: 'inline-flex', gap: 5, alignItems: 'center', padding: '3px 9px',
              borderRadius: 6, fontSize: 11.5, fontWeight: 700,
              background: c.bg, color: c.text, border: `1px solid ${c.border}`,
              opacity: n === 0 ? 0.4 : 1,
            }}>{c.label} <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.6 }}>{n}</span></span>
          );
        })}
      </div>

      {vista === 'planilla'
        ? <TablaPlanilla planilla={planilla} />
        : <TablaDetalle movimientos={delDia} />}

      <div style={{ fontSize: 12.5, color: '#78350F', background: '#FFFBEB',
                    border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px' }}>
        Fuera de la hoja: <strong>{planilla.descartados.anulados}</strong> anulados y{' '}
        <strong>{planilla.descartados.sinLiberar}</strong> sin stock liberado.
      </div>
    </div>
  );
}

const BTN_BASE = {
  minHeight: 44, padding: '0 15px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
} as const;
const BTN_SEC = { ...BTN_BASE, background: '#fff', color: '#334155', border: '1.5px solid #CBD5E1' };
const BTN_PRI = { ...BTN_BASE, background: '#0F172A', color: '#fff', border: 'none' };
```

- [ ] **Step 4: Las dos tablas de pantalla**

Agregar al final de `PlanillaTab.tsx`:

```tsx
/** La matriz: una fila por tienda; una celda con varios movimientos los apila. */
function TablaPlanilla({ planilla }: { planilla: Planilla }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1020 }}>
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            <th style={TH_NUM}>#</th>
            <th style={TH}>Tienda</th>
            {SECCIONES.map(s => (
              <Fragment key={s}>
                <th style={TH_DER}>{s === 'Chocolates' ? 'Choc.' : s}</th>
                <th style={TH_TENUE}>Usuario</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {planilla.filas.map((f, i) => {
            const c = COLOR_ZONA[f.zona];
            return (
              <tr key={f.cod} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={TD_NUM}>{i + 1}</td>
                <td style={{ padding: '6px 10px', verticalAlign: 'top' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 5,
                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                    fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 700,
                    opacity: f.sinCarga ? 0.45 : 1,
                  }}>{f.cod}</span>
                </td>
                {SECCIONES.map(s => {
                  const celda = f.celdas[s];
                  const fondo = celda.length === 0 ? '#F8FAFC' : celda.length > 1 ? '#EFF6FF' : undefined;
                  return (
                    <Fragment key={s}>
                      <td style={{ ...TD_DER, background: fondo }}>
                        {celda.map((x, k) => <div key={k}>{x.registros}</div>)}
                      </td>
                      <td style={{ ...TD, background: fondo }}>
                        {celda.map((x, k) => (
                          <div key={k} style={x.picker ? undefined : ESTILO_SIN_ASIGNAR}>
                            {x.picker || '— sin asignar'}
                          </div>
                        ))}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
          <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
            <td />
            <td style={{ ...TH, padding: '7px 10px' }}>Total</td>
            {SECCIONES.map(s => (
              <Fragment key={s}>
                <td style={{ ...TD_DER, fontWeight: 800 }}>{planilla.totales[s]}</td>
                <td />
              </Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** El detalle: una fila por movimiento, con horas y duración. */
function TablaDetalle({ movimientos }: { movimientos: MovimientoPlanilla[] }) {
  const filas = [...movimientos].sort(porHoraDeInicio);
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 11, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
            <th style={TH}>Tienda</th><th style={TH}>Sección</th><th style={TH}>Usuario</th>
            <th style={TH_DER}>Registros</th>
            <th style={TH}>Inicio</th><th style={TH}>Validado</th>
            <th style={TH_DER}>Duración</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((m, i) => {
            const dur = duracionMinutos(m.asignadoEn, m.validadoEn);
            const largo = dur !== null && dur >= 180;
            return (
              <tr key={`${m.cod}-${m.seccion}-${i}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#1E40AF' }}>{m.cod}</td>
                <td style={TD}>{m.seccion}</td>
                <td style={m.picker ? TD : { ...TD, ...ESTILO_SIN_ASIGNAR }}>{m.picker || '— sin asignar'}</td>
                <td style={{ ...TD_DER, fontWeight: 700 }}>{m.registros}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(m.asignadoEn) || '—'}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace' }}>{horaChile(m.validadoEn) || '—'}</td>
                <td style={{ ...TD_DER, color: largo ? '#92400E' : '#475569',
                             background: largo ? '#FFFBEB' : undefined }}>
                  {formatearDuracion(dur)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Los asignados primero, en orden; los sin asignar al final. */
function porHoraDeInicio(a: MovimientoPlanilla, b: MovimientoPlanilla): number {
  if (!a.asignadoEn && !b.asignadoEn) return 0;
  if (!a.asignadoEn) return 1;
  if (!b.asignadoEn) return -1;
  return a.asignadoEn < b.asignadoEn ? -1 : a.asignadoEn > b.asignadoEn ? 1 : 0;
}

const TH       = { padding: '7px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                   letterSpacing: '.06em', color: '#475569', textAlign: 'left' } as const;
const TH_TENUE = { ...TH, color: '#94A3B8' } as const;
const TH_DER   = { ...TH, textAlign: 'right', padding: '7px 6px' } as const;
const TH_NUM   = { ...TH, textAlign: 'center', padding: '7px 4px', color: '#64748B' } as const;
const TD       = { padding: '6px 10px', color: '#334155', verticalAlign: 'top' } as const;
const TD_DER   = { padding: '6px', textAlign: 'right', color: '#0F172A', verticalAlign: 'top',
                   fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as const;
const TD_NUM   = { padding: '6px 4px', textAlign: 'center', color: '#94A3B8', fontSize: 10.5,
                   verticalAlign: 'top' } as const;
const ESTILO_SIN_ASIGNAR = { color: '#B45309', fontStyle: 'italic', fontWeight: 600 } as const;
```

- [ ] **Step 5: El HTML de impresión, uno por vista**

Agregar al final de `PlanillaTab.tsx`:

```tsx
/** Escapa lo que va al HTML de impresión: los nombres y los códigos vienen de Odoo. */
function esc(s: string | number): string {
  return String(s).replace(/[&<>"]/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
}

/** En papel los nombres se abrevian: «Cristobal Labra» → «C. Labra». */
function corto(s: string): string {
  const p = s.trim().split(/\s+/);
  return p.length < 2 ? s : `${p[0][0]}. ${p.slice(1).join(' ')}`;
}

const CSS_IMPRESION = `
  @page { size: letter landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Barlow, system-ui, sans-serif; color: #111827; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #9CA3AF; padding: 1px 4px; text-align: left; vertical-align: top; }
  th { background: #DBEAFE; font-size: 7.5px; font-weight: 800; text-transform: uppercase;
       letter-spacing: .03em; border-color: #111827; }
  .der { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .cod { font-family: ui-monospace, monospace; font-weight: 700; }
  .nada { background: #E5E7EB; }
  .cab { display: flex; align-items: flex-end; justify-content: space-between;
         border-bottom: 2px solid #111827; padding-bottom: 5px; margin-bottom: 7px; }
  .firmas { display: flex; gap: 22px; margin-top: 12px; }
  .firma { width: 180px; }
  .firma .linea { height: 22px; border-bottom: 1px solid #111827; }
  .firma .rot { font-size: 8px; font-weight: 700; text-transform: uppercase;
                letter-spacing: .06em; margin-top: 2px; }
`;

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

function cabecera(fecha: string, titulo: string, resumen: string): string {
  // Mediodía para que el día no se corra por zona horaria, igual que `bandaApertura.ts`.
  const d = new Date(fecha + 'T12:00:00');
  const dia = DIAS[d.getDay()] ?? '';
  const largo = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="cab">
    <div><strong style="font-size:22px;letter-spacing:.04em">${esc(dia)}</strong>
      <span style="font-size:13px;margin-left:10px">${esc(largo)} · ${esc(titulo)}</span></div>
    <div style="text-align:right;font-size:9.5px">
      <div style="font-weight:700;text-transform:uppercase;letter-spacing:.07em">Kios Club · CD Recoleta</div>
      <div>${esc(resumen)}</div></div>
  </div>`;
}

const FIRMAS = `<div class="firmas">
  <div style="flex:1;font-size:8.5px;line-height:1.45">Una fila por tienda. Cuando una sección tiene
  dos movimientos van apilados en la misma celda. El color de la tienda es su zona, el mismo del
  calendario impreso. Las celdas en gris no llevan carga.</div>
  <div class="firma"><div class="linea"></div><div class="rot">Supervisor de Picking</div></div>
  <div class="firma"><div class="linea"></div><div class="rot">Coordinador</div></div>
</div>`;

/** La hoja horizontal de la vista PLANILLA. */
function htmlPlanilla(p: Planilla, fecha: string): string {
  const th = ['<th style="width:18px">#</th>', '<th style="width:52px">Tienda</th>'];
  for (const s of SECCIONES) {
    th.push(`<th class="der" style="width:32px">${esc(s === 'Chocolates' ? 'Choc.' : s)}</th>`);
    th.push('<th>Usuario</th>');
  }

  const trs = p.filas.map((f, i) => {
    const c = COLOR_ZONA[f.zona];
    const tds = [
      `<td style="text-align:center;font-size:7.5px;color:#6B7280">${i + 1}</td>`,
      `<td class="cod" style="background:${c.bg};color:${c.text};border-left:3px solid ${c.border}">${esc(f.cod)}</td>`,
    ];
    for (const s of SECCIONES) {
      const celda = f.celdas[s];
      const clase = celda.length === 0 ? 'nada' : '';
      tds.push(`<td class="der ${clase}">${celda.map(x => esc(x.registros)).join('<br>')}</td>`);
      tds.push(`<td class="${clase}" style="font-size:9px">${
        celda.map(x => esc(x.picker ? corto(x.picker) : '—')).join('<br>')}</td>`);
    }
    return '<tr>' + tds.join('') + '</tr>';
  });

  const tot = ['<td></td>', '<td style="font-size:8px;font-weight:800">TOTAL</td>'];
  for (const s of SECCIONES) { tot.push(`<td class="der">${p.totales[s]}</td>`); tot.push('<td></td>'); }

  const conCarga = p.filas.filter(f => !f.sinCarga).length;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Planilla ${esc(fecha)}</title><style>${CSS_IMPRESION}</style></head><body>
    ${cabecera(fecha, 'Abastecimiento Seco', `${p.filas.length} tiendas · ${conCarga} con carga`)}
    <table><thead><tr>${th.join('')}</tr></thead><tbody>${trs.join('')}
      <tr style="background:#E8EDF3">${tot.join('')}</tr></tbody></table>
    ${FIRMAS}</body></html>`;
}

/** La lista con horas de la vista DETALLE. */
function htmlDetalle(movs: MovimientoPlanilla[], fecha: string): string {
  const trs = [...movs].sort(porHoraDeInicio).map(m => `<tr>
      <td class="cod">${esc(m.cod)}</td>
      <td>${esc(m.seccion)}</td>
      <td>${esc(m.picker || '—')}</td>
      <td class="der">${m.registros}</td>
      <td>${esc(horaChile(m.asignadoEn) || '—')}</td>
      <td>${esc(horaChile(m.validadoEn) || '—')}</td>
      <td class="der">${esc(formatearDuracion(duracionMinutos(m.asignadoEn, m.validadoEn)))}</td>
    </tr>`);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Detalle ${esc(fecha)}</title><style>${CSS_IMPRESION}</style></head><body>
    ${cabecera(fecha, 'Abastecimiento Seco · detalle', `${movs.length} movimientos`)}
    <table><thead><tr><th>Tienda</th><th>Sección</th><th>Usuario</th><th class="der">Registros</th>
      <th>Inicio</th><th>Validado</th><th class="der">Duración</th></tr></thead>
      <tbody>${trs.join('')}</tbody></table>
    ${FIRMAS}</body></html>`;
}
```

- [ ] **Step 6: Montar el tab en PickingScreen**

Agregar el import junto a los otros tabs (después de la línea 69):

```ts
import { PlanillaTab } from './components/PlanillaTab';
```

Y en el render, junto a donde se monta `<ActivityTab` (línea 2353), agregar el bloque de la
planilla con la misma forma condicional que usan los demás tabs:

```tsx
          {rightTab === 'planilla' && (
            <PlanillaTab cods={codsPlanilla} aperturas={aperturasPorCod} />
          )}
```

Y declarar `codsPlanilla` junto a `todayStores` (después de la línea 1232), para no pasarle un
arreglo nuevo en cada render:

```ts
  // [PLANILLA] Los códigos del día, memoizados: `todayStores.map(...)` suelto en el JSX crea un
  // arreglo nuevo en cada render y el tab volvería a pedirle el día a Odoo cada vez.
  const codsPlanilla = useMemo(() => todayStores.map(s => s.cod), [todayStores]);
```

`todayStores` (línea 1213) ya es calendario + adelantos y `aperturasPorCod` (línea 305) ya es
`cod → día de Odoo`: las dos existen y no hay que calcular nada nuevo.

- [ ] **Step 7: Verificar que los tres cambios llegaron**

```bash
grep -n "PlanillaTab" src/features/picking/PickingScreen.tsx
```

Expected: 2 coincidencias — el import y el render.

- [ ] **Step 8: Los cuatro en verde**

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: los cuatro sin errores, y `vitest` mostrando los 5 archivos de prueba de la planilla
(`zonaPlanilla`, `horasPlanilla`, `armarPlanilla`, `csvPlanilla`, `desdeOdoo`).

- [ ] **Step 9: Probarlo en el navegador**

`npm run dev`, entrar a Picking → pestaña **Planilla**. Contra la medición del 03/11/2026:

- **29 filas**, con 75PUC atenuada y sin números.
- **38SP2 Hogar con 63 y 46**, los dos de Marcelo Vergara, en la misma celda.
- **56PZA Comida con 64 y 160**.
- Leyenda: Ruta Sur 11, Mall RM 3, Stripcenter 15; Norte y Costa atenuadas en 0.
- 46TRE, 36CHL y 60PBL en celeste (Ruta Sur), **no** en rosa, aunque sean MALL.
- Totales: Comida 4.268 · Aseo 1.210 · Hogar 2.640 · Chocolates 806.
- Al pie: 50 anulados y 25 sin stock liberado.
- 34SMB con «Abastecimiento» y 04PDG con «06MQH» en ámbar.
- En **Detalle**: 27MCH Hogar empieza **08:33** (no 11:33) y dura **2 h 26**.
- **Imprimir** en Planilla da la hoja horizontal con firmas; en Detalle, la lista con horas.

(Los números son del 03/11/2026. En otro día cambian; lo que no cambia es la forma, y que
46TRE/36CHL/60PBL vayan por su ruta.)

- [ ] **Step 10: Commit**

```bash
git add src/features/picking/components/PlanillaTab.tsx src/features/picking/PickingScreen.tsx
git commit -m "Picking: pestaña Planilla con sus dos vistas

La hoja del día, y el botón imprime la vista en la que estás. Pide a
Odoo los días que hagan falta: una apertura tiene los suyos en otro.
El catálogo se pide en el tab porque tiendaTipoInfo no trae lat, y sin
lat 8 de las 11 tiendas de Regiones no se pueden partir norte/sur.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Cerrar la rama

- [ ] **Step 1: Los cuatro en verde sobre todo junto**

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Expected: los cuatro sin errores. **No abrir el PR si alguno falla.**

- [ ] **Step 2: Verificar que la rama tiene TODO antes de abrir el PR**

CLAUDE.md, regla 9: pasó con #490, #494 y #497 — se mergea el primer commit y el resto queda
huérfano. Nunca empujar después de `gh pr create`.

```bash
git log --oneline main..HEAD
```

Expected: los 8 commits de las tareas 1 a 8.

- [ ] **Step 3: Abrir el PR**

```bash
gh pr create --title "Picking: la planilla del día, en el sistema" --body "$(cat <<'CUERPO'
La planilla que hoy se lleva en papel, en una pestaña de Picking. Dos vistas, y el botón imprime la
vista en la que estás.

**Vista Planilla** — la matriz del papel: una fila por tienda del calendario, en su orden, con las
columnas Comida / Aseo / Hogar / Chocolate y su usuario. Cuando una sección tiene dos movimientos
los dos números van en la misma celda, como los escribe el coordinador. Totales al pie.

**Vista Detalle** — una fila por movimiento, con hora de asignación, de validación y la duración.
Eso el papel no lo tiene.

**Los colores son los del calendario impreso.** Misma paleta que `CalendarioColumnas.handlePrint`,
ahora en un solo lugar. Con la regla que el calendario ya aplica: una tienda de Regiones que además
es MALL va pintada por su ruta, no de rosa.

### Dos cosas medidas que decidieron el diseño

**El conteo sale de `move_ids`, no del `lineCount` que ya existía.** `lineCount` filtra
`stock.move` por estado, así que cuenta solo las líneas con stock reservado y crece durante el día:
el 29/10, día cerrado, los dos coinciden en 157 de 157; el 03/11, en curso, difieren en 53 de 149.
`lineCount` queda intacto por sus otros consumidores.

**El número no cambia después de asignar.** Comparando el `create_date` de cada línea contra
`user_assigned_date`: 771 movimientos asignados en 6 días hábiles, cero líneas agregadas después.
Por eso leer Odoo en vivo ya da el número de la asignación y no hace falta persistir nada.

### Lo que no va a la hoja

Los `cancel` (anulados) y los `confirmed` (sin stock liberado). El 03/11, de 194 movimientos de las
tiendas del día van 119. Mostrarlos daba líneas fantasma: 27MCH aparecía con dos movimientos de
Comida cuando tiene uno. Los descartados se cuentan al pie, no se esconden.

### Las aperturas

Una tienda de apertura tiene sus movimientos fechados en otro día (62PLD los tuvo el 30/10). La
acción nueva recibe varios días, de `agruparConsultasPorDia`, y cada tienda toma solo los del día
que le toca — si no, una tienda normal sumaría dos veces.

Spec: `docs/superpowers/specs/2026-11-03-planilla-picking-design.md`
Plan: `docs/superpowers/plans/2026-11-03-planilla-picking.md`
Mockup aprobado: https://claude.ai/artifact/B4RMxhD2ueUYnXz4ryYvq8

🤖 Generated with [Claude Code](https://claude.com/claude-code)
CUERPO
)"
```

- [ ] **Step 4: Verificar que el PR quedó completo**

```bash
git log origin/main..origin/$(git branch --show-current) --oneline
```

Expected: los 8 commits. Si falta alguno, **no empujar sobre el PR abierto**: cerrarlo y abrir otro.

- [ ] **Step 5: Mandarle el link al coordinador**

La URL completa del PR, no el número.
