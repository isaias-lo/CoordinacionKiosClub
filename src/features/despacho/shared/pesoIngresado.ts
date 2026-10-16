// El campo Peso de Bodega: qué se puede teclear y qué se hace con lo tecleado. Puro y testeable.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────────────────────
//
// El 28/09 el pallet 2 de 55ITA quedó registrado con 9.357 kg. Odoo dice que esa tienda recibió
// 606,28 kg en TODO el día, y en bodega se pesaron 234 kg entre las otras seis unidades: ese pallet
// no pudo pesar más de unos 372 kg. Debajo del número hay una coma perdida — «353,7» convertido
// en «3537», o «935,7» en «9357».
//
// La causa es el campo mismo. Era `<input type="number">`, y la coma NO es un carácter válido en un
// campo numérico de HTML: el navegador la descarta y los dígitos quedan pegados. El punto sí
// funcionaba —en el histórico hay 93 pesos escritos con punto—, pero la balanza dice «353,7» y en
// Chile nadie escribe «353.7». O sea: el separador que todo el mundo usa era justamente el único
// que se perdía, y se perdía EN SILENCIO, multiplicando el peso por diez.
//
// Por eso el campo pasa a ser de texto con teclado decimal, y la traducción se hace acá.
//
// ⚠ CUIDADO AL TOCAR ESTO: desde que el campo acepta comas, TODO lo que lea ese texto tiene que
// pasar por `leerPeso`. `parseFloat('353,7')` devuelve 353 sin quejarse. Cambiar el input y dejar
// un `parseFloat` suelto no arregla el bug: lo esconde mejor.
//
// ── EL AVISO ───────────────────────────────────────────────────────────────────────────────────
//
// Con la coma andando un dedo igual puede resbalar, así que además se avisa cuando el número no da.
// Los topes NO son inventados: salen de los 7.194 pesos reales de la base (14/05 a 29/09/2026).
//
//     clase        n       mediana   p90    p99    tope    avisaría en
//     ─────────────────────────────────────────────────────────────────────────
//     pallet       4.234     219     490    692     800    12 casos  (0,28%)
//     bulto          676      23      36     70     150     2 casos  (0,30%)
//     chocolate    2.267      20      20     25      60     1 caso   (0,04%)
//     contenedor      16     165     352    380     600     0 casos
//
// Quince avisos en cuatro meses y medio: uno cada dos semanas. No le molesta la vida a nadie, y el
// 9.357 habría chocado con el tope de 800 en el momento, con la persona todavía frente a la balanza
// y el pallet todavía arriba.
//
// El aviso PREGUNTA, no bloquea. Puede existir un pallet de verdad pesadísimo, y quien lo tiene
// delante sabe más que este archivo. Lo que no puede pasar es que se guarde sin que nadie lo mire.

import type { ClaseEnvase } from './numeroCard';

/** Por encima de esto se pregunta antes de guardar. Medido, no estimado — ver la tabla de arriba. */
export const TOPE_AVISO_KG: Record<ClaseEnvase, number> = {
  pallet: 800,
  contenedor: 600,
  bulto: 150,
  chocolate: 60,
  // Una adquisición y un web/retiro no se pesan —`pideMedidas` es false y nacen completos—, así
  // que estos dos no se consultan nunca. Van con el número del bulto, que es el envase al que se
  // parecen, para que el día que alguno SÍ se pese el aviso ya esté puesto.
  adquisicion: 150,
  webretiro: 150,
};

/**
 * Por encima de esto NO se guarda, ni confirmando. El techo de cordura.
 *
 * Estos números no son nuevos: son los que Bodega Nacional ya venía usando en `LIMITES`
 * (`regiones/data/tiendas.ts`), con el comentario que lo explica desde el 22/09 —
 * *"solo para atajar un tipeo (2500 en vez de 25) antes de que llegue al manifiesto"*. Vivían solo
 * en Nacional; RM/Costa no tenía ningún tope, y por eso el 9.357 de 55ITA —que es RM— entró sin
 * tropezar con nada. Ahora la definición es ÚNICA y los dos espejos la usan, que es la regla del
 * repositorio para todo lo de Bodega.
 *
 * El aviso de `TOPE_AVISO_KG` pega mucho antes, así que llegar hasta acá ya significa haber
 * ignorado una pregunta. Entre los dos: 800 pregunta, 1.000 no deja.
 */
