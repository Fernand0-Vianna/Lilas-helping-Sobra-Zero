-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260101000000_init.sql
-- ---------------------------------------------------------------------
-- O que este arquivo faz:
--   1. cria o schema public com hardening (search_path fixo)
--   2. cria os ENUMs de domínio do produto
--   3. cria funções utilitárias usadas pelas demais migrations
--
-- Regras de negócio envolvidas: RN-01 (prazos), RN-02 (expiração),
-- RN-05 (perecível x sanitário), RN-08 (congelado 48h).
--
-- Como aplicar:
--   supabase db push              (ambiente remoto, via CLI)
--   supabase db reset             (recria o banco local do zero)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------
create schema if not exists public;

-- Fixa o search_path das roles da aplicacao. Sem isso, um objeto malicioso
-- criado no schema de um usuario poderia "sequestrar" funcoes internas
-- (name-hijacking). `pg_catalog` fica sempre disponivel implicitamente.
-- Observacao: `ALTER SCHEMA ... SET` nao existe no Postgres; o caminho
-- correto e fixar no nivel da ROLE (ou dentro de cada funcao, como fazemos
-- em todas as funcoes deste projeto com `set search_path = public, pg_temp`).
alter role authenticated set search_path = public, pg_temp;
alter role anon         set search_path = public, pg_temp;

comment on schema public is
  'Schema único do Sobra Zero. Toda tabela aqui é pública e protegida por RLS.';


-- =====================================================================
-- 2. ENUMs de domínio
-- =====================================================================

-- 2.1. Tipo do usuário — define qual tabela de perfil-o está filled.
create type public.user_type as enum (
  'doador',        -- publica ofertas de alimento excedente
  'instituicao',   -- aceita ofertas e confirma o recebimento (RN-07)
  'voluntario'     -- assume o transporte (RN-04)
);

comment on type public.user_type is
  'Perfil do usuário. Determina a tabela de detalhes (doadores/instituicoes/voluntarios) e as permissões.';

-- 2.2. Tipo de alimento — controla o prazo e a cadeia de frio.
create type public.tipo_alimento as enum (
  'preparado',     -- RN-01: 4h do preparo à coleta + 2h da coleta à entrega
  'nao_perecivel', -- RN-05: único tipo permitido com cadastro sanitário vencido
  'frio',          -- exige cadeia de frio (RN-03 na instituição / RN-04 no voluntário)
  'congelado'      -- RN-08: não é "preparado", tem prazo de 48h
);

comment on type public.tipo_alimento is
  'Natureza do alimento ofertado. Define o prazo (RN-01/RN-08) e a necessidade de refrigeração (RN-03/RN-04).';

-- 2.3. Ciclo de vida da oferta (as 6 etapas do protótipo + saídas de erro).
create type public.status_oferta as enum (
  'publicada',   -- 04 · criada pelo doador, aparece no feed
  'aceita',      -- 06 · instituição aceitou
  'coletada',    -- 07 · voluntário retirou o alimento
  'entregue',    -- 08 · voluntário entregou, aguardando confirmação
  'confirmada',  -- 08 · instituição confirmou o recebimento (RN-07)
  'expirada',    -- RN-02: passou do prazo de coleta
  'descartada',  -- RN-02: foi registrado como descarte
  'cancelada'    -- doador ou instituição cancelou
);

comment on type public.status_oferta is
  'Ciclo de vida da oferta. Sempre avança de forma sequencial: publicada → aceita → coletada → entregue → confirmada.';

-- 2.4. Necessidade semanal declarada pela instituição (tela 10).
create type public.faixa_necessidade as enum (
  'ate_20kg',
  'de_21_a_60kg',
  'de_61_a_150kg',
  'mais_de_150kg'
);

comment on type public.faixa_necessidade is
  'Faixa de necessidade semanal informada no cadastro da instituição (tela 10 · Cadastro de instituições).';

-- 2.5. Meio de transporte do voluntário (tela 11).
create type public.meio_transporte as enum (
  'carro',
  'moto_ou_bicicleta',
  'ape_ou_transporte_publico'
);

comment on type public.meio_transporte is
  'Meio de transporte declarado pelo voluntário (tela 11 · Cadastro de voluntários).';


-- =====================================================================
-- 3. Funções utilitárias
-- =====================================================================

-- 3.1. Mantém `updated_at` sempre coerente.
-- Regra genérica de housekeeping: nunca confie no front-end para marcar
-- "quando mudou"; o banco é a fonte da verdade.
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.fn_touch_updated_at() is
  'Trigger genérica: preenche updated_at automaticamente em qualquer tabela que a usar.';

-- 3.2. Calcula os prazos da oferta a partir do tipo de alimento.
-- RN-01: preparado  -> coleta em até 4h do preparo; entrega em até 2h da coleta.
-- RN-08: congelado  -> 48h no total a partir do preparo (não é "preparado").
-- nao_perecivel   -> 24h de coleta (não perecível estraga menos, mas também não dura).
create or replace function public.fn_prazo_padrao(
  p_tipo        public.tipo_alimento,
  p_data_preparo timestamptz
)
returns table (prazo_coleta timestamptz, prazo_entrega timestamptz)
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    case p_tipo
      when 'preparado'     then p_data_preparo + interval '4 hours'   -- RN-01
      when 'frio'          then p_data_preparo + interval '4 hours'   -- RN-01 (mesma janela, exige frio)
      when 'congelado'     then p_data_preparo + interval '48 hours'  -- RN-08
      when 'nao_perecivel' then p_data_preparo + interval '24 hours'  -- folga maior
    end as prazo_coleta,
    case p_tipo
      when 'preparado'     then p_data_preparo + interval '6 hours'   -- RN-01: 4h + 2h
      when 'frio'          then p_data_preparo + interval '6 hours'   -- RN-01
      when 'congelado'     then p_data_preparo + interval '48 hours'  -- RN-08: janela única
      when 'nao_perecivel' then p_data_preparo + interval '24 hours'
    end as prazo_entrega;
$$;

comment on function public.fn_prazo_padrao(public.tipo_alimento, timestamptz) is
  'Deriva prazo_coleta e prazo_entrega do tipo de alimento. RN-01 (4h+2h) e RN-08 (congelado 48h).';

-- 3.3. Alimento que exige cadeia de frio (RN-03 na instituição, RN-04 no voluntário).
create or replace function public.fn_alimento_exige_frio(p_tipo public.tipo_alimento)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_tipo in ('frio'::public.tipo_alimento, 'congelado'::public.tipo_alimento);
$$;

comment on function public.fn_alimento_exige_frio(public.tipo_alimento) is
  'true para tipos que exigem refrigeração na instituição (RN-03) e caixa térmica no voluntário (RN-04).';

-- 3.4. Lista de transições válidas do ciclo de vida.
-- Usada pela função avancar_status() para impedir saltos (ex.: publicada → confirmada).
create or replace function public.fn_transicao_valida(
  p_de public.status_oferta,
  p_para public.status_oferta
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_de
    when 'publicada'  then p_para in ('aceita', 'expirada', 'descartada', 'cancelada')
    when 'aceita'     then p_para in ('coletada', 'expirada', 'cancelada')
    when 'coletada'   then p_para in ('entregue', 'cancelada')
    when 'entregue'   then p_para in ('confirmada', 'cancelada')
    else false -- confirmada/expirada/descartada/cancelada são estados finais
  end;
$$;

comment on function public.fn_transicao_valida(public.status_oferta, public.status_oferta) is
  'Whitelist de transições do ciclo de vida. Estados finais (confirmada, expirada, descartada, cancelada) não saem mais.';
