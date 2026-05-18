INSERT INTO public.roles (id, label, color, home_path, allowed_paths, is_system) VALUES
  ('asistente-despacho', 'Asistente Despacho', '#F59E0B', '/despacho-hub',
   ARRAY['/despacho-hub', '/despacho/regiones', '/despacho/santiago', '/perfil'],
   true),
  ('coordinador-flota', 'Coordinador Flota', '#0EA5E9', '/despacho',
   ARRAY['/despacho', '/despacho-hub', '/perfil'],
   true)
ON CONFLICT (id) DO NOTHING;
