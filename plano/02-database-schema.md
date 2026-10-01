# 🗄️ 02 — Schema do Banco de Dados

> Documentação completa do modelo de dados do **Sobra Zero**, com mapeamento
> de RN → colunas e diagrama ER em texto.

---

## 📚 Visão geral

O banco usa **um único schema `public`**, com todas as tabelas protegidas por
**Row Level Security (RLS)**. O modelo segue o padrão:

- `profiles` — espelho 1:1 de `auth.users` (o "quem é")
- `doadores`, `instituicoes`, `voluntarios` — tabelas de detalhe, uma por perfil
- `ofertas` — núcleo do produto
- `oferta_historico` — rastro append-only do ciclo de vida
- `recebimentos` — prova de entrega (RN-07)

### ENUMs de domínio

| Tipo | Valores | Uso |
|------|---------|-----|
| `user_type` | `doador`, `instituicao`, `voluntario` | Define qual tabela de detalhe |
| `tipo_alimento` | `preparado`, `nao_perecivel`, `frio`, `congelado` | Define prazo (RN-01/RN-08) e exigência de frio |
| `status_oferta` | `publicada`, `aceita`, `coletada`, `entregue`, `confirmada`, `expirada`, `descartada`, `cancelada` | Ciclo de vida da oferta |
| `faixa_necessidade` | `ate_20kg`, `de_21_a_60kg`, `de_61_a_150kg`, `mais_de_150kg` | Capacidade declarada pela instituição (tela 10) |
| `meio_transporte` | `carro`, `moto_ou_bicicleta`, `ape_ou_transporte_publico` | Meio declarado pelo voluntário (tela 11) |

---

## 🗺️ Diagrama ER (texto)

```
auth.users (Supabase Auth)
    │ 1:1
    ▼
profiles
    │ user_type
    ├──► doadores          (1:1)  [profile_id]
    ├──► instituicoes       (1:1)  [profile_id]
    └──► voluntarios         (1:1)  [profile_id]

ofertas
    │ doador_id → doadores.id
    │ instituicao_id → instituicoes.id
    │ voluntario_id → voluntarios.id
    │
    ├──► oferta_historico   (1:N)  [oferta_id]
    └──► recebimentos       (1:1)  [oferta_id]

Views:
    vw_equidade_instituicoes  ← instituicoes + recebimentos
    vw_ofertas_feed           ← ofertas + doadores + instituicoes + voluntarios + equidade
    vw_descartes              ← ofertas descardadas/expiradas + historico
    vw_relatorio_doadores     ← doadores + ofertas (KPIs por doador)
    vw_kpis_gerais            ← agregados globais
```

---

## 📋 Detalhamento das tabelas

### `profiles` (Migration 02)

| Coluna | Tipo | Constraints | Comentário |
|--------|------|-------------|------------|
| `id` | `uuid` | PK → `auth.users.id` ON DELETE CASCADE | UUID da sessão |
| `user_type` | `user_type` | NOT NULL | Determina a tabela de detalhe |
| `nome` | `text` | NOT NULL, CHECK ≥ 2 chars | Nome de exibição |
| `email` | `text` | NOT NULL | Cópia do email do GoTrue |
| `telefone` | `text` | NULL | Telefone de contato |
| `avatar_url` | `text` | NULL | URL da imagem |
| `termos_aceitos_em` | `timestamptz` | NOT NULL, DEFAULT now() | Data de aceite dos termos |
| `criado_em` | `timestamptz` | DEFAULT now() | — |
| `atualizado_em` | `timestamptz` | DEFAULT now() | Atualizado pelo trigger `fn_touch_updated_at()` |

> Trigger: `trg_profiles_updated_at` → chama `fn_touch_updated_at()`

### `doadores` (Migration 02)

| Coluna | Tipo | Constraints | RN | Comentário |
|--------|------|-------------|-----|------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | — | ID interno |
| `profile_id` | `uuid` | NOT NULL, UNIQUE → profiles.id ON DELETE CASCADE | — | Link com profile |
| `nome_estabelecimento` | `text` | NOT NULL | — | Nome fantasia |
| `responsavel` | `text` | NOT NULL | — | Responsável legal |
| `telefone` | `text` | NULL | — | — |
| `cadastro_sanitario_validade` | `date` | NOT NULL, CHECK ≥ 2000-01-01 | **RN-05** | Validade do cadastro sanitário |
| `endereco` | `text` | NULL | — | — |
| `bairro` | `text` | NULL | — | — |
| `criado_em` / `atualizado_em` | `timestamptz` | DEFAULT now() | — | Timestamps |

### `instituicoes` (Migration 02)

