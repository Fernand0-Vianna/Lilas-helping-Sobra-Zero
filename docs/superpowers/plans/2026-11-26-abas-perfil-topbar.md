# Abas por perfil, top bar e dados de teste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar home própria a instituição e voluntário, mostrar o nome do usuário no top bar de todas as telas, destacar "Ofertas" na nav e semear dados de demonstração marcados como `[TESTE]`.

**Architecture:** Duas páginas novas (`instituicao.html`, `voluntario.html`) reaproveitam `ofertas.js` via um parâmetro de modo; um helper em `supabase.js` recebe o perfil já carregado e escreve o nome com `textContent`; CSS novo `.nav a.is-current` dá o destaque; migration seed acrescenta registros `[TESTE]` sem tocar nos perfis existentes.

**Tech Stack:** HTML estático, módulos ES (`.js`), CSS (`stily.css`), Supabase (Postgres + anon key), Vercel.

**Spec:** `docs/superpowers/specs/2026-11-26-abas-perfil-topbar-design.md`

## Global Constraints
- App estático; nenhuma proteção depende de segredo no front — RLS continua intacta.
- Ícones vêm de `pages-js/icons.js` via `data-icon` (hidratado por `icons.js`).
- Nome do usuário sempre com `textContent` (nunca `innerHTML`).
- `aria-current="page"` apenas na página corrente; "Ofertas" usa só `.is-current`.
- Seed não altera nem apaga os 2 perfis existentes; novos registros com prefixo `[TESTE]`.
- Sem `auth.users` no seed — dados são apenas para demonstração do MVP.

## Review Focus
- Usuário deslogado abre `instituicao.html`/`voluntario.html` → deve redirecionar para login, igual às outras páginas. Teste: `redirectIfNotAuthenticated()` é chamado antes de qualquer render.
- Admin com papel ativo trocado visita as páginas novas → `renderPapelSwitcher` continua funcionando e o modo do feed segue `papelEfetivo`. Teste: modo escolhido por `papelEfetivo(profile)`, não por `user_type` cru.
- Nome com caracteres especiais (`<img>`) → não pode virar HTML. Teste: helper usa `textContent`.
- Dados `[TESTE]` no feed e KPIs → identificáveis e sem quebrar `cnpj_valido()`. Teste: CNPJs do seed passam na validação ao vivo.
- Mobile com menu fechado → nome some junto com `.header-actions` (comportamento aceito); ao abrir, nome e destaque aparecem. Teste: CSS `.site-header.is-open` continua cobrindo `.header-actions`.

---

### Task 1: Nome no top bar e destaque de Ofertas

**Files:**
- Modify: `pages-js/supabase.js` (export novo)
- Modify: `css/stily.css` (`.nav a.is-current`)
- Modify: `pages/ofertas.html`, `pages/oferta.html`, `pages/publicar-oferta.html`, `pages/relatorio.html`, `pages/perfil.html`
- Modify: `pages-js/ofertas.js`, `pages-js/oferta.js`, `pages-js/publicar-oferta.js`, `pages-js/relatorio.js`, `pages-js/perfil.js`
- Test: `tests/verificar-correcoes.mjs` (seção 11)

**Interfaces:**
- Consumes: `getUserProfile()` → `{ nome, user_type, ... }` (já existente).
- Produces: `preencherNomeTopBar(profile)` — escreve `#usuario-nome` com `textContent`; não faz query.

- [ ] **Step 1: Escrever teste falhando (seção 11 no verificador)**

Adicionar ao `tests/verificar-correcoes.mjs`: para cada uma das 5 páginas do app, checar que contém `id="usuario-nome"` e que o link de Ofertas tem `class="is-current"`. Checar que `supabase.js` exporta `preencherNomeTopBar` e que o corpo usa `textContent`.

- [ ] **Step 2: Rodar teste e ver falhar**

Run: `node tests/verificar-correcoes.mjs`
Expected: FALHA na seção 11.

- [ ] **Step 3: Implementar helper e CSS**

Em `supabase.js`: `export function preencherNomeTopBar(profile) { const el = document.getElementById('usuario-nome'); if (el && profile?.nome) el.textContent = profile.nome; }`.
Em `stily.css`: `.nav a.is-current` com `background: var(--tint); color: var(--purple-dark); border-radius: 999px; padding: .45rem .9rem;` e `.nav a.is-current .icon { width: 1em; height: 1em; }`; manter `::after` sem transform quando `.is-current`.

- [ ] **Step 4: Atualizar HTML e JS das 5 páginas**

Em cada página: `<span id="usuario-nome"></span>` dentro de `.header-actions`, antes do botão Sair; `<a class="is-current" href="ofertas.html" aria-current="page">` é incorreto — em `ofertas.html` sim, nas outras usar `class="is-current"` sem `aria-current`. Em cada módulo JS, após `getUserProfile()`, chamar `preencherNomeTopBar(profile)` com o perfil já obtido (sem nova chamada).

- [ ] **Step 5: Rodar teste e ver passar**

Run: `node tests/verificar-correcoes.mjs`
Expected: TUDO OK incluindo seção 11.

- [ ] **Step 6: Commit**

`git add ... && git commit -m "feat: nome no top bar e destaque de ofertas na nav"`

---

### Task 2: Páginas próprias de instituição e voluntário

