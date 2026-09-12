// Cómo se escribe el tipo de un camión en la tarjeta. Puro y testeable.
//
// Existe por m-08: la misma ranura de la tarjeta mezclaba dos ejes. Uno es QUÉ ES el vehículo
// (mediano, con portón, refrigerado) y otro es QUÉ LE PASA ahora (apagado, cerrado, en el mapa).
// Además el tipo es texto libre en la flota, y hoy hay 21 escrituras distintas para cuatro tipos:
// "Camion chico", "Camion Chico", "camion chico", "Camión Chico", "Camion Pequeño"… más
// "Camion Medano" (con dedazo) y "Camión Grande " con espacio al final.
//
// Acá NO se corrige la base: se normaliza para MOSTRAR. Y lo que no calza claro con un tipo
// conocido se muestra tal cual vino — es preferible repetir la palabra del usuario a inventarle
// una categoría.

export interface EtiquetaTipo {
  texto: string;
  /** false cuando no hay tipo (vacío o "Por confirmar"): la tarjeta lo muestra apagado, porque es
   *  la AUSENCIA de un dato, no un modelo de camión. */
  definido: boolean;
}

const SIN_TIPO: EtiquetaTipo = { texto: 'Tipo por confirmar', definido: false };

/** minúsculas, sin acentos, sin espacios de más. */
function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/** Cada tipo conocido con las formas en que aparece escrito hoy. */
const CANONICOS: { etiqueta: string; test: (t: string) => boolean }[] = [
  { etiqueta: 'Furgón',  test: t => t.includes('furgon') },
  { etiqueta: 'Grande',  test: t => t === 'grande' || t === 'camion grande' },
  { etiqueta: 'Mediano', test: t => t === 'mediano' || t === 'camion mediano' || t === 'camion medano' },
  { etiqueta: 'Chico',   test: t => t === 'chico' || t === 'camion chico' || t === 'pequeno' || t === 'camion pequeno' },
];

export function etiquetaTipoVehiculo(raw?: string | null): EtiquetaTipo {
  const t = normalizar(String(raw ?? ''));
  if (!t || t === 'por confirmar') return SIN_TIPO;
  for (const c of CANONICOS) if (c.test(t)) return { texto: c.etiqueta, definido: true };
  // Combinaciones como "camión mediano grande" o "camion grande /mediano": se respetan tal cual,
  // porque elegir una de las dos sería inventar.
  return { texto: String(raw).trim(), definido: true };
}
