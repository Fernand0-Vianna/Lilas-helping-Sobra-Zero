-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260108000000_correcoes_rn.sql
-- ---------------------------------------------------------------------
-- Correções das regras de negócio apontadas pela revisão de SQL:
--   1. RN-01: expira_em passa a ser o prazo de COLETA (não o de entrega).
--   2. RN-02: job de expiração passa de 3 dias para 15 minutos.
--   3. Corrida: aceitar_oferta() e assumir_transporte() revalidam o
--      status/vínculo no UPDATE (SELECT ... FOR UPDATE não basta quando a
--      validação veio de uma função SECURITY DEFINER separada).
--   4. RN-06: view de equidade deixa de herdar RLS (security_invoker=false)
--      para que a priorização veja todos os recebimentos; o acesso continua
--      restrito a authenticated via grant.
--   5. Superfície: funções internas deixam de ter EXECUTE para public/anon.
--   6. RN-07: INSERT direto em recebimentos só pela RPC confirmar_recebimento.
--   7. status/carimbos: constraints adicionais para dado mentiroso.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar job ou policies.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. RN-01: expira_em = prazo de coleta.
--    O prazo de entrega continua existindo como limite do ciclo, mas o
--    relógio da expiração automática (RN-02) é o da coleta.
-- ---------------------------------------------------------------------
create or replace function public.fn_oferta_setar_prazos()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_coleta  timestamptz;
  v_entrega timestamptz;
begin
  if new.prazo_coleta is null or new.prazo_entrega is null then
    select p.prazo_coleta, p.prazo_entrega
      into v_coleta, v_entrega
      from public.fn_prazo_padrao(new.tipo_alimento, new.data_preparo) p;

    new.prazo_coleta  := coalesce(new.prazo_coleta,  v_coleta);
    new.prazo_entrega := coalesce(new.prazo_entrega, v_entrega);
  end if;

  -- Sempre recalcula expira_em a partir da coleta, mesmo quando o front
  -- enviou os prazos prontos. Isso impede que um cliente defina prazo
  -- alto para burlar a expiração.
  new.expira_em := new.prazo_coleta;
  return new;
end;
$$;

comment on function public.fn_oferta_setar_prazos() is
  'Trigger BEFORE INSERT: preenche prazos e fixa expira_em = prazo_coleta (RN-01).';


-- criar_oferta(): mesma regra, para o caminho via RPC.
create or replace function public.criar_oferta(
  p_titulo          text,
  p_tipo            public.tipo_alimento,
  p_quantidade_kg   numeric,
  p_data_preparo    timestamptz,
  p_endereco_coleta text,
  p_descricao       text default null,
  p_porcoes         integer default null,
  p_bairro_coleta   text default null,
  p_observacoes     text default null
)
returns public.ofertas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doador_id uuid := public.meu_doador_id();
  v_coleta    timestamptz;
  v_entrega   timestamptz;
  v_oferta    public.ofertas;
begin
  if v_doador_id is null then
    raise exception 'Apenas doadores cadastrados podem publicar ofertas.'
      using errcode = '42501';
  end if;

  if not public.pode_ofertar(v_doador_id, p_tipo) then
    raise exception 'Seu cadastro sanitario esta vencido: voce so pode ofertar alimento nao perecivel.'
      using errcode = 'check_violation';
  end if;

  if p_data_preparo > now() + interval '10 minutes' then
    raise exception 'A data de preparo nao pode estar no futuro.'
      using errcode = '22007';
  end if;

  select pc.prazo_coleta, pc.prazo_entrega into v_coleta, v_entrega
    from public.fn_prazo_padrao(p_tipo, p_data_preparo) pc;

  insert into public.ofertas (
    doador_id, titulo, descricao, tipo_alimento, quantidade_kg, porcoes,
    data_preparo, prazo_coleta, prazo_entrega, expira_em,
    endereco_coleta, bairro_coleta, observacoes
  )
  values (
    v_doador_id, p_titulo, p_descricao, p_tipo, p_quantidade_kg, p_porcoes,
    p_data_preparo, v_coleta, v_entrega, v_coleta,
    p_endereco_coleta, p_bairro_coleta, p_observacoes
  )
  returning * into v_oferta;

  return v_oferta;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. RN-02: agendamento a cada 15 minutos (antes: 0 0 */3 * *).
