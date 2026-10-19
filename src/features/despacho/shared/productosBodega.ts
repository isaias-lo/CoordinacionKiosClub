// Productos de Odoo para pesar bultos en Bodega. Puro: sin red ni UI.
//
// ── QUÉ ────────────────────────────────────────────────────────────────────────────────────────
//
// En /admin/sistema el administrador trae un producto de Odoo por su código y lo guarda en
// `productos_bodega` (ver sql/2026-10-19_productos_bodega.sql). En Bodega, al pesar un bulto, la
// handheld escanea el código de barras del producto, se busca acá, y el peso del bulto sale de
// peso unitario × cantidad. Sigue siendo UN bulto: la cantidad es de unidades dentro de él.
//
// Las medidas del producto guardadas en la base también se copian al bulto (pedido de Isaias del
// 19/10/2026: al escanear solo llegaba el peso). Ver `camposDesdeProducto`.

export interface ProductoBodega {
  codigo: string;
  odoo_id: number | null;
  barcode: string | null;
  nombre: string;
  peso_kg: number | null;
  alto_cm: number | null;
  ancho_cm: number | null;
  largo_cm: number | null;
}

/** Código de producto como lo guarda Odoo en `default_code`: sin corchetes, sin espacios, mayúsculas. */
export function normalizarCodigo(codigo: string): string {
  return codigo.replace(/[\[\]]/g, '').trim().toUpperCase();
}

/**
 * Llave para comparar códigos de barras.
 *
 * Un mismo EAN puede llegar con o sin ceros a la izquierda: la pistola lee un UPC-A de 12 dígitos
 * y Odoo lo tiene guardado como EAN-13 con un 0 delante (o al revés). Si el código es solo
 * dígitos, se comparan sin esos ceros; si tiene letras, tal cual en mayúsculas.
 */
export function llaveBarcode(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  return /^\d+$/.test(limpio) ? limpio.replace(/^0+(?=\d)/, '') : limpio;
}

/**
 * El producto que corresponde a lo que leyó la pistola. Primero por código de barras; si no hay,
 * por código de Odoo (hay etiquetas internas que imprimen el `default_code`). `null` si no está.
 */
export function buscarProducto<P extends Pick<ProductoBodega, 'codigo' | 'barcode'>>(lista: P[], leido: string): P | null {
  const texto = leido.trim();
  if (!texto) return null;
  const llave = llaveBarcode(texto);
  const porBarcode = lista.find(p => p.barcode && llaveBarcode(p.barcode) === llave);
  if (porBarcode) return porBarcode;
  const codigo = normalizarCodigo(texto);
  return lista.find(p => p.codigo === codigo) ?? null;
}

/**
 * Tope de unidades en un bulto. Más que eso no es una cantidad: es un código de barras que la
 * pistola escribió en el campo Cantidad (ver `EscanearProducto.tsx`).
 */
export const MAX_CANTIDAD = 9999;

/**
 * Peso del bulto: peso unitario × cantidad, en kg con dos decimales (como el campo Peso).
 * `null` si no se puede calcular: producto sin peso en Odoo, o cantidad que no es un entero entre 1 y `MAX_CANTIDAD`.
 */
export function pesoPorCantidad(pesoUnitarioKg: number | null, cantidad: string): number | null {
  if (pesoUnitarioKg == null || !Number.isFinite(pesoUnitarioKg) || pesoUnitarioKg <= 0) return null;
  const texto = cantidad.trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  if (n <= 0 || n > MAX_CANTIDAD) return null;
  return Math.round(pesoUnitarioKg * n * 100) / 100;
}

/** El peso en el formato del campo Peso de la tarjeta (coma decimal, como se teclea). */
export function pesoParaCampo(kg: number): string {
  return String(kg).replace('.', ',');
}

export interface CamposDelBulto { peso: string; alto?: string; ancho?: string; largo?: string }

/**
 * Lo que «Escanear producto» escribe en la tarjeta del bulto: el peso (unitario × cantidad) y las
 * medidas del producto guardadas en la base, las que tenga. `null` si no se puede calcular el peso.
 * Las medidas van tal cual (en Bodega los productos guardados son el bulto mismo: una silla, una
 * reposera en su caja); se pueden corregir a mano como cualquier campo.
 */
export function camposDesdeProducto(p: Pick<ProductoBodega, 'peso_kg' | 'alto_cm' | 'ancho_cm' | 'largo_cm'>, cantidad: string): CamposDelBulto | null {
  const peso = pesoPorCantidad(p.peso_kg, cantidad);
  if (peso == null) return null;
  const out: CamposDelBulto = { peso: pesoParaCampo(peso) };
  // Los campos de medidas de la tarjeta son `type="number"`: punto decimal.
  if (p.alto_cm != null && p.alto_cm > 0) out.alto = String(p.alto_cm);
  if (p.ancho_cm != null && p.ancho_cm > 0) out.ancho = String(p.ancho_cm);
  if (p.largo_cm != null && p.largo_cm > 0) out.largo = String(p.largo_cm);
  return out;
}

