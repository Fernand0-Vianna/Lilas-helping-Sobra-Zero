# ⚙️ 05 — Jobs, Triggers e Funções

> Explicação detalhada de cada função, trigger e job agendado do **Sobra Zero**,
> com foco nas RNs que cada uma implementa.

---

## 📋 Índice

| # | Função | Tipo | RN |
|---|--------|------|-----|
| 1 | `fn_expirar_ofertas()` | Função + job pg_cron | RN-02 |
| 2 | `fn_oferta_setar_prazos()` | Trigger (BEFORE INSERT) | RN-01, RN-08 |
| 3 | `fn_registrar_historico()` | Trigger (AFTER) | — |
| 4 | `fn_touch_updated_at()` | Trigger genérica | — |
| 5 | `fn_handle_new_user()` | Trigger (auth.users) | — |
| 6 | `fn_prazo_padrao()` | Função SQL imutável | RN-01, RN-08 |
| 7 | `fn_alimento_exige_frio()` | Função SQL imutável | RN-03, RN-04 |
| 8 | `fn_transicao_valida()` | Função SQL imutável | — |
| 9 | `meu_doador_id()` / `minha_instituicao_id()` / `meu_voluntario_id()` / `meu_user_type()` | Helper | — |
| 10 | `pode_ofertar()` | Regra de negócio | RN-05 |
| 11 | `pode_aceitar()` | Regra de negócio | RN-03 |
| 12 | `pode_assumir()` | Regra de negócio | RN-04 |
| 13 | `pode_confirmar()` | Regra de negócio | RN-07 |
| 14 | `criar_oferta()` | RPC front-end | RN-01, RN-05, RN-08 |
| 15 | `aceitar_oferta()` | RPC front-end | RN-03 |
| 16 | `assumir_transporte()` | RPC front-end | RN-04 |
| 17 | `avancar_status()` | RPC front-end | RN-01 a RN-07 |
| 18 | `confirmar_recebimento()` | RPC front-end | RN-07 |

---

## 1️⃣ `fn_expirar_ofertas()` — RN-02 (expiração automática)

### O que faz

Marca como `expirada` todas as ofertas cujo `expira_em` já passou, desde que
ainda estejam nos status `publicada` ou `aceita`. Registra o motivo do descarte
para o relatório.

### Código

```sql
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
     where status in ('publicada', 'aceita')
       and expira_em <= now()
    returning id
  loop
    qtd := qtd + 1;
    -- Registra na timeline (o trigger fn_registrar_historico já grava,
    -- mas adicionamos uma nota explícita para o relatório de descartes):
    insert into public.oferta_historico (oferta_id, status_novo, comentario)
    values (r.id, 'expirada',
            'Oferta expirada automaticamente pelo agendador (RN-02).');
  end loop;
  return qtd;
end;
$$;
```

### Agendamento via `pg_cron`

```sql
-- Habilita a extensão (se disponível)
create extension if not exists pg_cron;

-- Agenda para rodar a cada 15 minutos
do $$
begin
  if to_regnamespace('cron') is not null then
    if exists (select 1 from cron.job where jobname = 'sobrazero-expirar-ofertas') then
      perform cron.unschedule('sobrazero-expirar-ofertas');
    end if;
    perform cron.schedule(
      'sobrazero-expirar-ofertas',
      '*/15 * * * *',                                    -- cron expression
      $cron$select public.fn_expirar_ofertas();$cron$
    );
  end if;
end
$$;
```

> **Em ambiente local (`supabase start`)**, `pg_cron` já vem habilitado.
> **No plano gratuito do Supabase**, habilite em: Database → Extensions → buscar "pg_cron".

### Testar manualmente

```sql
select public.fn_expirar_ofertas();
-- Retorna a quantidade de ofertas expiradas
```

---

## 2️⃣ `fn_oferta_setar_prazos()` — RN-01, RN-08

### O que faz

Trigger `BEFORE INSERT` na tabela `ofertas`. Se o front-end não enviar
`prazo_coleta` e `prazo_entrega`, calcula automaticamente via `fn_prazo_padrao()`.

