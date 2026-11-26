-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260109000000_papeis_kpis.sql — papéis e KPIs
-- ---------------------------------------------------------------------
-- 1. Auto-atribuição de papéis: as policies de INSERT nas tabelas de
--    detalhe só exigiam profile_id = auth.uid(). Qualquer usuário logado
--    podia inserir em doadores/instituicoes/voluntarios e ganhar acesso
--    às RPCs daquele papel, mesmo com user_type diferente. Agora exigimos
--    que o user_type do profile seja compatível (admin flutua nos 3).
-- 2. Views de relatório/KPIs: vw_relatorio_doadores e vw_kpis_gerais
--    leem dados agregados de todas as entidades. Com security_invoker=true
--    o RLS já filtra, mas o acesso é restrito explicitamente a
--    authenticated (revogado de anon/public).
-- 3. Índice para a consulta de equidade por instituição.
--
-- Idempotente: drop/create policy e create or replace view.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Policies de INSERT compatíveis com user_type.
--   Admin é exceção explícita: o desenho do projeto permite que ele tenha
--   vínculo nas 3 tabelas para operar sem bypass das RNs.
-- ---------------------------------------------------------------------
drop policy if exists doadores_insert_own on public.doadores;
create policy doadores_insert_own on public.doadores
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.meu_user_type() in ('doador'::public.user_type, 'admin'::public.user_type)
  );

drop policy if exists instituicoes_insert_own on public.instituicoes;
create policy instituicoes_insert_own on public.instituicoes
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.meu_user_type() in ('instituicao'::public.user_type, 'admin'::public.user_type)
  );

drop policy if exists voluntarios_insert_own on public.voluntarios;
create policy voluntarios_insert_own on public.voluntarios
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.meu_user_type() in ('voluntario'::public.user_type, 'admin'::public.user_type)
  );

-- UPDATE continua restrito ao próprio vínculo (já era assim). Reforçamos
-- para que ninguém troque o profile_id e "roube" o vínculo de outro usuário.
drop policy if exists doadores_update_own on public.doadores;
create policy doadores_update_own on public.doadores
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists instituicoes_update_own on public.instituicoes;
create policy instituicoes_update_own on public.instituicoes
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists voluntarios_update_own on public.voluntarios;
create policy voluntarios_update_own on public.voluntarios
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());


-- ---------------------------------------------------------------------
-- 2. Relatório/KPIs: acesso explícito só a authenticated.
-- ---------------------------------------------------------------------
revoke all on public.vw_relatorio_doadores from public, anon;
grant select on public.vw_relatorio_doadores to authenticated;

revoke all on public.vw_kpis_gerais from public, anon;
grant select on public.vw_kpis_gerais to authenticated;

revoke all on public.vw_descartes from public, anon;
grant select on public.vw_descartes to authenticated;

revoke all on public.vw_ofertas_feed from public, anon;
grant select on public.vw_ofertas_feed to authenticated;


-- ---------------------------------------------------------------------
-- 3. Índice para agregação de equidade/KPI por instituição.
-- ---------------------------------------------------------------------
create index if not exists recebimentos_criado_idx
  on public.recebimentos (criado_em desc);

select 'lote3 ok' as status;