// ── Desde Odoo ─────────────────────────────────────────────────────────────────────────────────

/**
 * Campos de medidas que puede tener `product.product`, en orden de preferencia. Odoo no trae
 * medidas de serie: dependen del módulo instalado (`product_dimension` de OCA usa los
 * `product_*`) o de campos propios (`x_…`, de Studio). La ruta pregunta a Odoo qué campos
 * existen (`fields_get`) y elige con `camposMedidaDe`.
 */
export const CAMPOS_MEDIDA = {
  alto:  ['product_height', 'height', 'x_alto', 'x_altura', 'x_studio_alto', 'x_studio_altura'],
  ancho: ['product_width', 'width', 'x_ancho', 'x_studio_ancho'],
  largo: ['product_length', 'length', 'x_largo', 'x_longitud', 'x_studio_largo', 'x_studio_longitud'],
} as const;

/** Si el nombre técnico no está en la lista, se reconoce por la etiqueta que Odoo le pone. */
const ETIQUETA_MEDIDA = {
  alto:  /\b(alto|altura|height)\b/i,
  ancho: /\b(ancho|width)\b/i,
  largo: /\b(largo|longitud|length|profundidad|depth)\b/i,
} as const;

/** Lo que devuelve `fields_get` de Odoo: nombre técnico → tipo y etiqueta. */
export type DefinicionCampos = Record<string, { type?: string; string?: string }>;

export type CamposMedida = Partial<Record<keyof typeof CAMPOS_MEDIDA, string>>;

const esNumerico = (d?: { type?: string }) => d?.type === 'float' || d?.type === 'integer';

/**
 * Qué campo de Odoo es el alto, el ancho y el largo. Primero por nombre técnico conocido; si no,
 * por la etiqueta de un campo numérico (en español o inglés). Un campo de unidad, cantidad o de
 * embalaje no cuenta aunque su etiqueta diga «largo».
 */
export function camposMedidaDe(def: DefinicionCampos): CamposMedida {
  const out: CamposMedida = {};
  const usados = new Set<string>();
  for (const k of Object.keys(CAMPOS_MEDIDA) as (keyof typeof CAMPOS_MEDIDA)[]) {
    let campo: string | undefined = CAMPOS_MEDIDA[k].find(c => esNumerico(def[c]));
    if (!campo) {
      campo = Object.keys(def).sort().find(c =>
        !usados.has(c) && esNumerico(def[c]) && !/uom|qty|count|packag/i.test(c)
        && ETIQUETA_MEDIDA[k].test(def[c].string ?? ''));
    }
    if (campo) { out[k] = campo; usados.add(campo); }
  }
  return out;
}

/** Los campos que se le piden a Odoo, dados los que existen en `product.product`. */
export function camposAPedir(def: DefinicionCampos): string[] {
  const base = ['id', 'default_code', 'name', 'barcode', 'weight'].filter(f => f === 'id' || f === 'name' || f in def);
  const extra = ['weight_uom_name', 'dimensional_uom_id'].filter(f => f in def);
  return [...base, ...extra, ...Object.values(camposMedidaDe(def))];
}

/**
 * Los campos numéricos con valor de un producto (y los de texto con nombre de medida), para cuando no se encontraron medidas: así el
 * administrador ve en /admin/sistema dónde las guarda su Odoo y se puede agregar el nombre arriba.
 */
export function camposNumericosConValor(r: Record<string, unknown>, def: DefinicionCampos): CampoConValor[] {
  return Object.keys(r)
    .filter(c => c !== 'id' && !c.endsWith('_id') && (
      (esNumerico(def[c]) && typeof r[c] === 'number' && (r[c] as number) > 0)
      // Medidas escritas como texto («150x68x52»), en un campo de texto con nombre de medida.
      || (esTextoDeMedida(def[c]) && typeof r[c] === 'string' && (r[c] as string).trim() !== '')))
    .sort()
    .map(c => ({ campo: c, etiqueta: def[c].string ?? c, valor: r[c] as number | string }));
}

export interface CampoConValor { campo: string; etiqueta: string; valor: number | string }

/** Campos de texto que podrían guardar medidas, para el diagnóstico. */
export function esTextoDeMedida(d?: { type?: string; string?: string }): boolean {
  return d?.type === 'char' && /medida|dimensi|alto|altura|ancho|largo|tama/i.test(d.string ?? '');
}

