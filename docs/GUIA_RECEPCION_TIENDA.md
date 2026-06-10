# 📦 Guía de Recepción en Tienda — Cómo se usa

Guía simple para enseñar a quienes reciben la mercadería en la tienda.
Sirve tanto para el **conductor** que entrega como para el **control interno**.

---

## 🎯 Idea general

Cuando llega un despacho a la tienda, la persona que recibe **escanea un código**,
**confirma lo que llegó**, **toma fotos y registra los sellos**, y **firma**.
Todo queda guardado automáticamente (no hay que anotar nada a mano).

Hay **dos códigos** que se pueden escanear — la app acepta los dos:

| Código | Qué es | Para qué sirve |
|---|---|---|
| **QR del manifiesto** ⭐ | Va en la hoja del manifiesto del despacho. | Lo recomendado: trae las cantidades, permite **descargar las guías** y queda como **respaldo físico para fiscalización**. |
| **Código de barras** | La etiqueta de cada pallet/bulto (sale de Picking/Bodega). | Identifica un bulto puntual; trae las cantidades. |

> 👉 Para la tienda, **lo ideal es escanear el QR del manifiesto**, porque con ese puede descargar las guías y tiene el respaldo para fiscalización.

---

## 📍 ¿Dónde se hace? (apartados)

Hay dos formas de entrar, según quién recibe:

### A) El conductor que entrega
1. Menú lateral → **Flota → Panel Conductor**.
2. Dentro, en la sección de **Tiendas**, abre la recepción de la tienda que está entregando.

### B) Control interno (en la tienda / bodega)
1. Menú lateral → **Control Interno → Recepción Tienda**.

Ambos llegan a la **misma pantalla de recepción**.

---

## 🪜 Paso a paso (lo que ve la persona)

**Paso 1 — Escanear**
- Se abre la cámara. Apunta al **QR del manifiesto** o al **código de barras** de la etiqueta.
- Si la cámara no lee, hay un botón **"Ingresar código manualmente"**.

**Paso 2 — Revisar el despacho**
- Aparece la **tienda** y las **cantidades enviadas** (pallets / bultos / contenedores).
- Si escaneaste el QR del manifiesto, también verás las **guías**.

**Paso 3 — Registrar la recepción**
- Indica **cuánto llegó realmente** (si hay diferencia, se marca sola).
- **Toma las fotos** que pida (estado de la carga).
- **Registra los sellos** (foto del sello de llegada y su estado).
- **Firma** de quien recibe.

**Paso 4 — Confirmar**
- Toca **Confirmar recepción**.
- Sale "✅ ¡Recepción confirmada!".
- Si fue por QR del manifiesto, aparece el botón **"↓ Descargar guías de despacho"**.

---

## 💾 ¿Dónde queda guardado? (respaldo)

Todo se respalda **automáticamente** al confirmar:

- **Supabase** → tabla `recepcion` (el registro), + **fotos** (bucket `recepcion-fotos`) y **firma** (bucket `signatures`).
- **Google Sheets** → se agrega una fila con la recepción.
- **Seguimiento** → actualiza el estado del despacho (en `despacho_rm` / `despacho_regiones`) a *Recibido / Diferencia*.

Esto se puede ver después en: **Seguimiento → Historial / Registros → pestaña "Recepción Tienda"**
(ahí, al tocar una fila, se ven las fotos, sellos y firma).

---

## ✅ Resumen para entrenar (lo mínimo que deben saber)

1. **Entrar**: Panel Conductor (conductor) o Control Interno → Recepción Tienda.
2. **Escanear**: QR del manifiesto (ideal) o el código de barras.
3. **Confirmar lo que llegó** + **fotos** + **sellos** + **firma**.
4. **Confirmar recepción** → listo (se guarda solo y se pueden descargar las guías).

> Regla simple: **"Escaneo → reviso → fotos y sellos → firmo → confirmo."**
