-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260111000000_seed_demo.sql — dados de demonstração do MVP
-- ---------------------------------------------------------------------
-- Os perfis têm FK obrigatória com auth.users, então não é possível criar
-- usuários de teste por SQL. Este seed reaproveita um vínculo já existente
-- (doador "Cantina do Zé") e apenas ACRESCENTA ofertas marcadas [TESTE].
-- Os 2 perfis antigos e seus CNPJs permanecem intactos.
--
-- exige_frio é coluna gerada: deriva de tipo_alimento, não é inserida.
-- Idempotente: NOT EXISTS por título marcado [TESTE].
-- =====================================================================

insert into public.ofertas (
  doador_id, titulo, descricao, tipo_alimento,
  quantidade_kg, porcoes, data_preparo, prazo_coleta, prazo_entrega,
  expira_em, status, endereco_coleta, bairro_coleta, observacoes
)
select
  d.id,
  x.titulo,
  x.descricao,
  x.tipo_alimento,
  x.quantidade_kg,
  x.porcoes,
  now(),
  now() + interval '2 hours',
  now() + interval '4 hours',
  now() + interval '2 hours',
  'publicada'::public.status_oferta,
  'Cantina demonstração [TESTE]',
  'Centro',
  '[TESTE] Oferta de demonstração do MVP - não é alimento real.'
from public.doadores d
cross join (values
  ('[TESTE] Salada de maionese', 'Demonstração de alimento preparado (RN-01).', 'preparado'::public.tipo_alimento, 12::numeric, 40),
  ('[TESTE] Iogurtes refrigerados', 'Demonstração de cadeia de frio (RN-03/RN-04).', 'frio'::public.tipo_alimento, 8::numeric, 32),
  ('[TESTE] Arroz e feijão', 'Demonstração de não perecível.', 'nao_perecivel'::public.tipo_alimento, 25::numeric, 100)
) as x(titulo, descricao, tipo_alimento, quantidade_kg, porcoes)
where d.profile_id = '6a4ec4a2-932c-4361-b4e8-465570b7e3c2'::uuid
  and not exists (
    select 1 from public.ofertas o where o.titulo = x.titulo
  );

select 'seed-demo ok' as status;