export const TOPE_DURO_KG: Record<ClaseEnvase, number> = {
  pallet: 1000,
  contenedor: 1000,
  bulto: 500,
  chocolate: 500,
  adquisicion: 500,
  webretiro: 500,
};

// ── EL OTRO EXTREMO: UN PALLET DE 1 KG (14/10/2026) ───────────────────────────────────────────
//
// El 14/10 el P2 de 06MQH quedó en 1 kg a las 15:51, y otra persona lo corrigió a 368 kg a las
// 16:12. Veintiún minutos con un dato falso, y el techo de 800 no lo podía atajar: 1 está por
// DEBAJO, no por encima.
//
// Un piso único no sirve, porque depende del envase. Medido sobre lo pesado desde el 01/09/2026:
//
//     clase        n      el más liviano real   p01    p05    bajo 20 kg
//     ──────────────────────────────────────────────────────────────────
//     pallet      829           23,55            46     85         0
//     bulto       187            1,00           2,72     5        112
//     chocolate   496            1,70           5,00    7,6       371
//
// Un pallet de 1 kg no existe; un bulto de 1 kg es lo normal y un chocolate de 1,7 también. Por
// eso el piso es SOLO del pallet: avisa bajo 40 (por debajo del p01) y no deja pasar bajo 10, que
// está lejísimos de cualquier pallet real.
//
// Al contenedor no se le pone piso: hay 16 en todo el histórico, muy pocos para fijar un número
// sin inventarlo. `null` acá significa "no se sabe", no "no importa".

/** Por debajo de esto se pregunta. `null` = este envase no tiene piso. */
export const PISO_AVISO_KG: Record<ClaseEnvase, number | null> = {
  pallet: 40,
  contenedor: null, bulto: null, chocolate: null, adquisicion: null, webretiro: null,
};

/** Por debajo de esto NO se guarda, ni confirmando. `null` = este envase no tiene piso. */
export const PISO_DURO_KG: Record<ClaseEnvase, number | null> = {
  pallet: 10,
  contenedor: null, bulto: null, chocolate: null, adquisicion: null, webretiro: null,
};

/**
 * El mensaje cuando el peso no se puede guardar ni confirmando, o `null` si entra.
 *
 * Mira los DOS extremos. Antes se llamaba `excedeTopeDuro` y solo miraba el techo; el nombre
 * cambió junto con la función para que no mienta.
 */
export function pesoFueraDeRango(kg: number | null, clase: ClaseEnvase): string | null {
  if (kg === null || !Number.isFinite(kg) || kg <= 0) return null;
  const tope = TOPE_DURO_KG[clase];
  if (kg > tope) return `Peso máximo ${enKg(tope)} kg para ${NOMBRE[clase]} — ¿se perdió la coma?`;
  const piso = PISO_DURO_KG[clase];
  if (piso !== null && kg < piso) {
    return `Peso mínimo ${enKg(piso)} kg para ${NOMBRE[clase]} — ¿se pesó el pallet completo?`;
  }
  return null;
}

/**
 * Texto tecleado → kilos.
 *
 * La coma es separador decimal, igual que en la balanza. El punto también se acepta: es lo que
 * escribieron 93 veces en el histórico y lo que produce `String(numero)` al reconstruir una fila
 * guardada, así que rechazarlo rompería la vuelta.
 *
 * Devuelve `null` para todo lo que no sea un peso utilizable —vacío, letras, cero, negativo—, que
 * es distinto de devolver 0: 0 significaría "pesa cero" y el sistema entero lee eso como
 * "sin pesar" (`esSinPesar`).
 */