| Coluna | Tipo | Constraints | RN | Comentário |
|--------|------|-------------|-----|------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | — | ID interno |
| `profile_id` | `uuid` | NOT NULL, UNIQUE → profiles.id | — | Link com profile |
| `razao_social` | `text` | NOT NULL | — | Nome da instituição |
| `cnpj` | `text` | NOT NULL, UNIQUE, CHECK 14 dígitos | **RN-03** | CNPJ sem formatação |
| `responsavel_legal` | `text` | NOT NULL | **RN-03** | Nome do responsável |
| `telefone` | `text` | NULL | — | — |
| `tem_refrigeracao` | `boolean` | NOT NULL, DEFAULT false | **RN-03** | Só aceita frio se true |
| `capacidade_refrigeracao_kg` | `numeric(10,2)` | CHECK | **RN-03** | Capacidade da câmara |
| `necessidade_semanal` | `faixa_necessidade` | NOT NULL, DEFAULT `ate_20kg` | — | Para triagem (não bloqueia) |
| `aceita_congelado` | `boolean` | NOT NULL, DEFAULT false | **RN-03** | Só relevante se `tem_refrigeracao` |
| `endereco` / `bairro` | `text` | NULL | — | Localização |

### `voluntarios` (Migration 02)

| Coluna | Tipo | Constraints | RN | Comentário |
|--------|------|-------------|-----|------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | — | ID interno |
| `profile_id` | `uuid` | NOT NULL, UNIQUE → profiles.id | — | Link com profile |
| `nome_completo` | `text` | NOT NULL | — | Nome do voluntário |
| `telefone` | `text` | NOT NULL | — | WhatsApp para contato |
| `tem_caixa_termica` | `boolean` | NOT NULL, DEFAULT false | **RN-04** | Obrigatório para frio/congelado |
| `meio_transporte` | `meio_transporte` | NOT NULL | — | Carro, moto, transporte público |
| `capacidade_kg` | `numeric(10,2)` | NULL | — | Quantidade que consegue carregar |
| `raio_atuacao_km` | `integer` | NULL | — | Raio de atuação |
| `disponivel` | `boolean` | NOT NULL, DEFAULT true | — | Pausar disponibilidade |

### `ofertas` (Migration 03)

| Coluna | Tipo | Constraints | RN | Comentário |
|--------|------|-------------|-----|------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | — | — |
| `doador_id` | `uuid` | NOT NULL → doadores.id ON DELETE RESTRICT | — | Fixo após criação |
| `titulo` | `text` | NOT NULL, CHECK 3–120 chars | — | — |
| `descricao` | `text` | NULL | — | Detalhes |
| `tipo_alimento` | `tipo_alimento` | NOT NULL | RN-01, RN-08 | Define prazo |
| `exige_frio` | `boolean` | GENERATED ALWAYS AS | RN-03, RN-04 | Derivado de tipo_alimento |
| `quantidade_kg` | `numeric(10,2)` | NOT NULL, CHECK 0 < q ≤ 5000 | — | — |
| `porcoes` | `integer` | CHECK > 0 | NULL | Número de porções |
| `data_preparo` | `timestamptz` | NOT NULL | RN-01, RN-08 | Referência para prazos |
| `prazo_coleta` | `timestamptz` | NOT NULL | RN-01 | Calculado automaticamente |
| `prazo_entrega` | `timestamptz` | NOT NULL | RN-01 | Calculado automaticamente |
| `expira_em` | `timestamptz` | NOT NULL | RN-01, RN-02 | Limite usado pelo pg_cron |
| `status` | `status_oferta` | NOT NULL, DEFAULT `publicada` | — | Ciclo de vida |
| `instituicao_id` | `uuid` | → instituicoes.id ON DELETE SET NULL | RN-03, RN-07 | Quem aceitou |
| `voluntario_id` | `uuid` | → voluntarios.id ON DELETE SET NULL | RN-04 | Quem transporta |
| `endereco_coleta` | `text` | NOT NULL | — | Local de retirada |
| `bairro_coleta` | `text` | NULL | — | Bairro |
| `motivo_descarte` | `text` | NULL | RN-02 | Texto livre |
| `expirada_em` / `descartada_em` | `timestamptz` | NULL | RN-02 | Timestamps do descarte |
| `aceita_em` / `coletada_em` / `entregue_em` / `confirmada_em` / `cancelada_em` | `timestamptz` | NULL | — | Carimbos do ciclo |

> Triggers: `trg_ofertas_updated_at`, `trg_ofertas_prazos`, `trg_ofertas_historico`

### `oferta_historico` (Migration 03)

| Coluna | Tipo | Constraints | Comentário |
|--------|------|-------------|------------|
| `id` | `bigint` | PK, GENERATED ALWAYS AS IDENTITY | — |
| `oferta_id` | `uuid` | NOT NULL → ofertas.id ON DELETE CASCADE | — |
| `status_anterior` | `status_oferta` | NULL | NULL no primeiro registro |
| `status_novo` | `status_oferta` | NOT NULL | — |
| `ator_id` | `uuid` | → profiles.id ON DELETE SET NULL | NULL = evento automático |
| `ator_tipo` | `user_type` | NULL | Tipo do ator |
| `comentario` | `text` | NULL | Observação da mudança |
| `criado_em` | `timestamptz` | DEFAULT now() | — |

### `recebimentos` (Migration 03)

