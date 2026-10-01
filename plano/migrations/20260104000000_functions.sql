-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260104000000_functions.sql
-- ---------------------------------------------------------------------
-- O que este arquivo faz:
--   1. helpers "meu_perfil" (usados dentro das policies, sem recursão de RLS)
--   2. funções de regra de negócio: pode_ofertar (RN-05),
--      pode_aceitar (RN-03), pode_assumir (RN-04), pode_confirmar (RN-07)
--   3. triggers: prazos automáticos (RN-01/RN-08) e histórico de status
--   4. RPCs do front-end: criar_oferta, assumir_transporte,
--      avancar_status, confirmar_recebimento
--   5. expirar_ofertas() + agendamento no pg_cron (RN-02)
--   6. RLS + TODAS as policies de leitura/escrita
--
-- Ordem de leitura: 01 (ENUMs) -> 02 (perfis) -> 03 (ofertas) -> 04 (este).
-- =====================================================================


-- =====================================================================
-- PARTE 1 · Helpers de identidade
-- =====================================================================
-- Precisamos descobrir, a partir de auth.uid(), qual registro de detalhe
-- (doador/instituicao/voluntario) pertence a esse usuario.
-- SECURITY DEFINER + search_path fixo: assim a policy pode chamar a função
-- sem disparar recursão de RLS e sem risco de sequestro de objeto.

create or replace function public.meu_doador_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id from public.doadores d where d.profile_id = auth.uid();
$$;

create or replace function public.minha_instituicao_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id from public.instituicoes i where i.profile_id = auth.uid();
$$;

create or replace function public.meu_voluntario_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.id from public.voluntarios v where v.profile_id = auth.uid();
$$;

create or replace function public.meu_user_type()
returns public.user_type
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_type from public.profiles p where p.id = auth.uid();
$$;

comment on function public.meu_doador_id() is
  'id do doador do usuario logado, ou NULL se ele nao for doador. Use dentro de policies.';
comment on function public.meu_user_type() is
  'user_type do usuario logado (doador | instituicao | voluntario).';


-- =====================================================================
-- PARTE 2 · Regras de negocio (RN-03, RN-04, RN-05)
-- =====================================================================

-- 2.1. RN-05 — cadastro sanitario vencido so permite nao_perecivel.
create or replace function public.pode_ofertar(
  p_doador_id uuid,
  p_tipo      public.tipo_alimento
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.doadores d
    where d.id = p_doador_id
      and (
        d.cadastro_sanitario_validade >= current_date
        or p_tipo = 'nao_perecivel'::public.tipo_alimento
      )
  );
$$;

comment on function public.pode_ofertar(uuid, public.tipo_alimento) is
  'RN-05: com cadastro sanitario vencido, o doador so pode ofertar nao_perecivel.';

-- 2.2. RN-03 — instituicao sem refrigeracao nao aceita alimento que exige frio.
-- Tambem exige que a oferta ainda esteja dentro do prazo (RN-01/RN-02).
create or replace function public.pode_aceitar(
  p_instituicao_id uuid,
  p_oferta_id      uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.instituicoes i
    join public.ofertas o on o.id = p_oferta_id
    where i.id = p_instituicao_id
      and o.status = 'publicada'::public.status_oferta
      and o.expira_em > now()                                   -- RN-01/RN-02
      and (
        o.exige_frio = false
        or (i.tem_refrigeracao and (
              o.tipo_alimento <> 'congelado'::public.tipo_alimento
              or i.aceita_congelado
            ))
      )
  );
$$;

comment on function public.pode_aceitar(uuid, uuid) is
  'RN-03: so aceita oferta nao expirada e, se exige frio, exige refrigeracao na instituicao.';

-- 2.3. RN-04 — voluntario sem caixa termica nao transporta alimento frio/congelado.
create or replace function public.pode_assumir(
  p_voluntario_id uuid,
  p_oferta_id     uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.voluntarios v
    join public.ofertas o on o.id = p_oferta_id
    where v.id = p_voluntario_id
      and v.disponivel
      and o.status in ('publicada'::public.status_oferta, 'aceita'::public.status_oferta)
      and o.expira_em > now()
      and (o.exige_frio = false or v.tem_caixa_termica)
  );
$$;

comment on function public.pode_assumir(uuid, uuid) is
  'RN-04: voluntario precisa estar disponivel e ter caixa termica se a oferta exigir frio.';

