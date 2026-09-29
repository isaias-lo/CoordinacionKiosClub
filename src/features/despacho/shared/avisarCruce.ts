// Dispara la escritura del CRUCE PESOS al registrar el día.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────
//
// El coordinador apretó REGISTRAR en Bodega Nacional y la hoja CRUCE PESOS no se llenó. Tenía
// razón, y la causa era que la hoja solo se escribía corriendo un script a mano: no había NADA en
// la app que la actualizara sola.
//
// Esto lo cierra. Se llama después de `sync-despacho`, no antes: el cruce lee los pesos de
// `despacho_rm` / `despacho_regiones`, y hasta que ese sync no termina esas tablas todavía no
// tienen lo que se acaba de registrar. Dispararlo antes escribiría la hoja con las celdas de peso
// vacías, que es justo el síntoma que vino a arreglar.
//
// ── POR QUÉ COMPARTIDO ─────────────────────────────────────────────────────────────────────────
//
// Bodega tiene dos espejos y cada uno tiene su propio modal de registrar. Si cada uno armara su
// llamada, bastaría un olvido para que el cruce se escribiera al registrar RM/Costa y no al
// registrar Nacional — el patrón que ya dejó el chocolate arreglado en un camino y roto en el otro.
//
// ── NUNCA ROMPE EL REGISTRO ────────────────────────────────────────────────────────────────────
//
// El registro del día es lo que importa; el cruce es un informe derivado. Si Odoo no contesta o la
// planilla falla, el día ya quedó registrado igual y la hoja se puede recargar después. Por eso
// esto no lanza nunca — mismo criterio que `logActividad`.

import { fechaChile } from '@/lib/fechaChile';

export interface ResultadoCruce {
  ok: boolean;
  agregadas?: number;
  actualizadas?: number;
  error?: string;
}

/**
 * Pide al servidor que recalcule y escriba el cruce de un día.
 *
 * `fechaISO` es el día de ARMADO —el mismo que va en la columna `fecha` de `despacho_rm` y contra
 * el que se consultan los movimientos de Odoo—, no el de despacho. Por defecto, hoy en Chile.
 *
 * Se calcula al llamar y no al montar el módulo: un registro después de medianoche con la pestaña
 * abierta desde ayer escribiría el día equivocado.
 */
export async function escribirCruceDelDia(fechaISO?: string): Promise<ResultadoCruce> {
  const fecha = fechaISO ?? fechaChile();
  try {
    const res = await fetch('/api/cruce-pesos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha }),
      // Sobrevive a que la persona navegue apenas registra, que es lo normal.
      keepalive: true,
    });
    const json = await res.json().catch(() => ({})) as ResultadoCruce;
    if (!res.ok) {
      console.error('[cruce-pesos]', res.status, json?.error);
      return { ok: false, error: json?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, agregadas: json.agregadas, actualizadas: json.actualizadas };
  } catch (e) {
    console.error('[cruce-pesos]', e);
    return { ok: false, error: String(e) };
  }
}