export function leerPeso(texto: unknown): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) && texto > 0 ? texto : null;
  const crudo = String(texto ?? '').trim();
  if (!crudo) return null;
  // Un peso negativo no existe, y limpiar el signo lo convertiría en su positivo sin avisar.
  if (crudo.startsWith('-')) return null;
  // EN ESTE CAMPO UN SEPARADOR ES SIEMPRE DECIMAL, nunca de miles: acá no se pesa nada que llegue
  // a los mil kilos, así que «1.200» es mucho más probablemente 1,2 que 1.200. Cuando hay más de
  // uno manda el último, que es lo que hace que «1.234,5» llegue entero igual.
  const soloValidos = crudo.replace(/[^\d.,]/g, '');
  if (!soloValidos || !/\d/.test(soloValidos)) return null;
  const corte = Math.max(soloValidos.lastIndexOf(','), soloValidos.lastIndexOf('.'));
  const entero = (corte === -1 ? soloValidos : soloValidos.slice(0, corte)).replace(/[.,]/g, '');
  const decimal = corte === -1 ? '' : soloValidos.slice(corte + 1).replace(/[.,]/g, '');
  const n = Number(`${entero || '0'}.${decimal || '0'}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lo tecleado, limpio, PARA SEGUIR TECLEANDO.
 *
 * No convierte a número ni completa nada: tiene que dejar pasar los estados intermedios —«353,» es
 * lo que hay en la pantalla justo antes de escribir el 7— o el campo se pelearía con los dedos.
 * Solo saca lo que no puede ser parte de un peso y deja un único separador.
 */
export function limpiarTecleo(texto: string): string {
  const soloValidos = String(texto ?? '').replace(/[^\d.,]/g, '');
  const corte = soloValidos.search(/[.,]/);
  if (corte === -1) return soloValidos;
  const sep = soloValidos[corte];
  // Del separador en adelante, solo dígitos: un segundo punto o coma se descarta en vez de
  // convertir «35,5,5» en algo que `leerPeso` tendría que adivinar.
  return soloValidos.slice(0, corte) + sep + soloValidos.slice(corte + 1).replace(/[.,]/g, '');
}

export interface AvisoPeso {
  kg: number;
  /** El umbral que se cruzó: el techo si `lado` es alto, el piso si es bajo. */
  tope: number;
  clase: ClaseEnvase;
  /** De qué lado se fue el número. El aviso se lee distinto según cuál. */
  lado: 'alto' | 'bajo';
  titulo: string;
  detalle: string;
}

/**
 * El aviso cuando el peso no da, o `null` cuando es un peso normal.
 *
 * Se nombra la coma explícitamente porque es la causa conocida: quien vea el aviso tiene que poder
 * darse cuenta en dos segundos de qué le pasó.
 */
export function avisoDePeso(kg: number | null, clase: ClaseEnvase): AvisoPeso | null {
  if (kg === null || !Number.isFinite(kg) || kg <= 0) return null;

  // El extremo bajo. Mismo criterio que el alto: PREGUNTA, no bloquea.
  const piso = PISO_AVISO_KG[clase];
  if (piso !== null && kg < piso) {
    return {
      kg, tope: piso, clase, lado: 'bajo',
      titulo: `${enKg(kg)} kg en un ${NOMBRE[clase]}`,
      detalle: `Es muy poco: el ${NOMBRE[clase]} más liviano del último mes y medio pesó 23,55 kg. `
             + `Fíjate si la balanza alcanzó a estabilizarse y si pesaste la unidad completa.`,
    };
  }

  const tope = TOPE_AVISO_KG[clase];
  if (kg <= tope) return null;

  // NO se sugiere un número corregido. La tentación es ofrecer "¿serán 935,7?" —el peso dividido
  // por diez— pero eso es adivinar: un 942 mal tecleado puede ser 442, y poner una cifra concreta
  // delante de alguien apurado invita a aceptarla sin pensar. La balanza está ahí al lado; lo que
  // hace falta es que vuelva a mirarla, no que este aviso opine.
  return {
    kg, tope, clase, lado: 'alto',
    titulo: `${enKg(kg)} kg en un ${NOMBRE[clase]}`,
    detalle: `Lo normal es menos de ${enKg(tope)} kg. Fíjate si se perdió la coma —353,7 no es lo `
           + `mismo que 3537— y si el número es el correcto, guárdalo igual.`,
  };
}

const NOMBRE: Record<ClaseEnvase, string> = {
  pallet: 'pallet', contenedor: 'contenedor', bulto: 'bulto', chocolate: 'chocolate',
  adquisicion: 'agregado', webretiro: 'agregado',
};

/** `9.357` / `353,7` — como se escriben los números en Chile. */
export function enKg(n: number): string {
  return n.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}
