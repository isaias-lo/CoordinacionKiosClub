-- [C3 / RC-6] updated_at AUTORITATIVO del SERVIDOR en shared_session_state.
--
-- Problema: el ordenamiento de los sync de Bodega comparaba el reloj de PARED de cada equipo
-- (pushedAt / updated_at seteado por el cliente). Con relojes desfasados, un equipo podía RECHAZAR
-- el push legítimo (más nuevo) de otro. Este trigger hace que `updated_at` lo ponga SIEMPRE el
-- servidor (now()), un reloj único, ignorando lo que envíe el cliente. Así el gate de orden del
-- front (remotoEsMasViejo) queda libre de desfase de relojes.
--
-- Es idempotente y seguro de re-correr. El código del front ya funciona SIN este trigger (cae al
-- pushedAt del cliente); al aplicarlo, el orden pasa a ser server-authoritative.

create or replace function public.set_shared_session_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shared_session_state_updated_at on public.shared_session_state;

create trigger trg_shared_session_state_updated_at
  before insert or update on public.shared_session_state
  for each row
  execute function public.set_shared_session_state_updated_at();