**Files:**
- Create: `pages/instituicao.html`, `pages/voluntario.html`
- Modify: `pages-js/ofertas.js` (parâmetro `modo`), `pages-js/login.js` (destinos)
- Modify: `pages-js/instituicao.js`, `pages-js/voluntario.js` (novos)
- Test: seção 12 do verificador

**Interfaces:**
- Consumes: `buscarFeedOfertas()` e `renderizarFeed()` de `ofertas.js`; `getUserProfile`, `papelEfetivo`, `renderPapelSwitcher`, `preencherNomeTopBar`.
- Produces: `renderizarFeed({ modo })` onde `modo` ∈ `'doador' | 'instituicao' | 'voluntario'`; quando não `'doador'`, oculta botão Publicar/Editar.

- [ ] **Step 1: Escrever teste falhando (seção 12)**

Checar existência das duas páginas, presença de `data-icon="building-2"`/`data-icon="truck"`, ids `feed-ofertas`, chamada a `renderizarFeed` com modo, e `login.js` com destinos `instituicao.html`/`voluntario.html`.

- [ ] **Step 2: Rodar teste e ver falhar**

Run: `node tests/verificar-correcoes.mjs`

- [ ] **Step 3: Refatorar `ofertas.js` para aceitar modo**

`export async function renderizarFeed(modo = 'doador')` — guardar `modoFeed` no módulo; em `renderizarFeed`, esconder `a[href="publicar-oferta.html"]` e `.btn-editar` quando `modoFeed !== 'doador'`. Manter compatibilidade com chamada sem argumento.

- [ ] **Step 4: Criar as duas páginas e seus módulos**

Cada HTML: mesmo top bar da Task 1 (com nome e `.is-current`), `page-head` com kicker/ícone próprio, alerta RN-06 (instituição) ou RN-04/RN-07 (voluntário), filtros existentes e `<div id="feed-ofertas">`. Cada módulo: proteção de rota, `getUserProfile`, `renderPapelSwitcher`, `preencherNomeTopBar`, `renderizarFeed('instituicao'|'voluntario')`.

- [ ] **Step 5: Ajustar redirecionamento no login**

`login.js`: instituicao → `instituicao.html`, voluntario → `voluntario.html`, doador → `publicar-oferta.html`, admin → `ofertas.html`.

- [ ] **Step 6: Rodar teste e ver passar**

Run: `node tests/verificar-correcoes.mjs`

- [ ] **Step 7: Commit**

`git commit -m "feat: home propria por perfil com feed filtrado"`

---

### Task 3: Chips de preenchimento no cadastro

**Files:**
- Modify: `pages/cadastro.html`, `css/stily.css`
- Test: seção 13 do verificador

**Interfaces:**
- Consumes: valores de `cadastro.js` (ids dos campos).
- Produces: `.qchip-cadastro` com `data-preencher="doador|instituicao|voluntario"`.

- [ ] **Step 1: Escrever teste falhando**

Checar 3 conjuntos de chips no HTML e que o CNPJ do chip da instituição é `11444777000161` (válido conforme migration anterior).

- [ ] **Step 2: Rodar teste e ver falhar**

- [ ] **Step 3: Implementar chips**

Um `<div class="qchips">` por painel com botões que preenchem os campos da aba via JS inline no próprio `cadastro.html` (padrão dos `.qchip` do login), sem gravar nada. Reutilizar `.qchip` existente no CSS.

- [ ] **Step 4: Rodar teste e ver passar**

- [ ] **Step 5: Commit**

---

### Task 4: Seed de demonstração no Supabase

**Files:**
- Create: `supabase/migrations/20260111000000_seed_demo.sql`
- Test: consultas ao vivo via Supabase MCP

**Interfaces:**
- Consumes: tabelas `profiles`, `doadores`, `instituicoes`, `voluntarios`, `ofertas`.
- Produces: registros com prefixo `[TESTE]`; CNPJs válidos; nenhuma alteração nos 2 perfis existentes.

- [ ] **Step 1: Escrever a migration seed**

Inserir 1 doador, 1 instituição (CNPJ `11444777000161`) e 1 voluntário com `qchip` de demonstração; 2 ofertas com status `publicada` e `observacoes` iniciando `[TESTE]`. Usar `on conflict do nothing` para ser idempotente. Não criar `auth.users` — perfis sem dono de auth são aceitos? **Verificar FK `profiles.id → auth.users` antes de escrever**: se houver FK obrigatória, o seed de perfis falhará (como aconteceu no teste anterior) — nesse caso semear apenas ofertas vinculadas aos perfis existentes e registrar a limitação.

- [ ] **Step 2: Aplicar migration no projeto Supabase**

Run: `apply_migration` com o SQL do arquivo.

- [ ] **Step 3: Verificar ao vivo**

Consultar `count(*)` das tabelas antes/depois; conferir que os 2 CNPJs antigos continuam e que `vw_ofertas_feed` mostra as ofertas `[TESTE]`.

- [ ] **Step 4: Commit**

---

### Task 5: Validação final e deploy

- [ ] Rodar `node tests/verificar-correcoes.mjs` → TUDO OK
- [ ] Rodar `node --check` nos JS alterados
- [ ] Servir local e conferir rotas das páginas novas (200)
- [ ] Commit final, push e deploy Vercel
- [ ] Pedir revalidação ao QA Tester e Security Reviewer
