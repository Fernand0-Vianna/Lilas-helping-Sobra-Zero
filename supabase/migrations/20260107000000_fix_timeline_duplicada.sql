-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Repair 20260107000000_fix_timeline_duplicada.sql
-- ---------------------------------------------------------------------
-- Sintoma: a timeline (telas 06-08) mostrava DOIS eventos para cada
-- expiração automática (RN-02) e para cada cancelamento com motivo.
--
-- Causa: o trigger trg_ofertas_historico já grava uma linha a cada
-- mudança de status; fn_expirar_ofertas() e avancar_status() inseriam
-- UMA SEGUNDA linha manualmente para anexar o comentário.
--
-- Correção: as funções passam a anexar o comentário à linha do trigger
-- (update) em vez de inserir de novo. Este arquivo também limpa as
-- duplicações já gravadas no banco, de forma idempotente.
--
-- Idempotente: pode rodar quantas vezes for preciso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Deduplica o histórico já gravado (uma única passada).
--    Grupos: mesmos oferta_id + status_novo + segundo de criação, com
--    uma linha comentada e outra sem comentário (o par trigger+manual).
--    Mantém a linha do trigger (min id), transplanta para ela o
--    comentário e o ator da irmã, e apaga a duplicata. Tudo num único
--    statement: assim o DELETE enxerga o estado original do grupo via
--    o snapshot compartilhado dos CTEs.
-- ---------------------------------------------------------------------
with duplicatas as (
  select min(id) as keep_id,
         max(id) as drop_id,
         max(comentario) filter (where comentario is not null) as melhor_comentario,
         max(ator_id)    filter (where ator_id   is not null)  as algum_ator,
         max(ator_tipo)  filter (where ator_tipo is not null)  as algum_ator_tipo
  from public.oferta_historico
  group by oferta_id, status_novo, date_trunc('second', criado_em)
  having count(*) > 1
     and bool_or(comentario is not null)
     and bool_or(comentario is null)
),
transplante as (
  update public.oferta_historico h
     set comentario = coalesce(h.comentario, d.melhor_comentario),
         ator_id    = coalesce(h.ator_id,    d.algum_ator),
         ator_tipo  = coalesce(h.ator_tipo,  d.algum_ator_tipo)
    from duplicatas d
   where h.id = d.keep_id
  returning h.id
),
remocao as (
  delete from public.oferta_historico h
  using duplicatas d
  where h.id = d.drop_id
  returning h.id
)
select (select count(*) from transplante) as corrigidas,
       (select count(*) from remocao)     as removidas;

-- ---------------------------------------------------------------------
-- 2. fn_expirar_ofertas() - anexa o comentário à linha do trigger.
-- ---------------------------------------------------------------------
create or replace function public.fn_expirar_ofertas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  qtd integer := 0;
begin
  for r in
    update public.ofertas
       set status          = 'expirada',
           expirada_em     = now(),
           motivo_descarte = coalesce(motivo_descarte,
                                      'Prazo de coleta expirado (' || to_char(expira_em, 'DD/MM/YYYY HH24:MI') || ')')
     where status in ('publicada'::public.status_oferta, 'aceita'::public.status_oferta)
       and expira_em <= now()
    returning id
  loop
    qtd := qtd + 1;
    -- O trigger trg_ofertas_historico ja grava a linha do historico;
    -- apenas anexamos o motivo automatico a ELA, em vez de inserir uma
    -- segunda linha (o que duplicava o evento na timeline).
    update public.oferta_historico
       set comentario = 'Oferta expirada automaticamente pelo agendador (RN-02).'
     where id = (
       select id from public.oferta_historico
       where oferta_id = r.id
         and status_novo = 'expirada'::public.status_oferta
       order by id desc
       limit 1
     );
  end loop;

  return qtd;
end;
$$;

comment on function public.fn_expirar_ofertas() is
  'RN-02: marca como expirada toda oferta aberta fora do prazo. Anexa o comentario a linha do trigger (sem duplicar a timeline).';

