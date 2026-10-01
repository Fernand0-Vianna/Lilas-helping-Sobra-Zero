-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260103000000_ofertas.sql
-- ---------------------------------------------------------------------
-- O que este arquivo faz:
--   1. tabela ofertas          -> o coração do produto (telas 04 a 08)
--   2. tabela oferta_historico -> rastro de todo status (auditoria / timeline)
--   3. tabela recebimentos     -> confirmação da instituição (RN-07)
--   4. views vw_ofertas_feed, vw_equidade_instituicoes (RN-06),
--      vw_descartes (RN-02) e vw_relatorio_doadores
--
-- RNs envolvidas: RN-01 (prazos), RN-02 (expiração/descarte),
-- RN-03 (instituição sem refrigeração), RN-04 (caixa térmica),
-- RN-05 (sanitário), RN-06 (equidade), RN-07 (confirmação), RN-08 (congelado).
-- =====================================================================

-- =====================================================================
-- 1. ofertas
-- =====================================================================
create table public.ofertas (
  id              uuid primary key default gen_random_uuid(),

  -- quem publica
  doador_id       uuid not null references public.doadores (id) on delete restrict,

  -- o que é
  titulo          text not null check (char_length(btrim(titulo)) between 3 and 120),
  descricao       text,
  tipo_alimento   public.tipo_alimento not null,
  -- Coluna gerada: evita que o front-end minta sobre a necessidade de frio.
  exige_frio      boolean generated always as (
                    case when tipo_alimento in ('frio'::public.tipo_alimento,
                                               'congelado'::public.tipo_alimento)
                         then true else false end
                  ) stored,

  -- quanto
  quantidade_kg   numeric(10,2) not null check (quantidade_kg > 0 and quantidade_kg <= 5000),
  porcoes         integer check (porcoes is null or porcoes > 0),

  -- quando (RN-01 / RN-08: sempre com prazo, nunca aberto)
  data_preparo    timestamptz not null,
  prazo_coleta    timestamptz not null,
  prazo_entrega   timestamptz not null,
  -- Data-limite usada pelo pg_cron e pelo filtro do feed (RN-01/RN-02).
  expira_em       timestamptz not null,

  status          public.status_oferta not null default 'publicada',

  -- quem recebe (RN-03/RN-07)
  instituicao_id  uuid references public.instituicoes (id) on delete set null,

  -- quem transporta (RN-04)
  voluntario_id   uuid references public.voluntarios (id) on delete set null,

  -- onde
  endereco_coleta text not null,
  bairro_coleta   text,

  -- RN-02: quando expira ou é descartada, registramos o motivo aqui.
  motivo_descarte text,
  expirada_em     timestamptz,
  descartada_em   timestamptz,

  -- carimbos do ciclo de vida
  aceita_em       timestamptz,
  coletada_em     timestamptz,
  entregue_em     timestamptz,
  confirmada_em   timestamptz,
  cancelada_em    timestamptz,

  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Coerência interna: um carimbo só existe se o status já passou por aquela
  -- etapa. Ou seja: aceita_em preenchida em uma oferta expirada é VÁLIDO
  -- (ela foi aceita e depois expirou), mas aceita_em em status 'publicada'
  -- seria dado mentiroso e o banco rejeita.
  constraint ofertas_status_carimbos check (
    (aceita_em     is null or status <> 'publicada') and
    (coletada_em   is null or status in ('coletada','entregue','confirmada',
                                        'expirada','descartada','cancelada')) and
    (entregue_em   is null or status in ('entregue','confirmada','cancelada')) and
    (confirmada_em is null or status = 'confirmada')
  ),

  -- RN-01/RN-08: a entrega nunca pode ser depois do prazo.
  constraint ofertas_prazos_ordem check (prazo_coleta <= prazo_entrega),
  constraint ofertas_expira_dentro_do_prazo check (expira_em <= prazo_entrega)
);

comment on table public.ofertas is
  'Oferta de alimento excedente. Uma linha = um alimento doado + todo o rastro ate a confirmacao (RN-07).';
comment on column public.ofertas.doador_id is
  'Doador que publicou. Fixo apos a criacao (on delete restrict): oferta e registro permanente.';
comment on column public.ofertas.tipo_alimento is
  'preparado | nao_perecivel | frio | congelado. Define o prazo calculado por fn_prazo_padrao().';
