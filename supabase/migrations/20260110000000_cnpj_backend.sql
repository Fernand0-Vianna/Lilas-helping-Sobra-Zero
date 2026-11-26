-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260110000000_cnpj_backend.sql — RN-03 no banco
-- ---------------------------------------------------------------------
-- Hoje o cnpj so e validado quanto ao formato (14 digitos) e unicidade.
-- Qualquer cliente pode chamar o Supabase direto com a anon key e gravar
-- 14 digitos quaisquer, ganhando perfil de instituicao sem CNPJ real.
--
-- Esta migration adiciona validacao dos digitos verificadores (algoritmo
-- da Receita Federal) com constraint NOT VALID: ela passa a valer para
-- INSERT/UPDATE novos, mas NAO revisa linhas antigas. Os 2 CNPJs de teste
-- ja existentes continuam intactos (dívida documentada).
--
-- Idempotente: create or replace function + drop/add constraint.
-- =====================================================================

create or replace function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int := 0;
  i int;
  d1 int;
  d2 int;
begin
  if v !~ '^[0-9]{14}$' then
    return false;
  end if;

  -- Rejeita sequencias uniformes (ex.: 00000000000000).
  if v ~ '^(.)\1{13}$' then
    return false;
  end if;

  -- Primeiro digito verificador: pesos 5,4,3,2,9,8,7,6,5,4,3,2.
  for i in 1..12 loop
    s := s + (ascii(substr(v, i, 1)) - 48) * w1[i];
  end loop;
  d1 := s % 11;
  if d1 < 2 then d1 := 0; else d1 := 11 - d1; end if;
  if d1 <> (ascii(substr(v, 13, 1)) - 48) then
    return false;
  end if;

  -- Segundo digito verificador: pesos 6,5,4,3,2,9,8,7,6,5,4,3,2.
  s := 0;
  for i in 1..13 loop
    s := s + (ascii(substr(v, i, 1)) - 48) * w2[i];
  end loop;
  d2 := s % 11;
  if d2 < 2 then d2 := 0; else d2 := 11 - d2; end if;

  return d2 = (ascii(substr(v, 14, 1)) - 48);
end;
$fn$;

comment on function public.cnpj_valido(text) is
  'RN-03: valida os dois digitos verificadores do CNPJ (algoritmo da Receita Federal).';

revoke all on function public.cnpj_valido(text) from public, anon;
grant execute on function public.cnpj_valido(text) to authenticated;

alter table public.instituicoes
  drop constraint if exists instituicoes_cnpj_digitos_verificadores;

alter table public.instituicoes
  add constraint instituicoes_cnpj_digitos_verificadores
  check (public.cnpj_valido(cnpj)) not valid;

select 'cnpj-backend ok' as status;
