# Hero com apelo a imagens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recriar apenas a hero da landing com foto de fundo em toda a largura, overlay lilás, título centralizado maior e 3 cartões flutuantes com ícones Lucide existentes, mantendo o resto da página intacto.

**Architecture:** A foto passa a ser `position:absolute` dentro de `.hero`, com `img` responsivo via `srcset` e overlay em camada. O `.hero-grid` vira uma coluna centralizada; os cartões flutuantes são `figure` com `data-icon` resolvido pelo `icons.js` já carregado. Nenhuma outra seção é alterada.

**Tech Stack:** HTML5, CSS custom properties, Unsplash externo, Lucide via `pages-js/icons.js`.

**Spec:** `docs/superpowers/specs/2026-11-26-hero-apelo-imagens-design.md`

## Global Constraints
- Paleta: `--purple: #7C5CE0`, `--purple-dark: #5B3FC4`, `--tint: #EFEBFD`, `--tint-2: #E2DBFB`, `--ink-deep: #0A0E1A`.
- Não alterar: stats, ciclo, personas, galeria (abas Desktop/Mobile), regras, CTA, footer, drawer mobile, `vercel.json`, migrations, dados Supabase.
- Foto externa por HTTPS, sem chave; `srcset` 800/1200/1600/2000, `sizes`, `width/height`, `fetchpriority="high"`, `alt` descritivo.
- `.kicker` usa `--purple-dark`; título branco com `.accent` em `--purple`.

## Review Focus
- Baixo contraste do texto sobre a foto → overlay `--ink-deep` forte o suficiente e verificação visual pelo Design Critic.
- CLS por imagem sem dimensões → `width/height` e `aspect-ratio` explícitos.
- Mobile 390px: cartões flutuantes podem sobrepor o título → empilhar/ocultar cartões em telas pequenas.
- `icons.js` falhar → cartões com `data-icon` vazios; texto dos cartões continua legível.
- Drawer mobile → não deve ser afetado pelo `z-index` da nova camada de foto.

## Tasks

### Task 1: Hero full-bleed com cartões flutuantes

**Files:**
- Modify: `index.html` (bloco HERO, linhas ~43-94)
- Modify: `css/stily.css` (bloco `.hero`, linhas ~242-375; media query ~1642)
- Test: `tests/verificar-correcoes.mjs` (seção 15 já existente + checagens extras)

- [ ] **Step 1: Adicionar checagens de teste para a nova hero**
  Em `tests/verificar-correcoes.mjs`, na seção 15, verificar que `index.html` contém: `hero-bg` com `images.unsplash.com`, `srcset`, `fetchpriority="high"`, `hero-card` (3 ocorrências), `data-icon="chef-hat"`, `data-icon="building-2"`, `data-icon="truck"`, e que `.hero h1` e `.hero-grid` continuam presentes.

- [ ] **Step 2: Rodar teste e confirmar que falha**
  Run: `node tests/verificar-correcoes.mjs`
  Expected: FAIL com as novas checagens da seção 15.

- [ ] **Step 3: Implementar o HTML da hero**
  Substituir o bloco `.hero-grid`/`.hero-visual` por: camada `<div class="hero-bg">` com `<img class="hero-bg-img" ...>`; `<div class="hero-shade">`; manter `.container > .hero-grid` com kicker, h1, lead, CTAs e meta; adicionar `<div class="hero-cards">` com 3 `<figure class="hero-card">` (Doador/chef-hat, Instituição/building-2, Voluntário/truck). Manter o ticker intacto.

- [ ] **Step 4: Implementar o CSS da hero**
  `.hero-bg`/`.hero-shade` absolute inset 0 com `z-index:0/1`; `.hero .container` z-index 2; `.hero-grid` grid de 1 coluna, `text-align:center`, `max-width: 900px`, `margin:auto`; `.hero .lead` `margin-left:auto; margin-right:auto`; `.hero-ctas`/`.hero-meta` `justify-content:center`; `.hero h1` font-size `clamp(2.6rem, 7vw, 5.6rem)`; `.hero-cards` flex centralizado com gap; `.hero-card` `background: rgba(255,255,255,.08)`, `backdrop-filter: blur(14px)`, `border: 1px solid rgba(255,255,255,.18)`, ícone em `--tint`, raio `--radius`; media query `max-width:860px` empilha cartões em coluna e reduz título.

- [ ] **Step 5: Rodar teste e confirmar que passa**
  Run: `node tests/verificar-correcoes.mjs`
  Expected: `TUDO OK`.

- [ ] **Step 6: Verificar foto externa e commit**
  Run: `curl -I` na URL da foto (200, image/jpeg).
  Commit: `git commit -am "feat: hero full-bleed com cartões de perfis"`
