-- Agregados y Solicitudes en la Planilla: sus correcciones a mano.
-- Pedido del coordinador el 22/11/2026.
--
-- La Planilla ahora muestra, bajo cada tienda, los Agregados (Cheaf, Chocolates, Exhibidores…),
-- los Extra y las Solicitudes. El nombre de quien lo hizo se corrige igual que el de cualquier
-- celda, y esa corrección se guarda en `planilla_movimientos`.
--
-- Un Extra tiene sección (Comida, Aseo, Hogar o Chocolates) y se guarda con ella. Un Agregado o
-- una Solicitud no la tienen, y se guardan con su tipo: 'Agregado' o 'Solicitud'. La regla de la
-- columna solo aceptaba las cuatro secciones, así que hay que ampliarla.
--
-- Nada de esto llega a la hoja de olas: esas filas siempre traen `ref`, y la hoja se arma solo
-- con los movimientos de las cuatro secciones (ver `extrasPlanilla.ts`).
--
-- Mientras no se corra, corregir un Agregado o una Solicitud muestra un aviso que pide correr este
-- archivo. Corregir un Extra funciona igual que antes.

ALTER TABLE public.planilla_movimientos
  DROP CONSTRAINT IF EXISTS planilla_movimientos_seccion_check;

ALTER TABLE public.planilla_movimientos
  ADD CONSTRAINT planilla_movimientos_seccion_check
  CHECK (seccion IN ('Comida', 'Aseo', 'Hogar', 'Chocolates', 'Agregado', 'Solicitud'));
