# 🔐 04 — Políticas RLS (Row Level Security)

> Como o Supabase protege cada tabela do **Sobra Zero** e como cada policy
> se relaciona com as regras de negócio (RN).

---

## 📋 Conceitos básicos

- **RLS ativado:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- **Force RLS:** mesmo o dono da tabela sofre RLS (ativado via `FORCE ROW LEVEL SECURITY`)
- **Policy `USING`:** filtra quais linhas podem ser **lidas**
- **Policy `WITH CHECK`:** filtra quais linhas podem ser **inseridas/atualizadas**
- **`auth.uid()`:** retorna o UUID do usuário logado (do GoTrue)

> Sem policy, a tabela fica **totalmente bloqueada** para `authenticated`.
> Sempre habilite RLS **e** crie policies — uma sem a outra é perigo.

---

## 🛡️ Políticas por tabela

### `profiles` — dado privado, só você vê

```sql
alter table public.profiles enable row level security;

-- SELECT: cada um vê apenas seu próprio profile
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- INSERT: só pode criar seu próprio profile
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- UPDATE: só pode atualizar seu próprio profile
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
```

### `doadores` — leitura aberta para autenticado, escrita só do dono

```sql
alter table public.doadores enable row level security;

-- SELECT: visível para montar o feed (nome, bairro, telefone do doador)
-- Trade-off do protótipo: dados de contato visíveis a qualquer logado
create policy doadores_select_authenticated on public.doadores
  for select to authenticated
  using (true);

-- INSERT/UPDATE: só o profile dono
create policy doadores_insert_own on public.doadores
  for insert to authenticated
  with check (profile_id = auth.uid());
create policy doadores_update_own on public.doadores
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
```

> **Trade-off consciente:** em produção, substituir por uma view pública
> com apenas `id`, `nome_estabelecimento` e `bairro`.

### `instituicoes` — mesmo padrão de `doadores`

```sql
alter table public.instituicoes enable row level security;
create policy instituicoes_select_authenticated for select to authenticated using (true);
create policy instituicoes_insert_own for insert to authenticated with check (profile_id = auth.uid());
create policy instituicoes_update_own for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
```

### `voluntarios` — mesmo padrão

```sql
alter table public.voluntarios enable row level security;
create policy voluntarios_select_authenticated for select to authenticated using (true);
create policy voluntarios_insert_own for insert to authenticated with check (profile_id = auth.uid());
create policy voluntarios_update_own for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
```

### `ofertas` — política central do projeto

```sql
alter table public.ofertas enable row level security;

-- LEITURA: oferta publicada no feed + quem participa
create policy ofertas_select_feed_ou_envolvidos on public.ofertas
  for select to authenticated
  using (
    (status = 'publicada' and expira_em > now())  -- RN-01/RN-02: só feed vivo
    or doador_id      = public.meu_doador_id()     -- doador vê SUAS ofertas
    or instituicao_id = public.minha_instituicao_id()
    or voluntario_id  = public.meu_voluntario_id()
  );

-- ESCRITA (INSERT): só o doador cria a oferta
create policy ofertas_insert_doador on public.ofertas
  for insert to authenticated
  with check (doador_id = public.meu_doador_id());

-- ATUALIZAÇÃO direta: restrita ao doador, só na coluna `observacoes`
create policy ofertdas_update_doador on public.ofertas
  for update to authenticated
  using (doador_id = public.meu_doador_id())
  with check (doador_id = public.meu_doador_id());

-- GRANT de coluna: ninguém altera status direto
revoke update on public.ofertas from authenticated;
grant  update (observacoes) on public.ofertas to authenticated;
revoke insert, delete on public.ofertas from anon, authenticated;
```

> ⚠️ **Todo avanço de status passa por RPC** (`aceitar_oferta`, `assumir_transporte`,
> `avancar_status`, `confirmar_recebimento`). A policy acima só protege `observacoes`.

### `oferta_historico` — append-only

```sql
alter table public.oferta_historico enable row level security;

-- SELECT: só quem participa da oferta (ou status = publicada)
create policy oferta_historico_select_envolvidos on public.oferta_historico
  for select to authenticated
  using (
    exists (
      select 1 from public.ofertas o
      where o.id = oferta_id
        and (o.doador_id = public.meu_doador_id()
             or o.instituicao_id = public.minha_instituicao_id()
             or o.voluntario_id  = public.meu_voluntario_id()
             or o.status = 'publicada')
    )
  );

-- INSERT/UPDATE/DELETE: bloqueados — só os triggers escrevem
revoke insert, update, delete on public.oferta_historico from anon, authenticated;
```

