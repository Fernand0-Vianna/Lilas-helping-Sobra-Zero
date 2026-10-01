-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260102000000_profiles.sql
-- ---------------------------------------------------------------------
-- O que este arquivo faz:
--   1. tabela profiles  -> espelho 1:1 de auth.users (o "quem é")
--   2. tabelas de detalhe: doadores, instituicoes, voluntarios (os dados especificos de cada perfil)
--   3. trigger handle_new_user() -> cria o profile automaticamente no signup
--   4. RLS + policies de "só eu vejo meus próprios dados"
--
-- RNs envolvidas: RN-03 (CNPJ + responsável + refrigeração),
--                  RN-04 (caixa térmica do voluntário),
--                  RN-05 (validade do cadastro sanitário do doador).
-- =====================================================================

-- =====================================================================
-- 1. profiles
-- =====================================================================
-- Por que existe: auth.users guarda só e-mail/senha e é controlada pelo
-- GoTrue. Criamos uma tabela própria para os dados de domínio, com
-- id = auth.users.id (o mesmo UUID da sessão). Isso permite colocar RLS
-- comparando direto com auth.uid().
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  user_type     public.user_type not null,
  nome          text not null check (char_length(btrim(nome)) >= 2),
  email         text not null,
  telefone      text,
  avatar_url    text,
  termos_aceitos_em timestamptz not null default now(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.profiles is
  'Dados comuns a qualquer usuário do Sobra Zero. 1:1 com auth.users; o user_type aponta para a tabela de detalhe.';
comment on column public.profiles.id is
  'UUID do usuário em auth.users (auth.uid()). Nunca geramos um id novo aqui.';
comment on column public.profiles.user_type is
  'doador | instituicao | voluntario. Definido no cadastro (abas das telas 09/10/11).';
comment on column public.profiles.email is
  'Cópia do e-mail de auth.users, mantida aqui para listagens administrativas sem depender do schema auth.';

create index profiles_user_type_idx on public.profiles (user_type);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.fn_touch_updated_at();


-- =====================================================================
-- 2. doadores  (tela 09 · Cadastro de doadores)
-- =====================================================================
create table public.doadores (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles (id) on delete cascade,
  nome_estabelecimento text not null,
  responsavel       text not null,
  telefone          text,
  -- RN-05: se esta data passar, o doador só pode ofertar nao_perecivel.
  cadastro_sanitario_validade date not null,
  endereco          text,
  bairro            text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  constraint doadores_sanitario_nao_passado
    check (cadastro_sanitario_validade >= date '2000-01-01')
);

comment on table public.doadores is
  'Perfil estendido do doador: quem publica a oferta de alimento excedente.';
comment on column public.doadores.cadastro_sanitario_validade is
  'RN-05 — se vencido na data da publicação, a função pode_ofertar() só aceita tipo nao_perecivel.';
comment on column public.doadores.nome_estabelecimento is
  'Nome fantasia (ex.: "Cantina do Zé"), campo d-nome do formulário de cadastro.';

create trigger trg_doadores_updated_at
  before update on public.doadores
  for each row execute function public.fn_touch_updated_at();


-- =====================================================================
-- 3. instituicoes  (tela 10 · Cadastro de instituições — RN-03)
-- =====================================================================
create table public.instituicoes (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles (id) on delete cascade,
  razao_social      text not null,
  -- RN-03: CNPJ é obrigatório. Guardamos só os dígitos e o check garante 14.
  cnpj              text not null unique
                      check (cnpj ~ '^[0-9]{14}$'),
  responsavel_legal text not null,
  telefone          text,
  -- RN-03: sem refrigeração a instituição não pode receber oferta que exija frio.
  tem_refrigeracao  boolean not null default false,
  capacidade_refrigeracao_kg numeric(10,2),
  necessidade_semanal public.faixa_necessidade not null default 'ate_20kg',
  aceita_congelado  boolean not null default false,
  endereco          text,
  bairro            text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),

  -- Não faz sentido declarar câmara fria e não declarar a capacidade.
  constraint instituicoes_capacidade_com_refrigeracao
    check (not tem_refrigeracao or capacidade_refrigeracao_kg is null
           or capacidade_refrigeracao_kg > 0)
);

comment on table public.instituicoes is
  'Perfil estendido da instituição que recebe a doação e confirma o recebimento (RN-07).';
comment on column public.instituicoes.cnpj is
  'CNPJ com 14 dígitos, sem pontos/barra. O front-end formata para exibição, o banco valida o formato.';
comment on column public.instituicoes.tem_refrigeracao is
  'RN-03 - quando false, a policy de aceite impede a instituicao de aceitar ofertas do tipo frio ou congelado.';
comment on column public.instituicoes.necessidade_semanal is
  'Usada apenas como informação de capacidade; não bloqueia o aceite.';

create index instituicoes_bairro_idx on public.instituicoes (bairro);
create index instituicoes_refrigeracao_idx on public.instituicoes (tem_refrigeracao);

create trigger trg_instituicoes_updated_at
  before update on public.instituicoes
  for each row execute function public.fn_touch_updated_at();


-- =====================================================================
-- 4. voluntarios  (tela 11 · Cadastro de voluntários — RN-04)
-- =====================================================================
create table public.voluntarios (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null unique references public.profiles (id) on delete cascade,
  nome_completo     text not null,
  telefone           text not null,
  -- RN-04: voluntário sem caixa térmica não transporta alimento que exige frio.
  tem_caixa_termica  boolean not null default false,
  meio_transporte   public.meio_transporte not null,
  capacidade_kg     numeric(10,2),
  raio_atuacao_km   integer,
  disponivel        boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

comment on table public.voluntarios is
  'Perfil estendido do voluntário que assume o transporte (RN-04) e registra coleta/entrega (RN-07).';
comment on column public.voluntarios.tem_caixa_termica is
  'RN-04 — obrigatório (true) para assumir ofertas do tipo frio ou congelado.';
comment on column public.voluntarios.disponivel is
  'Permite pausar a disponibilidade sem perder o histórico de transportes.';

create index voluntarios_disponivel_idx on public.voluntarios (disponivel);

create trigger trg_voluntarios_updated_at
  before update on public.voluntarios
  for each row execute function public.fn_touch_updated_at();


-- =====================================================================
-- 5. Trigger de criação automática de profile (cadastro)
-- =====================================================================
-- No fluxo de cadastro (pages/cadastro.html + pages-js/cadastro.js) o
-- front-end chama supabase.auth.signUp() com metadata { user_type, nome }.
-- Este trigger garante que o profile exista mesmo que o front-end falhe
-- depois do signUp (a tabela nunca fica órfã).
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tipo public.user_type;
begin
  -- Lê o tipo declarado no cadastro; default = doador.
  v_tipo := coalesce(
    (new.raw_user_meta_data ->> 'user_type')::public.user_type,
    'doador'::public.user_type
  );

  insert into public.profiles (id, user_type, nome, email, telefone)
  values (
    new.id,
    v_tipo,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(new.raw_user_meta_data ->> 'telefone', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.fn_handle_new_user() is
  'Trigger em auth.users: cria public.profiles no signup usando raw_user_meta_data.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();