--    O job é recriado; unschedule him tem guarda de existência.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'Schema cron indisponivel: agendamento da RN-02 nao atualizado.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'sobrazero-expirar-ofertas') then
    perform cron.unschedule('sobrazero-expirar-ofertas');
  end if;

  perform cron.schedule(
    'sobrazero-expirar-ofertas',
    '*/15 * * * *',
    $cron$select public.fn_expirar_ofertas();$cron$
  );
end
$$;


-- ---------------------------------------------------------------------
-- 3. Corrida no aceite e na assunção.
--    O UPDATE agora repete a condição que a validação checou, para que
--    uma segunda chamada concorrente não encontre linha para alterar.
-- ---------------------------------------------------------------------
create or replace function public.aceitar_oferta(p_oferta_id uuid)
returns public.ofertas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_instituicao_id uuid := public.minha_instituicao_id();
  v_oferta         public.ofertas;
begin
  if v_instituicao_id is null then
    raise exception 'Apenas instituicoes cadastradas podem aceitar ofertas.'
      using errcode = '42501';
  end if;

  if not public.pode_aceitar(v_instituicao_id, p_oferta_id) then
    raise exception 'Esta oferta nao pode ser aceita (RN-03: exige refrigeracao, ou ja expirou).'
      using errcode = 'check_violation';
  end if;

  update public.ofertas
     set status        = 'aceita',
         instituicao_id = v_instituicao_id,
         aceita_em      = now()
   where id = p_oferta_id
     and status = 'publicada'::public.status_oferta
     and expira_em > now()
     and instituicao_id is null
  returning * into v_oferta;

  if v_oferta.id is null then
    raise exception 'Esta oferta acabou de ser aceita por outra instituicao. Atualize a lista.'
      using errcode = 'check_violation';
  end if;

  return v_oferta;
end;
$$;

comment on function public.aceitar_oferta(uuid) is
  'RPC: aceite com revalidação no UPDATE (sem corrida entre instituições).';

create or replace function public.assumir_transporte(p_oferta_id uuid)
returns public.ofertas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_voluntario_id uuid := public.meu_voluntario_id();
  v_oferta        public.ofertas;
begin
  if v_voluntario_id is null then
    raise exception 'Apenas voluntarios cadastrados podem assumir o transporte.'
      using errcode = '42501';
  end if;

  if not public.pode_assumir(v_voluntario_id, p_oferta_id) then
    raise exception 'Voce nao pode assumir esta oferta (RN-04: exige caixa termica, ou a oferta nao esta mais disponivel).'
      using errcode = 'check_violation';
  end if;

  update public.ofertas
     set voluntario_id = v_voluntario_id
   where id = p_oferta_id
     and status in ('publicada'::public.status_oferta, 'aceita'::public.status_oferta)
     and voluntario_id is null
     and expira_em > now()
  returning * into v_oferta;

  if v_oferta.id is null then
    raise exception 'Esta oferta acabou de ser assumida por outro voluntario. Atualize a lista.'
      using errcode = 'check_violation';
  end if;

  return v_oferta;
end;
$$;

comment on function public.assumir_transporte(uuid) is
  'RPC: assunção com revalidação no UPDATE (sem corrida entre voluntários).';


-- ---------------------------------------------------------------------
-- 4. RN-06: a view de equidade precisa enxergar TODOS os recebimentos,
--    inclusive os das outras instituições; com security_invoker=true o RLS
--    de recebimentos escondia os concorrentes e a prioridade ficava errada.
--    O acesso à view continua restrito a authenticated.
-- ---------------------------------------------------------------------
create or replace view public.vw_equidade_instituicoes
with (security_invoker = false) as
select
  i.id                as instituicao_id,
  i.profile_id,
  p.nome              as nome,
  i.razao_social,
  i.bairro,
  i.tem_refrigeracao,
  i.necessidade_semanal,
  coalesce(sum(r.quantidade_recebida_kg) filter (
      where r.criado_em >= now() - interval '30 days'
    ), 0)::numeric(12,2) as kg_recebidos_30d,
  count(r.id) filter (
      where r.criado_em >= now() - interval '30 days'
    ) as recebimentos_30d
from public.instituicoes i
join public.profiles p on p.id = i.profile_id
left join public.recebimentos r on r.instituicao_id = i.id
group by i.id, p.nome, i.razao_social, i.bairro, i.tem_refrigeracao, i.necessidade_semanal;

revoke all on public.vw_equidade_instituicoes from public, anon;
grant select on public.vw_equidade_instituicoes to authenticated;

