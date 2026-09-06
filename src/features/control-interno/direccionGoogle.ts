// Traduce lo que devuelve Google a los campos del catálogo.
//
// El autocompletado de Places entrega la dirección desarmada en `address_components`. Eso resuelve
// de una tres cosas que hoy se escriben a mano y se escriben distinto cada vez: la calle y el
// número POR SEPARADO (que es como los pide Sendu), la comuna y la región.
//
// El cuidado está en la REGIÓN. Google dice "Región de La Araucanía" y el catálogo dice
// "Araucanía". Copiar el texto de Google tal cual agregaría una tercera forma de escribir lo
// mismo — exactamente el problema que tiene 60PBL con "Araucanía " (con espacio), que hace que la
// misma región se cuente dos veces. Por eso se traduce a los valores que el catálogo YA usa.
//
// Puro y testeable: recibe los componentes ya extraídos; acá no hay red ni Google.

export interface ComponenteGoogle {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface DireccionDesarmada {
  /** Solo la calle, sin número. Sendu los pide separados. */
  calle: string;
  numero: string;
  comuna: string;
  /** Región ya traducida a como la escribe el catálogo ('RM', 'Araucanía', …). */
  region: string;
}

/** Región de Google → como la escribe el catálogo. La clave va normalizada (sin tildes, minúscula). */
const REGIONES: Record<string, string> = {
  'metropolitana':                                  'RM',
  'metropolitana de santiago':                      'RM',
  'antofagasta':                                    'Antofagasta',
  'la araucania':                                   'Araucanía',
  'araucania':                                      'Araucanía',
  'biobio':                                         'Biobío',
  'coquimbo':                                       'Coquimbo',
  'los lagos':                                      'Los Lagos',
  'los rios':                                       'Los Ríos',
  'maule':                                          'Maule',
  'nuble':                                          'Ñuble',
  'ohiggins':                                       "O'Higgins",
  "libertador general bernardo o'higgins":          "O'Higgins",
  'libertador general bernardo ohiggins':           "O'Higgins",
  'valparaiso':                                     'Valparaíso',
  'atacama':                                        'Atacama',
  'tarapaca':                                       'Tarapacá',
  'arica y parinacota':                             'Arica y Parinacota',
  'aysen':                                          'Aysén',
  'aysen del general carlos ibanez del campo':      'Aysén',
  'magallanes':                                     'Magallanes',
  'magallanes y de la antartica chilena':           'Magallanes',
};

/** Minúsculas, sin tildes y sin espacios de más, para comparar sin depender de cómo venga escrito. */
function clave(s: string): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Traduce el nombre de región de Google al del catálogo.
 *
 * Le quita el prefijo "Región de/del/de la" y busca en la tabla. Si no la reconoce devuelve el
 * nombre sin ese prefijo, que es mejor que dejarlo vacío y no inventa una variante nueva.
 */
export function regionDelCatalogo(nombreGoogle: string | null | undefined): string {
  const limpio = String(nombreGoogle ?? '').trim().replace(/^regi[oó]n\s+(de\s+la\s+|del\s+|de\s+)?/i, '').trim();
  return REGIONES[clave(limpio)] ?? limpio;
}

const buscar = (cs: ComponenteGoogle[], ...tipos: string[]): ComponenteGoogle | undefined =>
  cs.find(c => tipos.some(t => c.types?.includes(t)));

/**
 * Desarma los componentes de Google en los campos del catálogo.
 *
 * La comuna sale de `locality`, y si no viene, de `administrative_area_level_3`: en Chile Google
 * usa uno u otro según la dirección, y quedarse con solo uno deja comunas vacías sin motivo.
 */
export function desarmarDireccion(componentes: ComponenteGoogle[] | null | undefined): DireccionDesarmada {
  const cs = componentes ?? [];
  return {
    calle:  buscar(cs, 'route')?.long_name?.trim() ?? '',
    numero: buscar(cs, 'street_number')?.long_name?.trim() ?? '',
    comuna: (buscar(cs, 'locality', 'administrative_area_level_3')?.long_name ?? '').trim(),
    region: regionDelCatalogo(buscar(cs, 'administrative_area_level_1')?.long_name),
  };
}