### `recebimentos` — RN-07 na prática

```sql
alter table public.recebimentos enable row level security;

-- SELECT: instituição dona + doador + voluntário da oferta
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

-- INSERT: só a instituição dona, validada pela função pode_confirmar() (RN-07)
create policy recebimentos_insert_instituicao on public.recebimentos
  for insert to authenticated
  with check (
    instituicao_id = public.minha_instituicao_id()
    and public.pode_confirmar(auth.uid(), oferta_id)
  );

revoke update, delete on public.recebimentos from anon, authenticated;
```

---

## 📊 Mapa de policies → RNs

| Policy | Tabela | Protege | RN relacionada |
|--------|--------|---------|----------------|
| `profiles_select_own` | profiles | Dados pessoais 1:1 | — |
| `doadores_insert_own` | doadores | Cadastro sanitário só pelo dono | RN-05 |
| `instituicoes_insert_own` | instituicoes | CNPJ/refrigeração só pelo dono | RN-03 |
| `voluntarios_insert_own` | voluntarios | Caixa térmica só pelo dono | RN-04 |
| `ofertas_select_feed_ou_envolvidos` | ofertas | Feed + privacidade por status | RN-01, RN-02 |
| `ofertas_insert_doador` | ofertas | Só doador cria | RN-05 |
| `ofertas_update_doador` | ofertas | Só `observacoes` | RN-07 |
| `recebimentos_insert_instituicao` | recebimentos | Só instituição confirma | RN-07 |

---

## 🔓 Funções de helper (GRANT de EXECUTE)

| Função | Permissão | Uso no front-end |
|--------|-----------|------------------|
| `meu_doador_id()` | `authenticated` | Identifica o doador logado dentro de policies |
| `minha_instituicao_id()` | `authenticated` | Identifica a instituição logada |
| `meu_voluntario_id()` | `authenticated` | Identifica o voluntário logado |
| `meu_user_type()` | `authenticated` | Decide para onde redirecionar no login |

### Funções de regra (para pré-validar no front-end)

```sql
grant execute on function
  public.pode_ofertar(uuid, public.tipo_alimento),   -- RN-05
  public.pode_aceitar(uuid, uuid),                   -- RN-03
  public.pode_assumir(uuid, uuid),                   -- RN-04
  public.pode_confirmar(uuid, uuid)                  -- RN-07
to authenticated;
```

> Use no front-end para **desabilitar botões** antes mesmo de chamar a RPC.

---

## 🚫 Funções bloqueadas (só para triggers)

```sql
revoke execute on function
  public.fn_touch_updated_at(),
  public.fn_oferta_setar_prazos(),
  public.fn_registrar_historico(),
  public.fn_handle_new_user()
from public;
```

---

## RPCs do front-end (GRANT)

```sql
grant execute on function
  public.criar_oferta(text, public.tipo_alimento, numeric, timestamptz, text,
                      text, integer, text, text),   -- RN-01, RN-05, RN-08
  public.aceitar_oferta(uuid),                      -- RN-03
  public.assumir_transporte(uuid),                  -- RN-04
  public.avancar_status(uuid, public.status_oferta, text),  -- RN-01 a RN-07
  public.confirmar_recebimento(uuid, numeric, text)            -- RN-07
to authenticated;
```

---

## ✅ Checklist de segurança

- [ ] Todas as tabelas têm `enable row level security`
- [ ] Policies de SELECT cobrem leitura pública (feed) + privada (envolvidos)
- [ ] Policies de INSERT/UPDATE exigem `auth.uid()` via helper
- [ ] `revoke` em `anon` e `authenticated` para escritas não-autorizadas
- [ ] `grant update (observacoes)` em `ofertas` — nada mais
- [ ] `revoke insert, update, delete` em `oferta_historico` (append-only)
- [ ] TRIGGER `fn_registrar_historico` é `SECURITY DEFINER`
- [ ] Todas as RPCs têm `SECURITY DEFINER`