```sql
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
      from public.fn_prazo_padrao(new.tipo_alimento, new.data_preparo);

    new.prazo_coleta  := coalesce(new.prazo_coleta,  v_coleta);
    new.prazo_entrega := coalesce(new.prazo_entrega, v_entrega);
    new.expira_em     := coalesce(new.expira_em,     v_entrega);
  end if;
  return new;
end;
$$;
```

### Prazos por tipo de alimento (RN-01 / RN-08)

| `tipo_alimento` | `prazo_coleta` | `prazo_entrega` | `expira_em` |
|-----------------|----------------|-----------------|-------------|
| `preparado`     | +4h do preparo | +6h (4h + 2h)   | = prazo_entrega |
| `frio`          | +4h do preparo | +6h (4h + 2h)   | = prazo_entrega |
| `congelado`     | +48h           | +48h            | = prazo_entrega |
| `nao_perecivel` | +24h           | +24h            | = prazo_entrega |

---

## 3️⃣ `fn_registrar_historico()` — Timeline append-only

Dispara em `AFTER INSERT OR UPDATE OF status` na tabela `ofertas`.
Cada mudança de status vira uma linha em `oferta_historico`.

```sql
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
    insert into public.oferta_historico
      (oferta_id, status_anterior, status_novo, ator_id, ator_tipo)
    values (new.id, null, new.status, v_ator_id, public.meu_user_type());

  elsif new.status is distinct from old.status then
    select p.user_type into v_ator_tipo
    from public.profiles p where p.id = v_ator_id;

    insert into public.oferta_historico
      (oferta_id, status_anterior, status_novo, ator_id, ator_tipo, comentario)
    values (new.id, old.status, new.status, v_ator_id,
            coalesce(v_ator_tipo, public.meu_user_type()), null);
  end if;
  return new;
end;
$$;
```

---

## 4️⃣ `fn_touch_updated_at()` — Housekeeping

Trigger genérica que atualiza a coluna `atualizado_em` em qualquer tabela
que a adicione. Conceito: **o banco é a fonte da verdade para timestamps**.

---

## 5️⃣ `fn_handle_new_user()` — Trigger de criação de profile

Dispara em `AFTER INSERT` em `auth.users` (via GoTrue `signUp`).
Lê `raw_user_meta_data` para gravar `user_type`, `nome` e `telefone` no
profile automaticamente.

---

## 6️⃣ `fn_prazo_padrao(tipo, data_preparo)` — RN-01, RN-08

Função `IMMUTABLE` que deriva os prazos do tipo de alimento.

---

## 7️⃣ `fn_alimento_exige_frio(tipo)` — RN-03, RN-04

Retorna `true` para `frio` e `congelado`. Usada internamente pelo
`exige_frio` (coluna gerada) e pode ser chamada no front-end para
mostrar alertas de cadeia de frio.

---

## 8️⃣ `fn_transicao_valida(de, para)` — Whitelist do ciclo

Garante que o status avance **sequencialmente**, sem saltos.

```sql
-- Estados finais (não saem mais): confirmada, expirada, descartada, cancelada
when 'publicada'  then p_para in ('aceita', 'expirada', 'descartada', 'cancelada')
when 'aceita'     then p_para in ('coletada', 'expirada', 'cancelada')
when 'coletada'   then p_para in ('entregue', 'cancelada')
when 'entregue'   then p_para in ('confirmada', 'cancelada')
else false
```

---

## 9️⃣ Helpers de identidade

| Função | Retorna | Segurança |
|--------|---------|-----------|
| `meu_doador_id()` | UUID ou NULL | `SECURITY DEFINER` |
| `minha_instituicao_id()` | UUID ou NULL | `SECURITY DEFINER` |
| `meu_voluntario_id()` | UUID ou NULL | `SECURITY DEFINER` |
| `meu_user_type()` | `user_type` | `SECURITY DEFINER` |

> Usadas **dentro de policies** e RPCs para evitar recursão de RLS.

---

## 🔟 Regras de negócio (RN diretas)

### `pode_ofertar(p_doador_id, p_tipo)` — RN-05

```sql
select exists (
  select 1 from public.doadores d
  where d.id = p_doador_id
    and (
      d.cadastro_sanitario_validade >= current_date
      or p_tipo = 'nao_perecivel'
    )
);
```

> Com cadastro sanitário vencido, **só pode ofertar não perecível**.

### `pode_aceitar(p_instituicao_id, p_oferta_id)` — RN-03

