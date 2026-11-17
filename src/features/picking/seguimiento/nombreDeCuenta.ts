// Traducir la CUENTA de Odoo a la persona, sin que las mayúsculas decidan. Módulo puro.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
//
// `picker_canonical_names` guarda la cuenta de Odoo como `key` y la persona como `display_name`.
// La traducción se hacía con un acceso directo al objeto:
//
//     const persona = canonicos?.[o.userName] || o.userName;        // rendimiento.ts
//
// que es exacto hasta el último carácter. Y la base y Odoo no escriben igual: medido el
// 17/11/2026, de las 30 cuentas con trabajo en noviembre hay una que no calza —Odoo devuelve
// **«Control Interno»** y el `key` de la tabla es **«control interno»**—. En octubre esa cuenta
// hizo 54 tandas y 139,1 horas, así que no es un caso de laboratorio.
//
// Hoy no se ve nada roto porque su `display_name` está vacío, y sin nombre el resultado es el
// mismo con o sin este arreglo. El día que alguien le escriba el nombre en Config, **lo escribe,
// la pantalla lo guarda y Estadísticas sigue mostrando «Control Interno»**: un cambio que se
// acepta y no se aplica, que es la peor forma de fallar.
//
// ── NO ES UNA IDEA NUEVA: ES LA REGLA QUE YA RIGE EN EL RESTO DEL FLUJO ───────────────────────
//
// El mismo problema ya estaba resuelto en los otros tres lugares donde se compara una cuenta, y
// los tres normalizan con `toLowerCase().trim()`:
//
//     PickingScreen.tsx:1102   «Case-insensitive lookup: Odoo may return "pickers 3" while
//                               canonical key is "Pickers 3".»  ← el comentario lo dice entero
//     picking-utils.ts         `isCustomPickerKey`, `buildPickerKeyList` («Dedup
//                               case-insensitive»), `isAllowedPicker`
//     StatsTab.tsx:159         el filtro de Estadísticas: `cuenta.toLowerCase().trim()`
//
// Por eso «Control Interno» **sí aparece** en la tabla: el filtro ya la deja pasar. Lo único que
// faltaba era que la traducción del nombre siguiera la misma regla. Este módulo la saca a un
// lugar con nombre y con tests, en vez de un cuarto `toLowerCase()` suelto.
//
// ── Y POR QUÉ IMPORTA MÁS QUE UN NOMBRE MAL ESCRITO ──────────────────────────────────────────
//
// Porque en `rendimientoPorPicker` el nombre **es la clave con la que se agrupan las filas**. Dos
// cuentas de la misma persona se fusionan en una sola fila solo si las dos resuelven al mismo
// nombre. Con la comparación exacta, una cuenta que difiere en una mayúscula queda como una
// persona aparte, con su propia fila y su propio ritmo — y un ritmo partido en dos no es el de
// nadie. Es el mismo motivo por el que la fusión vive ahí y no en la pantalla.

/** La forma normalizada de una cuenta de Odoo: es lo que se compara, nunca lo que se muestra. */
export function claveDeCuenta(cuenta: string): string {
  return cuenta.toLowerCase().trim();
}

/**
 * Un buscador del nombre configurado de una cuenta, tolerante a mayúsculas y espacios.
 *
 * Se arma una vez y se usa para todas las filas: construir el índice por cada búsqueda sería
 * recorrer la tabla entera unas 2.000 veces en un mes.
 *
 * Devuelve `''` cuando la cuenta no está o no tiene nombre. Un nombre vacío es un estado normal
 * —una pistola que no usa nadie— y no un error; quien llama decide qué mostrar. Ver
 * `ajustes/nombresDePicker.ts`.
 */
export function buscadorDeNombres(
  canonicos?: Readonly<Record<string, string>>,
): (cuenta: string) => string {
  if (!canonicos) return () => '';

  // El índice guarda el primer nombre NO vacío de cada clave normalizada. Si la tabla llegara a
  // tener «Control Interno» y «control interno» a la vez, gana la que tiene nombre: la otra no
  // aporta nada y dejarla ganar sería perder el dato por el orden de las claves.
  const indice = new Map<string, string>();
  for (const [key, nombre] of Object.entries(canonicos)) {
    const k = claveDeCuenta(key);
    const n = (nombre ?? '').trim();
    if (!indice.get(k) && n) indice.set(k, n);
    else if (!indice.has(k)) indice.set(k, '');
  }

  return (cuenta: string): string => {
    // El acierto exacto primero: es el caso normal y no hay por qué normalizar para nada.
    const directo = (canonicos[cuenta] ?? '').trim();
    if (directo) return directo;
    return indice.get(claveDeCuenta(cuenta)) ?? '';
  };
}

/**
 * La persona de una cuenta, o la cuenta misma cuando no hay nombre.
 *
 * Es lo que se muestra y lo que agrupa: una cuenta sin nombre configurado tiene que seguir
 * teniendo una fila con su nombre de Odoo, no quedar en blanco.
 */
export function personaDeCuenta(
  buscar: (cuenta: string) => string,
  cuenta: string,
): string {
  return buscar(cuenta) || cuenta;
}
