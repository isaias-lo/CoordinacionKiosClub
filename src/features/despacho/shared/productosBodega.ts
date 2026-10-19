// Productos de Odoo para pesar bultos en Bodega. Puro: sin red ni UI.
//
// ── QUÉ ────────────────────────────────────────────────────────────────────────────────────────
//
// En /admin/sistema el administrador trae un producto de Odoo por su código y lo guarda en
// `productos_bodega` (ver sql/2026-10-19_productos_bodega.sql). En Bodega, al pesar un bulto, la
// handheld escanea el código de barras del producto, se busca acá, y el peso del bulto sale de
// peso unitario × cantidad. Sigue siendo UN bulto: la cantidad es de unidades dentro de él.
//
// Las medidas del producto son de UNA unidad, así que no se copian al bulto: el alto, ancho y
// largo del bulto los sigue poniendo quien pesa.

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

// ── Desde Odoo ─────────────────────────────────────────────────────────────────────────────────

/**
 * Campos de medidas que puede tener `product.product`, en orden de preferencia. Odoo no trae
 * medidas de serie: dependen del módulo instalado (`product_dimension` de OCA usa los
 * `product_*`). La ruta pregunta a Odoo cuáles existen (`fields_get`) y pide solo esos.
 */
export const CAMPOS_MEDIDA = {
  alto:  ['product_height', 'height'],
  ancho: ['product_width', 'width'],
  largo: ['product_length', 'length'],
} as const;

/** Los campos que se le piden a Odoo, dados los que existen en `product.product`. */
export function camposAPedir(existentes: Iterable<string>): string[] {
  const hay = new Set(existentes);
  const base = ['id', 'default_code', 'name', 'barcode', 'weight'];
  const extra = ['weight_uom_name', 'dimensional_uom_id'];
  const medidas = Object.values(CAMPOS_MEDIDA).flatMap(c => c.find(f => hay.has(f)) ?? []);
  return [...base.filter(f => hay.has(f) || f === 'id' || f === 'name'), ...extra.filter(f => hay.has(f)), ...medidas];
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
}

/**
 * Un registro de `product.product` (de `search_read`) en el formato de `productos_bodega`.
 *
 * Odoo devuelve `false` en los campos vacíos; acá quedan `null`. El peso se pasa a kg y las
 * medidas a cm según la unidad que Odoo declare. Sin unidad declarada para las medidas, quedan
 * como vienen y se marca `medidasSinConvertir` para que el administrador las mire.
 */
export function productoDesdeOdoo(r: Record<string, unknown>, codigoBuscado: string): ProductoDeOdoo {
  const unidadPeso = typeof r.weight_uom_name === 'string' ? r.weight_uom_name.trim().toLowerCase() : 'kg';
  const pesoCrudo = numeroOdoo(r.weight);
  const pesoKg = pesoCrudo == null ? null : redondear(pesoCrudo * (A_KG[unidadPeso] ?? 1), 3);

  const uom = Array.isArray(r.dimensional_uom_id) && typeof r.dimensional_uom_id[1] === 'string'
    ? r.dimensional_uom_id[1].trim().toLowerCase() : null;
  const factor = uom != null ? A_CM[uom] : undefined;
  const medida = (campos: readonly string[]): number | null => {
    const campo = campos.find(c => c in r);
    const v = campo ? numeroOdoo(r[campo]) : null;
    if (v == null) return null;
    return redondear(factor != null ? v * factor : v, 2);
  };
  const alto = medida(CAMPOS_MEDIDA.alto);
  const ancho = medida(CAMPOS_MEDIDA.ancho);
  const largo = medida(CAMPOS_MEDIDA.largo);

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
