# SDD ledger — plan: docs/superpowers/plans/2026-11-26-hero-apelo-imagens.md

Pre-flight: tarefa única (Task 1), sem interfaces compartilhadas. Spec lida: docs/superpowers/specs/2026-11-26-hero-apelo-imagens-design.md.

Task 1: complete (commits HEAD..9e54afc, tests: node tests/verificar-correcoes.mjs → TUDO OK; foto externa HEAD 200 image/jpeg 113362 bytes).
Task 1: Ruling: checagens antigas da seção 15 esperavam o card lateral (.hero-photo, width=1200 height=1500, overlay rgba(30,16,65)) — atualizei para a nova arquitetura (hero-bg-img com dimensões, hero-shade com lilás), preservando o comportamento que as checagens protegiam (dimensões explícitas, overlay lilás, srcset completo) — custo: se o card lateral voltar, essas checagens não avisam, mas a seção 16 cobre a nova hero.
Final review: self-review do diff (sem subagent de revisão de código nesta leva; Design Critic, QA e Security revisam o publicado).
Final: Design Critic aprovou com pendências não bloqueantes; apliquei (1) overlay central .72→.82 e (2) .hero-bg-img animation:none em prefers-reduced-motion — commit 9706905, deploy READY, node tests/verificar-correcoes.mjs TUDO OK, CSS publicado confirma as duas mudanças.
Final: minor (deferred): PNGs da galeria sem width/height/srcset e ícones Lucide dependentes de JS (fallback SVG inline) — já diferidos na leva anterior, não bloqueantes.
QA Tester: TUDO OK (16 seções), landing publicada diag 0. Security Reviewer: sem novo risco; não verificou CSP do Unsplash, headers do deploy e drawer em runtime (drawer conferido no browser a 390px).
