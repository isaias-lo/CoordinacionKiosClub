-- Tabla para sesiones de auditoría activas
-- Permite sincronización cross-device del mismo usuario y monitoreo admin en tiempo real.

create table if not exists public.audit_active_sessions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  session_data jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

alter table public.audit_active_sessions enable row level security;

-- Cada auditor gestiona solo su propia sesión
create policy "audit_sessions_own" on public.audit_active_sessions
  for all to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins y admin-auditoria pueden leer todas las sesiones activas (panel En Vivo)
create policy "audit_sessions_admin_read" on public.audit_active_sessions
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'admin-auditoria')
    )
  );

-- Habilitar Realtime para que los cambios se propaguen en tiempo real
alter publication supabase_realtime add table public.audit_active_sessions;
