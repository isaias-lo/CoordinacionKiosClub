/**
 * Fecha de HOY en formato ISO 'YYYY-MM-DD' según el día **LOCAL** (no UTC).
 *
 * Bodega opera en día local (Chile, UTC-4/-3). Los slots de `picking_pallets` DEBEN usar esta fecha
 * y NO `new Date().toISOString().slice(0,10)` (UTC): con UTC, pasadas las ~20:00 hora Chile el día ya
 * rodó a "mañana", así que un slot creado al tocar "Agregar" quedaba guardado bajo OTRA fecha que la
 * que leen el loader de slots, el sync del formulario y el semáforo (todos locales). Resultado: el
 * item "desaparecía" al agregar/registrar y el backfill lo revivía como borrador con dimensiones
 * ("para dar clic en Agregar"). Con varios usuarios se agravaba porque el merge cruzaba estados de
 * días distintos. Esta es la MISMA clave de día que `todayISO()` del sync (userSessionState) y que
 * los loaders de `picking_pallets`, así que create ↔ load ↔ sync nunca vuelven a divergir.
 *
 * Acepta un `Date` para poder testearla de forma determinista.
 */
export function fechaISOLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