-- 2.4. RN-07 — somente a instituicao dona da oferta pode confirmar o recebimento.
create or replace function public.pode_confirmar(
  p_user_id   uuid,
  p_oferta_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ofertas o
    join public.instituicoes i on i.id = o.instituicao_id
    where o.id = p_oferta_id
      and o.status = 'entregue'::public.status_oferta
      and i.profile_id = p_user_id
  );
$$;

comment on function public.pode_confirmar(uuid, uuid) is
  'RN-07: a confirmacao exige oferta entregue + instituicao dona da oferta.';


-- =====================================================================
-- PARTE 3 · Triggers
-- =====================================================================

-- 3.1. Prazos automaticos (RN-01 / RN-08).
-- Roda ANTES do insert: se o front-end nao mandou prazo, calculamos aqui.
-- Assim nao existe oferta no banco sem prazo - a RN-01 e garantida no servidor.
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
    -- prazo Entrega tambem e o limite do ciclo; o cron usa expira_em.
    new.expira_em     := coalesce(new.expira_em,     v_entrega);
  end if;
  return new;
end;
$$;

comment on function public.fn_oferta_setar_prazos() is
  'Trigger BEFORE INSERT: preenche prazo_coleta, prazo_entrega e expira_em (RN-01, RN-08).';

drop trigger if exists trg_ofertas_prazos on public.ofertas;
create trigger trg_ofertas_prazos
  before insert on public.ofertas
  for each row execute function public.fn_oferta_setar_prazos();

-- 3.2. Timeline de status (oferta_historico).
-- Todo insert e todo avanco de status vira uma linha de historico.
create or replace function public.fn_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ator_id   uuid := auth.uid();
  v_ator_tipo public.user_type;
begin
  if tg_op = 'INSERT' then
    insert into public.oferta_historico (oferta_id, status_anterior, status_novo, ator_id, ator_tipo)
    values (new.id, null, new.status, v_ator_id, public.meu_user_type());

  elsif new.status is distinct from old.status then
    select p.user_type into v_ator_tipo from public.profiles p where p.id = v_ator_id;

    insert into public.oferta_historico (oferta_id, status_anterior, status_novo, ator_id, ator_tipo)
    values (new.id, old.status, new.status, v_ator_id, coalesce(v_ator_tipo, public.meu_user_type()));
  end if;

  return new;
end;
$$;

comment on function public.fn_registrar_historico() is
  'Trigger AFTER INSERT/UPDATE OF status: mantem a timeline (telas 06-08) e a auditoria.';

drop trigger if exists trg_ofertas_historico on public.ofertas;
create trigger trg_ofertas_historico
  after insert or update of status on public.ofertas
  for each row execute function public.fn_registrar_historico();


-- =====================================================================
-- PARTE 4 · RPCs chamadas pelo front-end (supabase.rpc)
-- =====================================================================

-- 4.1. Criar oferta. Aplica RN-05 e calcula os prazos (RN-01/RN-08).
create or replace function public.criar_oferta(
  p_titulo         text,
  p_tipo           public.tipo_alimento,
  p_quantidade_kg  numeric,
  p_data_preparo   timestamptz,
  p_endereco_coleta text,
  p_descricao      text default null,
  p_porcoes        integer default null,
  p_bairro_coleta  text default null,
  p_observacoes    text default null
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

  -- RN-05
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
    p_data_preparo, v_coleta, v_entrega, v_entrega,
    p_endereco_coleta, p_bairro_coleta, p_observacoes
  )
  returning * into v_oferta;

  return v_oferta;
end;
$$;

comment on function public.criar_oferta is
  'RPC: publica uma oferta. Valida RN-05 e grava os prazos de RN-01/RN-08.';

-- 4.2. Voluntario assume o transporte (RN-04).
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
  returning * into v_oferta;

  return v_oferta;
end;
$$;

comment on function public.assumir_transporte(uuid) is
  'RPC: volunteer assume a oferta. Aplica RN-04 e o filtro de disponibilidade.';

-- 4.3. Institucao aceita a oferta (RN-03).
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
  returning * into v_oferta;

  return v_oferta;
end;
$$;

comment on function public.aceitar_oferta(uuid) is
  'RPC: institucao aceita a oferta. Aplica RN-03 e o prazo (RN-01).';

-- 4.4. Avancar o ciclo (telas 06 -> 07 -> 08).
-- Quem pode fazer cada passo:
--   publicada -> aceita    : instituicao  (use aceitar_oferta)
--   aceita    -> coletada  : voluntario do transporte
--   coletada  -> entregue  : voluntario do transporte
--   entregue  -> confirmada: instituicao   (use confirmar_recebimento, RN-07)
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

  -- Comentario opcional vira uma nota na timeline.
  if p_comentario is not null and p_destino not in ('expirada','descartada') then
    insert into public.oferta_historico (oferta_id, status_novo, ator_id, ator_tipo, comentario)
    values (p_oferta_id, p_destino, auth.uid(), public.meu_user_type(), p_comentario);
  end if;

  select * into v_oferta from public.ofertas where id = p_oferta_id;
  return v_oferta;
