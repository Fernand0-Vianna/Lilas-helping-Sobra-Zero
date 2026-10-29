# 📋 Plano de Implementação-Sobra Zero (Squad Lilás)

> Documentação central do plano de migração do **Sobra Zero** da maquete estática
> para a versão com backend real em **Supabase**. Tudo aqui está em português
> brasileiro e pensado para desenvolvedores que forem dar continuidade ao projeto.

---

## ✅ Status do plano (atualizado em 29/10/2026)

**Concluído:**
- Migrations 01 a 04 aplicadas; reparos `fix_touch_updated_at`, `admin_enum`/`admin` e
  `fix_timeline_duplicada` (20260107) — o 20260107 foi **aplicado no banco remoto em
  29/10** (5 duplicatas removidas, `fn_expirar_ofertas` e `avancar_status` corrigidos;
  a migration ainda foi corrigida para não usar `max(uuid)`, que não existe no Postgres).
- Migração das páginas HTML para o Supabase JS (todas integradas, com sessão e
  `redirectIfNotAuthenticated`).
- Popup de erro padrão em todas as telas; perfil editável; admin flutuante com switcher.
- Validação da sprint: 3 bugs corrigidos (cadastro de instituição com refrigeração,
  JSON de exemplo inválido com credencial, timeline duplicada) — commit `da809e0`.
- Deploy do Vercel atualizado em 29/10 (o JS antigo usava colunas erradas e quebrava
  o cadastro de todos os perfis).

**Pendências abertas (próximos passos):**
| # | Pendência | Tipo |
|---|-----------|------|
| 1 | **RN-06 sem efeito real no feed** — ofertas sem instituição recebem todas `kg_recebidos_30d_prioridade = 99999`, então a ordenação por equidade não diferencia nada. Precisa de decisão de produto (ordenar na visão da instituição? limitar aceites por equidade?) | Design/produto |
| 2 | **KPIs do relatório são parciais** — `vw_kpis_gerais` usa `security_invoker`, então cada usuário vê contagens filtradas pelo próprio RLS. Decidir: agregação `security definer` (KPIs globais) ou restringir a tela 12 a admin | Design/segurança |
| 3 | **Política morta** — `ofertas_insert_doador` existe, mas o `revoke insert ... from authenticated` anula o privilégio (quem insere é a RPC `criar_oferta`). Remover para não confundir | Limpeza |
| 4 | **Senha demo hardcoded** — `login.js` fixa `sobrazero123` nos chips de demonstração; ok para aula, remover antes de qualquer exposição pública | Segurança |

> A implementação real do front-end vive em [`../pages-js/`](../pages-js) na raiz
> do projeto — a cópia que existia em `plano/pages-js/` foi removida por estar
> desatualizada (esta pasta é referência do planejamento, não de execução).

---

## 📁 Índice navegável

| # | Arquivo | Descrição | RNs envolvidas |
|---|---------|-----------|----------------|
|-| [`migrations/`](./migrations) | As migrations SQL (4 base + reparos + admin) | Todas |
| 1 | [`01-supabase-setup.md`](./01-supabase-setup.md) | Guia passo-a-passo para configurar o projeto Supabase do zero |-|
| 2 | [`02-database-schema.md`](./02-database-schema.md) | Explicação completa do schema: ENUMs, tabelas, views e relacionamentos | Todas |
| 3 | [`03-supabase-js.md`](./03-supabase-js.md) | Como incluir `supabase-js` via CDN, cliente centralizado e helpers |-|
| 4 | [`04-rls-policies.md`](./04-rls-policies.md) | Políticas RLS de cada tabela e como elas encaixam nas RNs | RN-03 a RN-07 |
| 5 | [`05-jobs-functions.md`](./05-jobs-functions.md) | Funções de negócio, triggers, `pg_cron` e view de equidade | RN-01, RN-02, RN-06 |
| 6 | [`06-migrating-from-static.md`](./06-migrating-from-static.md) | Passo a passo para migrar as páginas HTML existentes |-|

