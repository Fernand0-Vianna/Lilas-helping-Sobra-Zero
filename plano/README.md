# 📋 Plano de Implementação — Sobra Zero (Squad Lilás)

> Documentação central do plano de migração do **Sobra Zero** da maquete estática
> para a versão com backend real em **Supabase**. Tudo aqui está em português
> brasileiro e pensado para desenvolvedores que forem dar continuidade ao projeto.

---

## 📁 Índice navegável

| # | Arquivo | Descrição | RNs envolvidas |
|---|---------|-----------|----------------|
| — | [`migrations/`](./migrations) | As 4 migrations SQL (já criadas pelo plano anterior) | Todas |
| 1 | [`01-supabase-setup.md`](./01-supabase-setup.md) | Guia passo-a-passo para configurar o projeto Supabase do zero | — |
| 2 | [`02-database-schema.md`](./02-database-schema.md) | Explicação completa do schema: ENUMs, tabelas, views e relacionamentos | Todas |
| 3 | [`03-supabase-js.md`](./03-supabase-js.md) | Como incluir `supabase-js` via CDN, cliente centralizado e helpers | — |
| 4 | [`04-rls-policies.md`](./04-rls-policies.md) | Políticas RLS de cada tabela e como elas encaixam nas RNs | RN-03 a RN-07 |
| 5 | [`05-jobs-functions.md`](./05-jobs-functions.md) | Funções de negócio, triggers, `pg_cron` e view de equidade | RN-01, RN-02, RN-06 |
| 6 | [`06-migrating-from-static.md`](./06-migrating-from-static.md) | Passo a passo para migrar as páginas HTML existentes | — |

### Arquivos JavaScript (`pages-js/`)

| # | Arquivo | Função | RNs destacadas |
|---|---------|--------|----------------|
| 7 | [`pages-js/supabase.js`](./pages-js/supabase.js) | Cliente centralizado + helpers de auth | — |
| 8 | [`pages-js/login.js`](./pages-js/login.js) | Login com `signInWithPassword` + redirecionamento por perfil | — |
| 9 | [`pages-js/cadastro.js`](./pages-js/cadastro.js) | Cadastro com `signUp` + insert na tabela correta | RN-03, RN-04, RN-05 |
| 10 | [`pages-js/publicar-oferta.js`](./pages-js/publicar-oferta.js) | Publicar oferta validando RN-05, cálculo de prazos | RN-01, RN-05, RN-08 |
| 11 | [`pages-js/ofertas.js`](./pages-js/ofertas.js) | Feed de ofertas ordenado por equidade (RN-06) | RN-02, RN-03, RN-04, RN-06 |
| 12 | [`pages-js/oferta.js`](./pages-js/oferta.js) | Timeline de status + avançar ciclo | RN-01 a RN-07 |
| 13 | [`pages-js/relatorio.js`](./pages-js/relatorio.js) | KPIs agregados via `vw_kpis_gerais` | RN-02, RN-06, RN-07 |

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
│   └── 20260104000000_functions.sql      # RPCs, triggers, policies, pg_cron
├── pages-js/
│   ├── supabase.js                       # cliente + helpers
│   ├── login.js
│   ├── cadastro.js
│   ├── publicar-oferta.js
│   ├── ofertas.js
│   ├── oferta.js
│   └── relatorio.js
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
   ambiente local e remoto — leva ~10 minutos.
2. Leia [`02-database-schema.md`](./02-database-schema.md) para entender o
   modelo de dados antes de tocar qualquer tabela.
3. Acesse [`04-rls-policies.md`](./04-rls-policies.md) para entender o quão
   restrita é cada operação — o front-end **nunca** faz validação sozinho.
4. Consulte [`05-jobs-functions.md`](./05-jobs-functions.md) para a lógica de
   negócio e `pg_cron`.
5. [`03-supabase-js.md`](./03-supabase-js.md) e [`06-migrating-from-static.md`](./06-migrating-from-static.md)
   são seus guias de implementação no browser.
