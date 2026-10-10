-- Repair: garante que fn_touch_updated_at usa atualizado_em (não updated_at).
-- Sintoma no remoto: avancar_status -> cancelada falhava com
--   record "new" has no field "updated_at".
-- Idempotente: pode rodar quantas vezes for preciso.

create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.fn_touch_updated_at() is
  'Trigger genérica: preenche atualizado_em automaticamente em qualquer tabela que a usar.';