-- ---------------------------------------------------------------------
-- 3. avancar_status() - mesmo tratamento para o comentario opcional.
-- ---------------------------------------------------------------------
create or replace function public.avancar_status(
  p_oferta_id  uuid,
  p_destino    public.status_oferta,
  p_comentario text default null
)
returns public.ofertas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oferta public.ofertas;
  v_minha_inst uuid := public.minha_instituicao_id();
  v_meu_vol   uuid := public.meu_voluntario_id();
  v_meu_doador uuid := public.meu_doador_id();
begin
  select * into v_oferta from public.ofertas where id = p_oferta_id for update;

  if v_oferta.id is null then
    raise exception 'Oferta nao encontrada.' using errcode = 'P0002';
  end if;

  if not public.fn_transicao_valida(v_oferta.status, p_destino) then
    raise exception 'Transicao invalida: % -> %.', v_oferta.status, p_destino
      using errcode = 'check_violation';
  end if;

  case p_destino
    when 'aceita' then
      raise exception 'Use aceitar_oferta() para registrar o aceite com as regras RN-03.'
        using errcode = '42501';

    when 'coletada' then
      if v_meu_vol is null or v_oferta.voluntario_id is distinct from v_meu_vol then
        raise exception 'Somente o voluntario que assumiu o transporte pode registrar a coleta.'
          using errcode = '42501';
      end if;
      update public.ofertas set status = 'coletada', coletada_em = now()
       where id = p_oferta_id;

    when 'entregue' then
      if v_meu_vol is null or v_oferta.voluntario_id is distinct from v_meu_vol then
        raise exception 'Somente o voluntario que assumiu o transporte pode registrar a entrega.'
          using errcode = '42501';
      end if;
      update public.ofertas set status = 'entregue', entregue_em = now()
       where id = p_oferta_id;

    when 'confirmada' then
      raise exception 'Use confirmar_recebimento(): a entrega so conclui com a confirmacao da instituicao (RN-07).'
        using errcode = '42501';

    when 'expirada' then
      if v_meu_doador is distinct from v_oferta.doador_id then
        raise exception 'Somente o doador pode marcar a oferta como expirada.'
          using errcode = '42501';
      end if;
      update public.ofertas
         set status = 'expirada', expirada_em = now(),
             motivo_descarte = coalesce(p_comentario, 'Expirada pelo doador')
       where id = p_oferta_id;

    when 'descartada' then
      if v_meu_doador is distinct from v_oferta.doador_id then
        raise exception 'Somente o doador pode registrar o descarte.'
          using errcode = '42501';
      end if;
      update public.ofertas
         set status = 'descartada', descartada_em = now(),
             motivo_descarte = coalesce(p_comentario, 'Descarte registrado pelo doador')
       where id = p_oferta_id;

    when 'cancelada' then
      if v_meu_doador is distinct from v_oferta.doador_id
         and v_minha_inst is distinct from v_oferta.instituicao_id then
        raise exception 'Somente o doador ou a instituicao podem cancelar a oferta.'
          using errcode = '42501';
      end if;
      update public.ofertas set status = 'cancelada', cancelada_em = now()
       where id = p_oferta_id;
  end case;

  -- Comentario opcional: anexa a linha que o trigger acabou de gravar,
  -- em vez de inserir uma segunda linha (duplicava o evento na timeline).
  if p_comentario is not null and p_destino not in ('expirada','descartada') then
    update public.oferta_historico
       set comentario = p_comentario
     where id = (
       select id from public.oferta_historico
       where oferta_id = p_oferta_id and status_novo = p_destino
       order by id desc
       limit 1
     );
  end if;

  select * into v_oferta from public.ofertas where id = p_oferta_id;
  return v_oferta;
end;
$$;

comment on function public.avancar_status(uuid, public.status_oferta, text) is
  'RPC: avanca o ciclo de vida validando quem pode fazer cada passo. Comentario vai para a linha do trigger (timeline sem duplicatas).';

-- Privilegios se mantem iguais a migration original (create or replace
-- preserva grants); reforçamos apenas o da RPC para o caso de banco novo.
grant execute on function
  public.avancar_status(uuid, public.status_oferta, text)
to authenticated;