const A_CM: Record<string, number> = { mm: 0.1, cm: 1, m: 100, in: 2.54, ft: 30.48 };
const A_KG: Record<string, number> = { g: 0.001, kg: 1, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523 };

function numeroOdoo(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export interface ProductoDeOdoo extends ProductoBodega {
  /** Unidad en que Odoo tiene las medidas, si la dice. Las de arriba ya van en cm cuando se conoce. */
  unidadMedidas: string | null;
  /** Las medidas venían en una unidad desconocida y quedaron sin convertir: revisarlas antes de guardar. */
  medidasSinConvertir: boolean;
  /** Sin medidas: los campos numéricos con valor que sí trae este producto. Ver `camposNumericosConValor`. */
  otrosCampos?: CampoConValor[];
}

/**
 * Un registro de `product.product` (de `search_read`) en el formato de `productos_bodega`.
 *
 * Odoo devuelve `false` en los campos vacíos; acá quedan `null`. El peso se pasa a kg y las
 * medidas a cm según la unidad que Odoo declare. Sin unidad declarada para las medidas, quedan
 * como vienen y se marca `medidasSinConvertir` para que el administrador las mire.
 */
export function productoDesdeOdoo(r: Record<string, unknown>, codigoBuscado: string, campos: CamposMedida = {}): ProductoDeOdoo {
  const unidadPeso = typeof r.weight_uom_name === 'string' ? r.weight_uom_name.trim().toLowerCase() : 'kg';
  const pesoCrudo = numeroOdoo(r.weight);
  const pesoKg = pesoCrudo == null ? null : redondear(pesoCrudo * (A_KG[unidadPeso] ?? 1), 3);

  const uom = Array.isArray(r.dimensional_uom_id) && typeof r.dimensional_uom_id[1] === 'string'
    ? r.dimensional_uom_id[1].trim().toLowerCase() : null;
  const factor = uom != null ? A_CM[uom] : undefined;
  const medida = (campo: string | undefined): number | null => {
    const v = campo ? numeroOdoo(r[campo]) : null;
    if (v == null) return null;
    return redondear(factor != null ? v * factor : v, 2);
  };
  const alto = medida(campos.alto);
  const ancho = medida(campos.ancho);
  const largo = medida(campos.largo);

  return {
    codigo: typeof r.default_code === 'string' && r.default_code.trim() ? normalizarCodigo(r.default_code) : normalizarCodigo(codigoBuscado),
    odoo_id: typeof r.id === 'number' ? r.id : null,
    barcode: typeof r.barcode === 'string' && r.barcode.trim() ? r.barcode.trim() : null,
    nombre: typeof r.name === 'string' ? r.name : '',
    peso_kg: pesoKg,
    alto_cm: alto,
    ancho_cm: ancho,
    largo_cm: largo,
    unidadMedidas: uom,
    medidasSinConvertir: factor == null && (alto != null || ancho != null || largo != null),
  };
}

// ── Lo que manda el administrador ──────────────────────────────────────────────────────────────

/** Un número opcional y no negativo tal como viene del formulario o del cuerpo de la petición. */
function numeroOpcional(v: unknown): number | null | 'invalido' {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 'invalido';
  return n;
}

/**
 * Valida el producto que se va a guardar. Devuelve la fila lista para `upsert` o el motivo del
 * rechazo. La ruta lo usa antes de escribir: un valor raro no llega a la base.
 */
export function validarProducto(cuerpo: unknown): { ok: true; fila: ProductoBodega } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'Faltan los datos del producto' };
  const c = cuerpo as Record<string, unknown>;
  const codigo = typeof c.codigo === 'string' ? normalizarCodigo(c.codigo) : '';
  if (!codigo) return { ok: false, error: 'Falta el código del producto' };
  const nombre = typeof c.nombre === 'string' ? c.nombre.trim() : '';
  if (!nombre) return { ok: false, error: 'Falta el nombre del producto' };
  const barcode = typeof c.barcode === 'string' && c.barcode.trim() ? c.barcode.trim() : null;

  const nums = { peso_kg: c.peso_kg, alto_cm: c.alto_cm, ancho_cm: c.ancho_cm, largo_cm: c.largo_cm };
  const leidos: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(nums)) {
    const n = numeroOpcional(v);
    if (n === 'invalido') return { ok: false, error: `Valor inválido en ${k.replace('_', ' ')}` };
    leidos[k] = n;
  }
  const odooId = typeof c.odoo_id === 'number' && Number.isInteger(c.odoo_id) ? c.odoo_id : null;

  return {
    ok: true,
    fila: {
      codigo, odoo_id: odooId, barcode, nombre,
      peso_kg: leidos.peso_kg, alto_cm: leidos.alto_cm, ancho_cm: leidos.ancho_cm, largo_cm: leidos.largo_cm,
    },
  };
}