end;
$$;

comment on function public.avancar_status(uuid, public.status_oferta, text) is
  'RPC: avanca o ciclo de vida da oferta validando quem pode fazer cada passo (RN-07 inclusa).';

-- 4.5. RN-07 — a instituicao confirma e o ciclo fecha.
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

comment on function public.confirmar_recebimento(uuid, numeric, text) is
  'RPC: RN-07. Grava o recebimento e move a oferta para confirmada.';


-- =====================================================================
-- PARTE 5 · RN-02 — expirar ofertas fora do prazo (pg_cron)
-- =====================================================================

-- 5.1. A funcao em si. Pode ser chamada na mao (para testar) ou pelo cron.
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
  -- Ofertas ainda abertas cujo prazo final ja passou (RN-02).
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
    -- O trigger fn_registrar_historico ja grava a linha do historico,
    -- mas registramos tambem o motivo do descarte para o relatorio (tela 12).
    insert into public.oferta_historico (oferta_id, status_novo, comentario)
    values (r.id, 'expirada'::public.status_oferta,
            'Oferta expirada automaticamente pelo agendador (RN-02).');
  end loop;

  return qtd;
end;
$$;

comment on function public.fn_expirar_ofertas() is
  'RN-02: marca como expirada toda oferta aberta fora do prazo. Retorna quantas foram expiradas.';

-- 5.2. Habilitar o pg_cron.
-- O projeto usa o pg_cron apenas para o agendamento automatico da RN-02.
-- Como a extensao so pode ser habilitada em alguns ambientes, tentamos
-- aqui e, se falhar, apenas registramos um aviso (a migration NAO quebra).
-- Como habilitar manualmente:
--   Painel -> Database -> Extensions -> busca "pg_cron" -> Enable
--   ou SQL Editor: create extension pg_cron;
-- Em ambiente local (supabase start) ela ja vem habilitada.
do $$
begin
  execute 'create extension if not exists pg_cron';
exception
  when others then
    raise notice 'pg_cron nao habilitado automaticamente (%). Habilite manualmente em Database > Extensions.', sqlerrm;
end
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    execute 'grant usage on schema cron to postgres';
  end if;
end
$$;

-- O cron roda com privilegios de superusuario: por isso a funcao acima e
-- SECURITY DEFINER e nunca depende de auth.uid() (uma expiracao nao tem "dono").
-- A cada 15 minutos e suficiente para o prototipo; em producao, use 5 min.
-- O bloco so agenda se o schema cron existir, e remove a inscricao anterior
-- para a migration poder rodar varias vezes sem duplicar o job.
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'Schema cron indisponivel: agendamento da RN-02 nao criado.';
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


-- =====================================================================
-- PARTE 6 · RLS e policies
-- =====================================================================
-- Lembrete: `alter table ... enable row level security` nao basta.
-- Sem policy, a tabela fica fechada para todos (inclusive o usuario dono).
-- `force row level security` garante que ate o dono da tabela sofra RLS.

-- ---------------------------------------------------------------------
-- 6.1. profiles — cada um ve so a si mesmo
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- 6.2. doadores — leitura para montar o feed; escrita só do próprio
-- ---------------------------------------------------------------------
alter table public.doadores enable row level security;

-- Leitura: o feed (tela 05) precisa mostrar nome/bairro/telefone do doador.
-- Trade-off consciente do protótipo: dados de contato são visíveis a
-- qualquer usuário logado. Em produção, exporia-se uma view pública
-- (id, nome_estabelecimento, bairro) e o resto ficaria privado.
create policy doadores_select_authenticated on public.doadores
  for select to authenticated
  using (true);

create policy doadores_insert_own on public.doadores
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy doadores_update_own on public.doadores
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6.3. instituicoes
-- ---------------------------------------------------------------------
alter table public.instituicoes enable row level security;

create policy instituicoes_select_authenticated on public.instituicoes
  for select to authenticated
  using (true);

create policy instituicoes_insert_own on public.instituicoes
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy instituicoes_update_own on public.instituicoes
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6.4. voluntarios
-- ---------------------------------------------------------------------
alter table public.voluntarios enable row level security;

