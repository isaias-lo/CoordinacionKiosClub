'use client';

// De qué CAJA es un chocolate, dicho en la tarjeta donde se pesa.
//
// ── POR QUÉ (16/10/2026) ──────────────────────────────────────────────────────────────────────
//
// El coordinador: «necesito que en la tarjeta del formulario podamos ver si lo que estoy
// ingresando de CH es caja cartón o caja negra».
//
// El dato YA estaba. La tarjeta decía «Caja Negra · 80×56×42 cm fijas» — en 11 px, café sobre
// café claro, el tono más apagado de la pantalla, compitiendo con una medida que nadie necesita
// leer. Las dos cajas compartían color, tamaño y posición: solo cambiaban dos palabras. En una
// handheld, a un brazo de distancia, se perdía.
//
// ── POR QUÉ UNA PÍLDORA Y NO UNA BANDA ────────────────────────────────────────────────────────
//
// La píldora entra en la línea que YA existe (la del `CH2` y quien armó la unidad), así que no
// agrega una sola fila: en una tienda con seis chocolates, una banda propia por tarjeta son seis
// filas más de desplazamiento con las manos ocupadas.
//
// Y la tarjeta ya tiene un bloque oscuro lleno —GUARDAR—. Otro a cinco centímetros se estorban:
// el ojo no sabe cuál mira primero.
//
// ── EL COLOR ACELERA; LA PALABRA SIGNIFICA ────────────────────────────────────────────────────
//
// La franja de la tarjeta deja contar las cajas de una tienda sin leer. Pero quien no la registre
// igual lee NEGRA o CARTÓN, que es la diferencia entre una ayuda y un código que hay que
// aprenderse. Por eso van las dos cosas y no solo el color.
//
// Se distinguen además por LUMINOSIDAD —oscura contra clara— y no solo por tono: así sirve a
// contraluz, con la pantalla sucia y para quien confunde colores.
//
// ── LA TARA VA ACÁ, PEGADA AL NOMBRE ──────────────────────────────────────────────────────────
//
// Antes vivía en el rótulo del campo de peso («se descuentan 3,3 kg de caja»), lejos de la
// palabra «Negra». Juntas, una sola mirada contesta las dos preguntas: qué caja es y cuánto se le
// va a descontar.

import { taraDeCaja, type SubtipoCaja } from './subtipoCaja';
import { enKg, palabraDeCaja } from './cajaEnLaTarjeta';

/** La píldora con el nombre de la caja y lo que se le descuenta. */
export function ChipCaja({ caja }: { caja: SubtipoCaja }) {
  const negra = caja === 'negra';
  return (
    <span className="inline-flex items-baseline gap-1.5 flex-shrink-0">
      <span
        className={`font-barlow-condensed text-apoyo font-extrabold uppercase tracking-wide rounded-full px-2 leading-5 ${
          negra
            ? 'bg-caja-negra text-caja-negra-letra'
            : 'bg-caja-carton text-caja-carton-letra border-[1.5px] border-caja-carton-borde'
        }`}>
        {palabraDeCaja(caja)}
      </span>
      <span className="text-rotulo font-bold text-text-sub tabular-nums tracking-normal normal-case whitespace-nowrap"
        title={`Se descuenta lo que pesa la caja vacía: ${enKg(taraDeCaja(caja))} kg`}>
        −{enKg(taraDeCaja(caja))} kg
      </span>
    </span>
  );
}