comment on column public.ofertas.exige_frio is
  'Coluna GERADA a partir de tipo_alimento. Alimenta a regra RN-03 (instituicao) e RN-04 (voluntario).';
comment on column public.ofertas.expira_em is
  'Prazo final (limite de coleta/entrega). O pg_cron marca como expirada o que passar daqui (RN-02).';
comment on column public.ofertas.instituicao_id is
  'Instituicao que aceitou. Preenchida no aceite, liberada no cancelamento.';
comment on column public.ofertas.voluntario_id is
  'Voluntario que assumiu o transporte. Precisa ter caixa termica se exige_frio = true (RN-04).';
comment on column public.ofertas.motivo_descarte is
  'Texto livre com o motivo da expiracao/descarte (RN-02). Aparece no relatorio de descartes (tela 12).';

-- Indices: toda query do produto filtra por status e ordena por prazo.
create index ofertas_status_expira_idx   on public.ofertas (status, expira_em);
create index ofertas_doador_idx          on public.ofertas (doador_id, criado_em desc);
create index ofertas_instituicao_idx     on public.ofertas (instituicao_id, criado_em desc);
create index ofertas_voluntario_idx      on public.ofertas (voluntario_id, criado_em desc);
create index ofertas_tipo_idx            on public.ofertas (tipo_alimento);
create index ofertas_bairro_idx         on public.ofertas (bairro_coleta);

create trigger trg_ofertas_updated_at
  before update on public.ofertas
  for each row execute function public.fn_touch_updated_at();


-- =====================================================================
-- 2. oferta_historico  (rastro / timeline da tela 06-08)
-- =====================================================================
create table public.oferta_historico (
  id              bigint generated always as identity primary key,
  oferta_id       uuid not null references public.ofertas (id) on delete cascade,
  status_anterior public.status_oferta,
  status_novo     public.status_oferta not null,
  ator_id         uuid references public.profiles (id) on delete set null,
  ator_tipo       public.user_type,
  comentario      text,
  criado_em       timestamptz not null default now()
);

comment on table public.oferta_historico is
  'Timeline append-only de cada mudanca de status da oferta. Alimenta a tela 06/07/08 e o rastro de auditoria.';
comment on column public.oferta_historico.status_anterior is
  'NULL apenas no primeiro registro (a criacao da oferta).';
comment on column public.oferta_historico.ator_id is
  'Quem executou a mudanca. NULL quando o evento foi automatico (pg_cron expirando a oferta).';

create index oferta_historico_oferta_idx on public.oferta_historico (oferta_id, criado_em);
create index oferta_historico_status_idx on public.oferta_historico (status_novo, criado_em desc);


-- =====================================================================
-- 3. recebimentos  (RN-07: so a instituicao fecha o ciclo)
-- =====================================================================
create table public.recebimentos (
  id                  uuid primary key default gen_random_uuid(),
  oferta_id           uuid not null unique references public.ofertas (id) on delete cascade,
  instituicao_id      uuid not null references public.instituicoes (id) on delete restrict,
  confirmado_por      uuid not null references public.profiles (id) on delete restrict,
  quantidade_recebida_kg numeric(10,2) not null check (quantidade_recebida_kg > 0),
  observacoes         text,
  criado_em           timestamptz not null default now()
);

comment on table public.recebimentos is
  'Prova de entrega (RN-07). A oferta so vai para confirmada quando existe um registro aqui feito pela instituicao.';
comment on column public.recebimentos.oferta_id is
  'UNIQUE: uma oferta tem no maximo um recebimento. Garante que ninguem confirme duas vezes.';
comment on column public.recebimentos.confirmado_por is
  'Profile logado que confirmou. A policy so deixa a instituicao dona da oferta inserir.';


-- =====================================================================
-- 4. Views
-- =====================================================================

-- 4.1. RN-06 — equidade entre instituições.
-- "Feed prioriza a instituicao que recebeu menos kg em 30 dias."
-- Calculamos os kg confirmados na janela e ordenamos do MENOR para o MAIOR.
create or replace view public.vw_equidade_instituicoes
with (security_invoker = true) as
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

comment on view public.vw_equidade_instituicoes is
  'RN-06: kg recebidos por instituicao na janela de 30 dias. Use ORDER BY kg_recebidos_30d ASC para priorizar quem recebeu menos.';

