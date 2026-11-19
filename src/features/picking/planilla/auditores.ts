// Quién auditó cada celda de la planilla. Módulo puro: sin red ni UI.
//
// ── EL DATO EXISTE, Y HASTA EL 19/11/2026 NO LO SABÍAMOS ──────────────────────────────────────
//
// El comentario de la columna «Auditor» de la hoja impresa decía, el 16/11/2026:
//
//     «Va VACÍA a propósito: es para escribir a mano quién auditó esa sección. El sistema no
//      tiene de dónde sacarla —en Odoo no hay un auditor por movimiento— y una columna con un
//      dato inventado sería peor que una en blanco.»
//
// La premisa resultó falsa. Cuando alguien audita, Odoo crea un movimiento GEMELO del original
// —misma tienda, misma sección, las mismas líneas— con la palabra AUDITORIA delante del origen y
// **el auditor como responsable**:
//
//     Abastecimiento Comida 53VAL 19/11/2026              Pickers 16 · 89 líneas · validado 12:49
//     AUDIOTORIA Abastecimiento Comida 53VAL 19/11/2026   Movimiento interno · 89 · validado 13:38
//
// No hay nada que inventar: el origen dice de qué celda es. Se descubrió persiguiendo por qué
// 53VAL Comida aparecía con dos personas.
//
// ── SE EMPAREJA POR TIENDA, SECCIÓN Y **FECHA DEL ORIGEN** ────────────────────────────────────
//
// La fecha importa y es el detalle que cambia el resultado. Una auditoría se cierra cuando se
// cierra, no el día del trabajo: medido el 18/11/2026, `99REC/DT/153125` decía
//
//     AUDITORIA Abastecimiento Comida 62PLD 17/11/2026     ← creada el 18, pero audita el 17
//
// Emparejando por el día en que se hizo, esa auditoría caía en la celda del 18 —que ya tenía otro
// auditor— y el trabajo del 17 quedaba sin ninguno. Con la fecha del origen cada una cae donde
// corresponde: medido sobre 7 días hábiles, **cero celdas con dos auditores distintos**.
//
// Tampoco se empareja por cantidad de líneas, aunque suelan coincidir: el 19/11, 09LEO Hogar tuvo
// 71 líneas y su auditoría 70. Por el número habrían quedado las dos sueltas.
//
// ── LO QUE NO ALCANZA A MOSTRAR ───────────────────────────────────────────────────────────────
//
// Una auditoría validada DESPUÉS de medianoche no aparece en la planilla de su día: la consulta
// trae lo del día, y esa quedó en el siguiente. Es el caso del 62PLD de arriba. No se inventa un
// relleno: la celda sale sin auditor, igual que las siete de cada diez que no se auditan.

import { esAuditoria } from '@/features/despacho/shared/aperturaOdoo';
import { categoriaDeOrigin } from '@/features/despacho/shared/aperturaOdoo';
import { resolveStoreCode } from '@/features/picking/picking-utils';
import { SECCIONES, type SeccionPlanilla } from './armarPlanilla';
import type { MovimientoOdoo } from './desdeOdoo';

const ES_SECCION = new Set<string>(SECCIONES);

/** Quién auditó una celda. */
export interface AuditorCelda {
  /** El nombre de la persona, ya traducido con `picker_canonical_names`. */
  nombre: string;
  /** La cuenta cruda de Odoo. Es lo que permite comparar contra el picker sin ambigüedad. */
  cuenta: string;
  /** Hora de validación, `HH:MM`. La auditoría no tiene hora de asignación: no hay lapso. */
  hora: string | null;
}

/** La llave de una celda de la planilla. */
export function claveCelda(cod: string, seccion: SeccionPlanilla): string {
  return `${cod}|${seccion}`;
}

/**
 * La fecha `YYYY-MM-DD` escrita en el origen, o `null` si no trae ninguna.
 *
 * Los origenes la llevan al final, en formato chileno: «Abastecimiento Comida 53VAL 19/11/2026».
 * Se exige el año de cuatro dígitos a propósito: un «19/11/26» no es lo que escribe Odoo, y
 * adivinar el siglo sería inventar.
 */
export function fechaDeOrigen(origin: string | null | undefined): string | null {
  const m = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(String(origin ?? ''));
  if (!m) return null;
  const [, d, mes, a] = m;
  const n = Number(mes);
  if (n < 1 || n > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${a}-${mes}-${d}`;
}

/**
 * Los auditores de cada celda, a partir de los movimientos crudos del día.
 *
 * Recibe TODOS los crudos y se queda solo con las auditorías: es la contracara de
 * `movimientosDesdeOdoo`, que se queda con todo menos ellas. Las dos usan `esAuditoria`, así que
 * ningún movimiento puede contarse en las dos ni caerse de las dos.
 *
 * `diaPorTienda` dice qué día le corresponde a cada tienda —para una apertura no es el de hoy—, y
 * es contra ese día que se compara la fecha del origen.
 *
 * Una auditoría sin fecha en el origen se empareja por el día en que se consultó, que es lo que
 * se hacía antes de saber de la fecha. Medido en 7 días hábiles: **una** sola celda en ese caso.
 */
export function auditoresPorCelda(
  crudos: readonly MovimientoOdoo[],
  nombres: Readonly<Record<string, string>>,
  diaPorTienda: ReadonlyMap<string, string>,
): Map<string, AuditorCelda[]> {
  const out = new Map<string, AuditorCelda[]>();

  for (const m of crudos) {
    if (!esAuditoria(m.origin)) continue;

    const cat = categoriaDeOrigin(m.origin);
    if (!cat || !ES_SECCION.has(cat)) continue;
    const cod = resolveStoreCode({ toLocation: m.toLocation, origin: m.origin, partner: m.partner });
    if (!cod) continue;

    const suDia = diaPorTienda.get(cod);
    if (!suDia) continue;
    if ((fechaDeOrigen(m.origin) ?? m.dia) !== suDia) continue;

    const cuenta = (m.responsable ?? '').trim();
    if (!cuenta) continue;   // una auditoría sin responsable no dice quién auditó

    const clave = claveCelda(cod, cat as SeccionPlanilla);
    const lista = out.get(clave) ?? [];
    // La misma persona puede tener dos movimientos de auditoría sobre la misma celda —pasó el
    // 18/11 en 62PLD Comida, con 37 y 31 líneas—. Es una sola persona y va una sola vez.
    if (!lista.some(a => a.cuenta === cuenta)) {
      lista.push({ nombre: nombres[cuenta] ?? cuenta, cuenta, hora: horaDe(m.validadoEn) });
    }
    out.set(clave, lista);
  }

  return out;
}

/** `HH:MM` de una marca de Odoo, que viene en UTC sin zona. `null` si no hay. */
function horaDe(validadoEn: string | null): string | null {
  if (!validadoEn) return null;
  const iso = validadoEn.includes('T') ? validadoEn : validadoEn.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/**
 * ¿El auditor es la misma cuenta que pickeó?
 *
 * Pasa poco y no es un error del sistema —puede ocurrir—, pero conviene que se vea. El 19/11/2026
 * fue `Bodega Web` en 76PAN, en Comida y en Hogar. Se compara por CUENTA y no por nombre: dos
 * cuentas distintas pueden mostrar la misma persona, y ahí no se auditó a sí mismo.
 */
export function seAuditoSolo(cuentasDelPicker: readonly string[], auditor: AuditorCelda): boolean {
  return cuentasDelPicker.some(c => c.trim() === auditor.cuenta);
}
