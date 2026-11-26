-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260112000000_seed_entregas.sql
-- ---------------------------------------------------------------------
-- Dados de demonstração da tela "Minhas entregas" do voluntário.
-- Reaproveita usuários já existentes (sem criar auth.users e sem senhas):
--   voluntário: teste@gmail.com (Vol Teste)
--   doador:     cleber.andrade@email.com
-- Acrescenta 3 ofertas em estados diferentes do ciclo, com histórico,
-- para exercitar a linha de progresso. Idempotente por título [ENTREGA].
-- =====================================================================

with v as (
  select id, profile_id from public.voluntarios
  where profile_id = '739671d1-b8b6-4a54-8993-842aae9c6bf2'::uuid
), d as (
  select id, profile_id from public.doadores
  where profile_id = '905c59f6-13cb-4b25-a879-802eaaabc8e3'::uuid
), novas as (
  select
    d.id as doador_id,
    v.id as voluntario_id,
    d.profile_id as doador_profile,
    v.profile_id as voluntario_profile,
    x.titulo,
    x.descricao,
    x.tipo_alimento,
    x.status,
    x.quantidade_kg,
    x.porcoes,
    now() - interval '3 hours' as data_preparo,
    now() + interval '3 hours' as prazo_coleta,
    now() + interval '6 hours' as prazo_entrega,
    now() + interval '3 hours' as expira_em,
    'Av. Paulista, 1000' as endereco_coleta,
    'Bela Vista' as bairro_coleta,
    '[ENTREGA] Demonstração da tela Minhas entregas - não é alimento real.' as observacoes
  from d
  cross join v
  cross join (values
    ('[ENTREGA] Marmitas a caminho', 'Coleta confirmada, aguardando retirada.', 'preparado'::public.tipo_alimento, 'aceita'::public.status_oferta, 14::numeric, 50),
    ('[ENTREGA] Iogurtes em transporte', 'Alimento refrigerado sendo transportado.', 'frio'::public.tipo_alimento, 'coletada'::public.status_oferta, 9::numeric, 36),
    ('[ENTREGA] Cestas entregues', 'Entrega registrada, aguardando confirmação.', 'nao_perecivel'::public.tipo_alimento, 'entregue'::public.status_oferta, 22::numeric, 80)
  ) as x(titulo, descricao, tipo_alimento, status, quantidade_kg, porcoes)
  where not exists (
    select 1 from public.ofertas o where o.titulo = x.titulo
  )
), ins as (
  insert into public.ofertas (
    doador_id, voluntario_id, titulo, descricao, tipo_alimento, status,
    quantidade_kg, porcoes, data_preparo, prazo_coleta, prazo_entrega,
    expira_em, endereco_coleta, bairro_coleta, observacoes,
    aceita_em, coletada_em, entregue_em
  )
  select
    doador_id, voluntario_id, titulo, descricao, tipo_alimento, status,
    quantidade_kg, porcoes, data_preparo, prazo_coleta, prazo_entrega,
    expira_em, endereco_coleta, bairro_coleta, observacoes,
    case when status in ('aceita', 'coletada', 'entregue') then now() - interval '2 hours' end,
    case when status in ('coletada', 'entregue') then now() - interval '1 hour' end,
    case when status = 'entregue' then now() - interval '30 minutes' end
  from novas
  returning id, titulo, status
), criadas as (
  select i.id, i.status, n.doador_profile, n.voluntario_profile
  from ins i
  join novas n using (titulo, status)
)
insert into public.oferta_historico (
  oferta_id, status_anterior, status_novo, ator_id, ator_tipo, comentario, criado_em
)
select
  c.id,
  case when h.n = 1 then null else 'publicada'::public.status_oferta end,
  h.status_novo,
  case
    when h.ator = 'doador' then c.doador_profile
    when h.ator = 'voluntario' then c.voluntario_profile
    else null
  end,
  h.ator::public.user_type,
  case when h.n = 1 then 'Oferta publicada pelo doador.' else h.comentario end,
  now() - ((5 - h.n) * interval '30 minutes')
from criadas c
cross join (values
  (1, 'publicada'::public.status_oferta, 'doador', ''),
  (2, 'aceita'::public.status_oferta, 'instituicao', 'Aceita pela instituição.'),
  (3, 'coletada'::public.status_oferta, 'voluntario', 'Coletada do doador.'),
  (4, 'entregue'::public.status_oferta, 'voluntario', 'Entregue na instituição.')
) as h(n, status_novo, ator, comentario)
where h.n <= case c.status
  when 'aceita' then 2
  when 'coletada' then 3
  when 'entregue' then 4
  else 1
end;

select count(*) as entregas_criadas from public.ofertas where titulo like '[ENTREGA]%';