```sql
select exists (
  select 1
  from public.instituicoes i
  join public.ofertas o on o.id = p_oferta_id
  where i.id = p_instituicao_id
    and o.status = 'publicada'
    and o.expira_em > now()          -- RN-01/RN-02
    and (
      o.exige_frio = false
      or (i.tem_refrigeracao and (
        o.tipo_alimento <> 'congelado'
        or i.aceita_congelado
      ))
    )
);
```

> Instituição sem refrigeração **não pode aceitar oferta de frio/congelado**.

### `pode_assumir(p_voluntario_id, p_oferta_id)` — RN-04

```sql
select exists (
  select 1
  from public.voluntarios v
  join public.ofertas o on o.id = p_oferta_id
  where v.id = p_voluntario_id
    and v.disponivel
    and o.status in ('publicada', 'aceita')
    and o.expira_em > now()
    and (o.exige_frio = false or v.tem_caixa_termica)
);
```

> Voluntário sem caixa térmica **não pode transportar frio/congelado**.

### `pode_confirmar(p_user_id, p_oferta_id)` — RN-07

```sql
select exists (
  select 1
  from public.ofertas o
  join public.instituicoes i on i.id = o.instituicao_id
  where o.id = p_oferta_id
    and o.status = 'entregue'
    and i.profile_id = p_user_id
);
```

> Só a instituição dona da oferta, em status `entregue`, pode confirmar.

---

## 🔢 RPCs chamadas pelo front-end

### `criar_oferta(...)` — RN-01, RN-05, RN-08

Valida se o doador pode ofertar (RN-05), calcula prazos (RN-01/RN-08),
rejeita datas futuras e insere a oferta.

### `aceitar_oferta(uuid)` — RN-03

Valida `pode_aceitar()`, atualiza status → `aceita` + `instituicao_id` + `aceita_em`.

### `assumir_transporte(uuid)` — RN-04

Valida `pode_assumir()`, atualiza `voluntario_id`.

### `avancar_status(uuid, status, comentario)` — RN-01 a RN-07

Controla TODAS as transições:
- `publicada → aceita` → **usar `aceitar_oferta()`**
- `aceita → coletada` → só o voluntário atribuído
- `coletada → entregue` → só o voluntário atribuído
- `entregue → confirmada` → **usar `confirmar_recebimento()`**
- `publicada/aceita → expirada/descartada` → só o doador
- `publicada/aceita → cancelada` → doador ou instituição

### `confirmar_recebimento(uuid, kg, obs)` — RN-07

Valida `pode_confirmar()`, insere em `recebimentos`, atualiza status → `confirmada`.

---

## 📊 View de equidade (RN-06)

### `vw_equidade_instituicoes`

```sql
create or replace view public.vw_equidade_instituicoes with (security_invoker = true) as
select
  i.id as instituicao_id,
  i.profile_id,
  p.nome as nome,
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
```

### `vw_ofertas_feed` (usa a view de equidade)

```sql
create or replace view public.vw_ofertas_feed with (security_invoker = true) as
select
  o.*,
  d.nome_estabelecimento as doador_nome,
  ...
  coalesce(eq.kg_recebidos_30d, 99999) as kg_recebidos_30d_prioridade
from public.ofertas o
join public.doadores d on d.id = o.doador_id
left join public.voluntarios v on v.id = o.voluntario_id
left join public.instituicoes i on i.id = o.instituicao_id
left join public.vw_equidade_instituicoes eq on eq.instituicao_id = o.instituicao_id;
```

> **Ordenação por equidade (RN-06):** `ORDER BY kg_recebidos_30d_prioridade ASC`

---

## ✅ Checklist de validação

- [ ] `fn_expirar_ofertas()` testada manualmente (`select public.fn_expirar_ofertas();`)
- [ ] pg_cron agendado (verifique em `Database → Replication → Jobs`)
- [ ] Triggers de prazos e histórico ativos
- [ ] Todas as funções têm `set search_path = public, pg_temp`
- [ ] Funções de automação são `SECURITY DEFINER`
- [ ] RPCs têm `grant execute on ... to authenticated`
- [ ] Views têm `security_invoker = true`
- [ ] `vw_equidade_instituicoes` retorna `kg_recebidos_30d` ordenado ASC