comment on view public.vw_equidade_instituicoes is
  'RN-06: kg recebidos por instituição em 30 dias; security_invoker=false para ver a concorrência.';


-- ---------------------------------------------------------------------
-- 5. Superfície: funções internas Expostas por padrão a PUBLIC.
--    Revogamos de public/anon e mantemos os grants para authenticated.
-- ---------------------------------------------------------------------
revoke execute on function public.fn_expirar_ofertas() from public, anon;
revoke execute on function public.fn_oferta_setar_prazos() from public, anon;
revoke execute on function public.fn_registrar_historico() from public, anon;
revoke execute on function public.fn_handle_new_user() from public, anon;
revoke execute on function public.pode_ofertar(uuid, public.tipo_alimento) from public, anon;
revoke execute on function public.pode_aceitar(uuid, uuid) from public, anon;
revoke execute on function public.pode_assumir(uuid, uuid) from public, anon;
revoke execute on function public.pode_confirmar(uuid, uuid) from public, anon;
revoke execute on function public.criar_oferta(text, public.tipo_alimento,
  numeric, timestamptz, text, text, integer, text, text) from public, anon;
revoke execute on function public.aceitar_oferta(uuid) from public, anon;
revoke execute on function public.assumir_transporte(uuid) from public, anon;
revoke execute on function public.avancar_status(uuid, public.status_oferta, text) from public, anon;
revoke execute on function public.confirmar_recebimento(uuid, numeric, text) from public, anon;

grant execute on function public.criar_oferta(text, public.tipo_alimento,
  numeric, timestamptz, text, text, integer, text, text) to authenticated;
grant execute on function public.aceitar_oferta(uuid) to authenticated;
grant execute on function public.assumir_transporte(uuid) to authenticated;
grant execute on function public.avancar_status(uuid, public.status_oferta, text) to authenticated;
grant execute on function public.confirmar_recebimento(uuid, numeric, text) to authenticated;


-- ---------------------------------------------------------------------
-- 6. RN-07: ninguém insere recebimento direto; só a RPC, que exige
--    oferta em status 'entregue'. A policy antiga permitia insert direto
--    com pode_confirmar(), que é SECURITY DEFINER e não depende do status
--    atual no momento do INSERT.
-- ---------------------------------------------------------------------
revoke insert on public.recebimentos from anon, authenticated;
-- Remove também a policy antiga: ela permitia INSERT direto com
-- pode_confirmar(), que não exige status 'entregue' no momento do INSERT.
drop policy if exists recebimentos_insert_instituicao on public.recebimentos;

-- A RPC é SECURITY DEFINER, então continua inserindo normalmente.
create or replace function public.confirmar_recebimento(
  p_oferta_id              uuid,
  p_quantidade_recebida_kg numeric,
  p_observacoes            text default null
)
returns public.ofertas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oferta public.ofertas;
begin
  if not public.pode_confirmar(auth.uid(), p_oferta_id) then
    raise exception 'RN-07: somente a instituicao que recebeu pode confirmar a entrega.'
      using errcode = '42501';
  end if;

  select * into v_oferta from public.ofertas where id = p_oferta_id for update;

  if v_oferta.status is distinct from 'entregue'::public.status_oferta then
    raise exception 'RN-07: a oferta precisa estar entregue antes da confirmacao.'
      using errcode = 'check_violation';
  end if;

  insert into public.recebimentos (
    oferta_id, instituicao_id, confirmado_por, quantidade_recebida_kg, observacoes
  )
  values (
    p_oferta_id, v_oferta.instituicao_id, auth.uid(), p_quantidade_recebida_kg, p_observacoes
  );

  update public.ofertas set status = 'confirmada', confirmada_em = now()
   where id = p_oferta_id
  returning * into v_oferta;

  return v_oferta;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Constraints de integridade: carimbos coerentes e preparo no passado.
--    Usamos NOT VALID para não travar UPDATE em linhas antigas; novas
--    linhas e alterações já são validadas.
-- ---------------------------------------------------------------------
alter table public.ofertas drop constraint if exists ofertas_data_preparo_passado;
alter table public.ofertas add constraint ofertas_data_preparo_passado
  check (data_preparo <= now() + interval '10 minutes') not valid;

alter table public.ofertas drop constraint if exists ofertas_expira_em_coleta;
alter table public.ofertas add constraint ofertas_expira_em_coleta
  check (expira_em = prazo_coleta) not valid;

create index if not exists recebimentos_instituicao_criado_idx
  on public.recebimentos (instituicao_id, criado_em desc);