| Coluna | Tipo | Constraints | RN | Comentário |
|--------|------|-------------|-----|------------|
| `id` | `uuid` | PK, DEFAULT gen_random_uuid() | — | — |
| `oferta_id` | `uuid` | NOT NULL, UNIQUE → ofertas.id ON DELETE CASCADE | — | Uma oferta = um recebimento |
| `instituicao_id` | `uuid` | NOT NULL → instituicoes.id ON DELETE RESTRICT | RN-07 | Quem recebeu |
| `confirmado_por` | `uuid` | NOT NULL → profiles.id ON DELETE RESTRICT | RN-07 | Profile que confirmou |
| `quantidade_recebida_kg` | `numeric(10,2)` | NOT NULL, CHECK > 0 | RN-07 | Peso efetivamente recebido |
| `observacoes` | `text` | NULL | — | — |
| `criado_em` | `timestamptz` | DEFAULT now() | — | — |

---

## 📊 Views

### `vw_equidade_instituicoes` (RN-06)

```sql
SELECT  i.id, p.nome, i.razao_social, i.bairro,
        i.tem_refrigeracao, i.necessidade_semanal,
        coalesce(sum(r.quantidade_recebida_kg) filter (...30 dias), 0) AS kg_recebidos_30d,
        count(r.id) filter (...30 dias) AS recebimentos_30d
FROM instituicoes i
JOIN profiles p ON p.id = i.profile_id
LEFT JOIN recebimentos r ON r.instituicao_id = i.id
GROUP BY i.id, p.nome, ...
```

> **Uso:** ordenar por `kg_recebidos_30d ASC` para priorizar quem recebeu menos.

### `vw_ofertas_feed`

Feed pronto para a tela 05. Junta ofertas + doadores + instituições + voluntários
e traz a coluna `kg_recebidos_30d_prioridade` para ordenação por equidade (RN-06).

### `vw_descartes` (RN-02)

Lista ofertas `expirada` ou `descartada` com motivo e data do doador.

### `vw_relatorio_doadores`

Barras do relatório (tela 12): kg doados, kg descartados e contagens por doador.

### `vw_kpis_gerais`

KPIs agregados: total de ofertas, confirmadas, descartes, kg distribuídos e
contagem de perfis ativos.

---

## 🔄 Mapeamento RN → colunas

| RN | Colunas envolvidas | Função que valida | Tabela |
|----|-------------------|-------------------|--------|
| RN-01 | `data_preparo`, `prazo_coleta`, `prazo_entrega`, `expira_em` | `fn_prazo_padrao()` | `ofertas` |
| RN-02 | `status`, `expira_em`, `expirada_em`, `descartada_em`, `motivo_descarte` | `fn_expirar_ofertas()` | `ofertas` |
| RN-03 | `tem_refrigeracao`, `aceita_congelado`, `tipo_alimento` | `pode_aceitar()` | `instituicoes` × `ofertas` |
| RN-04 | `tem_caixa_termica` | `pode_assumir()` | `voluntarios` × `ofertas` |
| RN-05 | `cadastro_sanitario_validade`, `tipo_alimento` | `pode_ofertar()` | `doadores` × `ofertas` |
| RN-06 | `kg_recebidos_30d` (view) | `vw_equidade_instituicoes` | `instituicoes` + `recebimentos` |
| RN-07 | `instituicao_id`, `recebimentos` | `confirmar_recebimento()` | `ofertas` + `recebimentos` |
| RN-08 | `tipo_alimento` = `congelado` | `fn_prazo_padrao()` | `ofertas` |

---

## 📐 Regras de integridade (constraints)

1. **`ofertas_status_carimbos`** — um carimbo (`aceita_em`, `coletada_em`, etc.)
   só pode existir se o `status` já passou por aquela etapa.
2. **`ofertas_prazos_ordem`** — `prazo_coleta <= prazo_entrega`.
3. **`ofertas_expira_dentro_do_prazo`** — `expira_em <= prazo_entrega`.
4. **`doadores_sanitario_nao_passado`** — `cadastro_sanitario_validade >= 2000-01-01`.
5. **`instituicoes_capacidade_com_refrigeracao`** — se não tem refrigeração,
   a capacidade deve ser NULL ou > 0.
6. **`instituicoes.cnpj`** — 14 dígitos, formato `~ '^[0-9]{14}$'`.

---

## 🧩 Funções utilitárias (Migration 01)

| Função | Tipo | Stabilidade | Uso |
|--------|------|-------------|-----|
| `fn_touch_updated_at()` | trigger | — | Atualiza `updated_at` automaticamente |
| `fn_prazo_padrao(tipo, data_preparo)` | sql | `immutable` | Calcula `prazo_coleta` e `prazo_entrega` |
| `fn_alimento_exige_frio(tipo)` | sql | `immutable` | Retorna `true` para `frio` e `congelado` |
| `fn_transicao_valida(de, para)` | sql | `immutable` | Whitelist do ciclo de vida |

---

## 📋 Ordem de aplicação das migrations

```
01_init.sql        → ENUMs + funções base
02_profiles.sql    → Tabelas de usuário
03_ofertas.sql     → Ofertas, histórico, recebimentos, views
04_functions.sql   → RPCs, triggers, policies, pg_cron
```

> As migrations são nomeadas com timestamp prefixado para garantir a ordem.
> Nunca reordene — cada uma depende da anterior.
