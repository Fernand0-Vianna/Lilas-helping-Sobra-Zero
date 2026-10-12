-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260106000001_admin.sql — Perfil admin flutuante
-- ---------------------------------------------------------------------
-- O admin tem user_type = 'admin' e pode manter UMA linha de vínculo em
-- CADA tabela de detalhe (doadores + instituicoes + voluntarios). Como as
-- RPCs liberam pela linha de vínculo (meu_doador_id() etc.) e não pelo
-- user_type, o admin "flutua": publica como doador, aceita/confirma como
-- instituição e transporta como voluntário — sempre passando pelas mesmas
-- RNs (RN-03 a RN-07). Nenhum bypass de regra de negócio.
--
-- Conteúdo:
--   1. helper sou_admin() + leitura total em ofertas/historico/recebimentos
--   2. trava anti auto-promoção: signup só cria os 3 perfis normais e o
--      UPDATE em profiles fica restrito às colunas (nome, telefone,
--      avatar_url) — user_type só muda via SQL/service_role
--
-- Como promover alguém a admin (rodar com service_role ou no SQL Editor):
--   update public.profiles set user_type = 'admin' where email = 'X';
--   insert into public.doadores (profile_id, nome_estabelecimento, responsavel, cadastro_sanitario_validade)
--   values ('<profile-uuid>', 'Squad Lilás', 'Operação', '2030-01-01');
--   insert into public.instituicoes (profile_id, razao_social, cnpj, responsavel_legal, tem_refrigeracao, aceita_congelado)
--   values ('<profile-uuid>', 'Squad Lilás', '00000000000000', 'Operação', true, true);
--   insert into public.voluntarios (profile_id, nome_completo, telefone, tem_caixa_termica, meio_transporte, disponivel)
--   values ('<profile-uuid>', 'Operação Lilás', '(11) 90000-0000', true, 'carro', true);
-- =====================================================================

-- 1. Helper de identidade do admin.
create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.user_type = 'admin'
  );
$$;

comment on function public.sou_admin() is
  'true se o usuário logado é admin. Uso em policies de LEITURA (nunca bypass de RN).';

grant execute on function public.sou_admin() to authenticated;

-- 2. Leitura total do admin (ofertas em qualquer status + timeline + prova RN-07).
drop policy if exists ofertas_select_feed_ou_envolvidos on public.ofertas;
create policy ofertas_select_feed_ou_envolvidos on public.ofertas
  for select to authenticated
  using (
    public.sou_admin()
    or (status = 'publicada' and expira_em > now())
    or doador_id      = public.meu_doador_id()
    or instituicao_id = public.minha_instituicao_id()
    or voluntario_id  = public.meu_voluntario_id()
  );

drop policy if exists oferta_historico_select_envolvidos on public.oferta_historico;
create policy oferta_historico_select_envolvidos on public.oferta_historico
  for select to authenticated
  using (
    public.sou_admin()
    or exists (
      select 1 from public.ofertas o
      where o.id = oferta_id
        and (
          o.doador_id      = public.meu_doador_id()
          or o.instituicao_id = public.minha_instituicao_id()
          or o.voluntario_id  = public.meu_voluntario_id()
          or o.status = 'publicada'
        )
    )
  );

drop policy if exists recebimentos_select_envolvidos on public.recebimentos;
create policy recebimentos_select_envolvidos on public.recebimentos
  for select to authenticated
  using (
    public.sou_admin()
    or instituicao_id = public.minha_instituicao_id()
    or exists (
      select 1 from public.ofertas o
      where o.id = oferta_id
        and (o.doador_id = public.meu_doador_id()
             or o.voluntario_id = public.meu_voluntario_id())
    )
  );

-- 3. Trava anti auto-promoção: ninguém vira admin sozinho.
-- 3a. Signup (trigger) só aceita os 3 perfis normais; qualquer outro valor cai em doador.
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meta text := new.raw_user_meta_data ->> 'user_type';
  v_tipo public.user_type;
begin
  v_tipo := case
    when v_meta in ('doador', 'instituicao', 'voluntario') then v_meta::public.user_type
    else 'doador'::public.user_type
  end;

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

-- 3b. UPDATE direto em profiles: só colunas de contato. user_type e id
-- ficam fora do alcance de authenticated (só service_role/SQL muda).
revoke update on public.profiles from authenticated;
grant update (nome, telefone, avatar_url) on public.profiles to authenticated;
