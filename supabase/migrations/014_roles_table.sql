CREATE TABLE IF NOT EXISTS public.roles (
  id            text        PRIMARY KEY,
  label         text        NOT NULL,
  color         text        NOT NULL DEFAULT '#6B7280',
  home_path     text        NOT NULL DEFAULT '/perfil',
  allowed_paths text[]      NOT NULL DEFAULT '{}',
  is_system     boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_read" ON public.roles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "roles_admin_manage" ON public.roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

INSERT INTO public.roles (id, label, color, home_path, allowed_paths, is_system) VALUES
  ('auditor',            'Auditor',            '#9333EA', '/auditoria', ARRAY['/auditoria','/historial','/perfil'],                                                                                    true),
  ('admin-auditoria',    'Admin Auditoría',    '#0891B2', '/auditoria', ARRAY['/auditoria','/auditoria-admin','/perfil'],                                                                              true),
  ('despachador',        'Despachador',        '#2563EB', '/',          ARRAY['/','/despacho','/despacho-hub','/control-interno','/recepcion','/historial','/perfil'],                                  true),
  ('supervisor',         'Supervisor',         '#16A34A', '/',          ARRAY['/','/despacho','/despacho-hub','/control-interno','/recepcion','/historial','/perfil'],                                  true),
  ('recepcion-tienda',   'Recepción Tienda',   '#10B981', '/tiendas',   ARRAY['/tiendas','/recepcion','/perfil'],                                                                                      true),
  ('supervisor-picking', 'Supervisor Picking', '#6366F1', '/picking',   ARRAY['/picking','/perfil'],                                                                                                   true),
  ('admin',              'Administrador',      '#D97706', '/',          ARRAY['*'],                                                                                                                    true)
ON CONFLICT (id) DO NOTHING;
