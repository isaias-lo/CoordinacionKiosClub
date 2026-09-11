-- El flujo de ENTREGA del chofer (/conductor-hub → RecepcionForm) nunca pudo completarse.
--
-- Sube sus fotos —sello de llegada, sello de salida, salida del CD y estado de la carga— directo
-- desde el teléfono al bucket `recepcion-fotos`. El bucket existe (se creó el 25/07) pero NO tenía
-- ninguna policy de INSERT en storage.objects, y Supabase deniega por defecto: la subida fallaba y
-- la entrega entera se caía al enviarla.
--
-- Medido el 11/09/2026: 0 entregas de chofer registradas. Las 21 filas de `recepcion` son acuses de
-- TIENDA, que suben sus fotos por el servidor (service role, /api/recepcion) y no pasan por RLS.
-- Por eso el flujo de la tienda funcionaba y el del chofer no.
--
-- Misma forma que `audit_photos_insert`: solo usuarios con sesión (/conductor-hub exige login).
-- Aditivo. Se puede correr más de una vez.

DROP POLICY IF EXISTS recepcion_fotos_insert ON storage.objects;
CREATE POLICY recepcion_fotos_insert ON storage.objects
  FOR INSERT TO public
  WITH CHECK (bucket_id = 'recepcion-fotos' AND auth.role() = 'authenticated');