create policy voluntarios_select_authenticated on public.voluntarios
  for select to authenticated
  using (true);

create policy voluntarios_insert_own on public.voluntarios
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy voluntarios_update_own on public.voluntarios
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6.5. ofertas — a policy mais importante do projeto
-- ---------------------------------------------------------------------
alter table public.ofertas enable row level security;

-- LEITURA:
--   - oferta ainda publicada  -> visível no feed para qualquer logado
--   - oferta em andamento     -> só para quem participa dela
create policy ofertas_select_feed_ou_envolvidos on public.ofertas
  for select to authenticated
  using (
    (status = 'publicada' and expira_em > now())
    or doador_id      = public.meu_doador_id()
    or instituicao_id = public.minha_instituicao_id()
    or voluntario_id  = public.meu_voluntario_id()
  );

-- ESCRITA: só o doador dono cria a oferta.
create policy ofertas_insert_doador on public.ofertas
  for insert to authenticated
  with check (doador_id = public.meu_doador_id());

-- ATUALIZAÇÃO direta: liberada apenas para o doador, e apenas na coluna
-- `observacoes` (ver o GRANT de coluna mais abaixo). Qualquer mudança de
-- status tem que passar pelas RPCs, que aplicam as RNs.
create policy ofertas_update_doador on public.ofertas
  for update to authenticated
  using (doador_id = public.meu_doador_id())
  with check (doador_id = public.meu_doador_id());

-- Reforço: como o update é de coluna restrita, a policy acima cobre o
-- suficiente. Participantes não alteram a oferta direto — eles usam RPC.

-- Privilégio de coluna: sem isso, um doador poderia fazer
-- UPDATE ofertas SET status='confirmada' sem passar pela instituição (violando RN-07).
revoke update on public.ofertas from authenticated;
grant  update (observacoes) on public.ofertas to authenticated;
revoke insert, delete on public.ofertas from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6.6. oferta_historico — append-only, leitura só de quem participa
-- ---------------------------------------------------------------------
alter table public.oferta_historico enable row level security;

create policy oferta_historico_select_envolvidos on public.oferta_historico
  for select to authenticated
  using (
    exists (
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

-- Ninguém insere direto: só o trigger fn_registrar_historico (SECURITY DEFINER).
revoke insert, update, delete on public.oferta_historico from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6.7. recebimentos — RN-07 na prática
-- ---------------------------------------------------------------------
alter table public.recebimentos enable row level security;

create policy recebimentos_select_envolvidos on public.recebimentos
  for select to authenticated
  using (
    instituicao_id = public.minha_instituicao_id()
    or exists (
      select 1 from public.ofertas o
      where o.id = oferta_id
        and (o.doador_id = public.meu_doador_id()
             or o.voluntario_id = public.meu_voluntario_id())
    )
  );

-- Só a instituição dona da oferta insere — e a RPC ainda exige status 'entregue'.
create policy recebimentos_insert_instituicao on public.recebimentos
  for insert to authenticated
  with check (
    instituicao_id = public.minha_instituicao_id()
    and public.pode_confirmar(auth.uid(), oferta_id)
  );

revoke update, delete on public.recebimentos from anon, authenticated;

-- ---------------------------------------------------------------------
-- 6.8. Permissões das funções (o default é EXECUTE para PUBLIC)
-- ---------------------------------------------------------------------
-- Helpers de identidade: podem ser chamados de qualquer contexto autenticado.
grant execute on function
  public.meu_doador_id(),
  public.minha_instituicao_id(),
  public.meu_voluntario_id(),
  public.meu_user_type()
to authenticated;

-- Funções de regra: leitura, uteis para desabilitar botoes no front-end.
grant execute on function
  public.pode_ofertar(uuid, public.tipo_alimento),
  public.pode_aceitar(uuid, uuid),
  public.pode_assumir(uuid, uuid),
  public.pode_confirmar(uuid, uuid)
to authenticated;

-- Funções internas de automacao (triggers e cron) nao sao expostas.
revoke execute on function
  public.fn_touch_updated_at(),
  public.fn_oferta_setar_prazos(),
  public.fn_registrar_historico(),
  public.fn_handle_new_user()
from public;

-- RPCs do front-end.
grant execute on function
  public.criar_oferta(text, public.tipo_alimento, numeric, timestamptz, text,
                      text, integer, text, text),
  public.aceitar_oferta(uuid),
  public.assumir_transporte(uuid),
  public.avancar_status(uuid, public.status_oferta, text),
  public.confirmar_recebimento(uuid, numeric, text)
to authenticated;