-- 4.2. RN-02 — tudo que virou descarte (expirado ou descartado).
create or replace view public.vw_descartes
with (security_invoker = true) as
select
  o.id              as oferta_id,
  o.titulo,
  o.tipo_alimento,
  o.quantidade_kg,
  o.bairro_coleta,
  o.status          as status_final,
  o.motivo_descarte,
  o.expirada_em,
  o.descartada_em,
  d.nome_estabelecimento as doador,
  h.criado_em       as registrado_em
from public.ofertas o
join public.doadores d on d.id = o.doador_id
left join lateral (
  select criado_em from public.oferta_historico hh
  where hh.oferta_id = o.id
    and hh.status_novo in ('expirada'::public.status_oferta, 'descartada'::public.status_oferta)
  order by hh.criado_em desc
  limit 1
) h on true
where o.status in ('expirada'::public.status_oferta, 'descartada'::public.status_oferta);

comment on view public.vw_descartes is
  'RN-02: relatorio de ofertas que expiraram ou foram descartadas, com o doador e o motivo.';

-- 4.3. Feed de ofertas (tela 05 / M2).
-- security_invoker = true => as policies RLS das tabelas base continuam valendo
-- nesta view. Sem isso, uma view comum viraria uma "porta aberta" que burla RLS.
create or replace view public.vw_ofertas_feed
with (security_invoker = true) as
select
  o.*,
  d.nome_estabelecimento as doador_nome,
  d.bairro              as doador_bairro,
  d.telefone            as doador_telefone,
  v.tem_caixa_termica   as voluptario_tem_caixa_termica,
  v.nome_completo       as voluntario_nome,
  i.razao_social        as instituicao_nome,
  i.tem_refrigeracao    as instituicao_refrigeracao,
  -- RN-06: prioridade = instituicoes que receberam MENOS kg nos ultimos 30 dias.
  -- 99999 como "sem instituicao ainda" coloca as ofertas livres no fim.
  coalesce(eq.kg_recebidos_30d, 99999) as kg_recebidos_30d_prioridade
from public.ofertas o
join public.doadores d      on d.id = o.doador_id
left join public.voluntarios v  on v.id = o.voluntario_id
left join public.instituicoes i on i.id = o.instituicao_id
left join public.vw_equidade_instituicoes eq on eq.instituicao_id = o.instituicao_id;

comment on view public.vw_ofertas_feed is
  'Feed pronto para a tela 05: oferta + doador + instituicao/voluntario + prioridade de equidade (RN-06).';

-- 4.4. Relatorio por doador (tela 12 · barras horizontais).
create or replace view public.vw_relatorio_doadores
with (security_invoker = true) as
select
  d.id                    as doador_id,
  d.nome_estabelecimento  as doador,
  count(*) filter (where o.status <> 'cancelada')                        as ofertas_total,
  count(*) filter (where o.status = 'confirmada')                        as ofertas_confirmadas,
  coalesce(sum(o.quantidade_kg) filter (where o.status = 'confirmada'), 0)::numeric(12,2) as kg_doados,
  count(*) filter (where o.status in ('expirada', 'descartada'))         as descartes,
  coalesce(sum(o.quantidade_kg) filter (where o.status in ('expirada', 'descartada')), 0)::numeric(12,2) as kg_descartados
from public.doadores d
left join public.ofertas o on o.doador_id = d.id
group by d.id, d.nome_estabelecimento;

comment on view public.vw_relatorio_doadores is
  'Barras do relatorio (tela 12): kg doados e kg descartados por doador, com taxa de aproveitamento.';

-- 4.5. KPIs gerais (cards 2x2 da tela 12 / M7).
create or replace view public.vw_kpis_gerais
with (security_invoker = true) as
select
  (select count(*) from public.ofertas)                                        as total_ofertas,
  (select count(*) from public.ofertas where status = 'confirmada')           as ofertas_confirmadas,
  (select count(*) from public.ofertas where status in ('expirada','descartada')) as ofertas_descartadas,
  (select coalesce(sum(quantidade_recebida_kg), 0) from public.recebimentos)  as kg_distribuidos,
  (select count(*) from public.instituicoes)                                   as instituicoes_ativas,
  (select count(*) from public.doadores)                                       as doadores_ativos,
  (select count(*) from public.voluntarios)                                    as voluntarios_ativos
  , now() as gerado_em;

comment on view public.vw_kpis_gerais is
  'KPIs agregados da tela 12: totais, kg distribuidos, descartes e qtde de perfis ativos.';