> **JavaScript:** os arquivos de execução estão em [`../pages-js/`](../pages-js)
> na raiz (login, cadastro, publicar-oferta, ofertas, oferta, relatorio, perfil,
> supabase). O guia de como construí-los é o [`03-supabase-js.md`](./03-supabase-js.md).

---

## 📐 Mapa de regras de negócio (RN)

| Código | Regra | Onde é tratada |
|--------|-------|----------------|
| RN-01 | Alimento preparado: 4h do preparo à coleta, 2h da coleta à entrega | `fn_prazo_padrao()` · `fn_oferta_setar_prazos()` · `criar_oferta()` |
| RN-02 | Oferta fora do prazo expira sozinha e vira descarte registrado | `fn_expirar_ofertas()` · `pg_cron` · `vw_descartes` |
| RN-03 | Instituição sem refrigeração não aceita oferta que exija frio | `pode_aceitar()` · `instituicoes.tem_refrigeracao` |
| RN-04 | Voluntário sem caixa térmica não transporta alimento | `pode_assumir()` · `voluntarios.tem_caixa_termica` |
| RN-05 | Cadastro sanitário vencido: só ofertar não perecível | `pode_ofertar()` · `doadores.cadastro_sanitario_validade` |
| RN-06 | Feed prioriza a instituição que recebeu menos kg em 30 dias | `vw_equidade_instituicoes` · `vw_ofertas_feed` |
| RN-07 | Entrega só conclui com confirmação da instituição | `pode_confirmar()` · `confirmar_recebimento()` · `recebimentos` |
| RN-08 | Congelado não é preparado: prazo de 48h | `fn_prazo_padrao()` (branch `congelado`) |
| ADMIN | Admin flutua entre papéis via vínculos nas 3 tabelas; RNs valem igual | `sou_admin()` · switcher `papelEfetivo()` · `20260106000001_admin.sql` |

## 🔁 Ciclo de vida da oferta

```
Publicada → Aceita → Coletada → Entregue → Confirmada
   ↓         ↓                                 (fim)
Expirada   Cancelada
```

Transições válidas definidas em: `fn_transicao_valida()`.

## 📐 Estrutura de pastas

```
plano/
├── migrations/
│   ├── 20260101000000_init.sql           # ENUMs + funções utilitárias
│   ├── 20260102000000_profiles.sql       # profiles + doadores/instituicoes/voluntarios
│   ├── 20260103000000_ofertas.sql        # ofertas + historico + views
│   ├── 20260104000000_functions.sql      # RPCs, triggers, policies, pg_cron
│   ├── 20260105000000_fix_touch_updated_at.sql  # reparo atualizado_em
│   ├── 20260106000000_admin_enum.sql            # valor admin no enum
│   ├── 20260106000001_admin.sql                 # sou_admin + travas anti auto-promoção
│   └── 20260107000000_fix_timeline_duplicada.sql # reparo timeline sem duplicatas
├── 01-supabase-setup.md
├── 02-database-schema.md
├── 03-supabase-js.md
├── 04-rls-policies.md
├── 05-jobs-functions.md
├── 06-migrating-from-static.md
└── README.md          ← este arquivo
```

## 🎯 Como usar esta documentação

1. Siga [`01-supabase-setup.md`](./01-supabase-setup.md) para levantar o
   ambiente local e remoto-leva ~10 minutos.
2. Leia [`02-database-schema.md`](./02-database-schema.md) para entender o
   modelo de dados antes de tocar qualquer tabela.
3. Acesse [`04-rls-policies.md`](./04-rls-policies.md) para entender o quão
   restrita é cada operação-o front-end **nunca** faz validação sozinho.
4. Consulte [`05-jobs-functions.md`](./05-jobs-functions.md) para a lógica de
   negócio e `pg_cron`.
5. [`03-supabase-js.md`](./03-supabase-js.md) e [`06-migrating-from-static.md`](./06-migrating-from-static.md)
   são seus guias de implementação no browser.
