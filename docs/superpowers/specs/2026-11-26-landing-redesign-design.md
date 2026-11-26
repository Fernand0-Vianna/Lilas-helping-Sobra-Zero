# Redesign da landing — Sobra Zero

## Intenção
Refazer `index.html` com design mais emocional e profissional, usando foto real
no hero e mantendo a identidade lilás. Hoje o hero usa um screenshot do
protótipo, o que passa a ideia de demo e não de produto.

## Goals
- Hero com foto real de comida (Unsplash, externo, sem chave de API).
- Galeria com abas Desktop e Mobile.
- Drawer mobile acessível (`aria-controls`, foco preso, ESC, lock de scroll).
- Imagens com `width`/`height`/`srcset` para evitar CLS.
- Remover métrica sem fonte ("141 kg resgatados").
- Manter结构: hero, ciclo (6 estados), personas, galeria, 8 regras, CTA, footer.

## Non-goals
- Não mudar as páginas internas nem o fluxo de autenticação.
- Não baixar fotos para o repo — usar `images.unsplash.com` direto.
- Não alterar regras de negócio (RN-01 a RN-08) nem textos legais.

## Constraints
- CSS existente em `css/stily.css`; ícones Lucide em `pages-js/icons.js`.
- Contraste: texto pequeno usa `--purple-dark`, não `--purple`.
- Vercel sem CSP restritiva; fotos externas precisam de URL absoluta HTTPS.
- Manter `loading="lazy"` fora do hero (hero é `eager`).

## Abordagens
1. **Foto externa + estrutura mantida (escolhida)** — trocar só o visual do
   hero e os pontos apontados pelo Design Critic. Barato, reversível, sem
   binários no git.
2. **Baixar fotos para o repo** — autocontido, mas aumenta o repositório e
   exige manutenção de srcset local. Descartada pelo usuário.
3. **Reescrever a página do zero** — risco de perder conteúdo/SEO já
   existente. Descartada.

## Decisões
- Hero: foto Unsplash de refeição/prato com luz natural, overlay lilás-escuro,
  `<img>` com `srcset` (larguras 800/1200/1600), `width`/`height`, `fetchpriority="high"`.
- Screenshot do protótipo sai do hero e vai para a galeria (já está lá).
- Galeria: aba Mobile com 7 telas em scroll horizontal.
- Drawer: `aria-expanded`/`aria-controls="nav-principal"`, ESC fecha, foco vai
  para o primeiro link ao abrir e volta ao burger ao fechar; `overflow:hidden`
  no body enquanto aberto.
- Métrica "141 kg resgatados" removida; badge passa a "Protótipo navegável".
- CTA final com copy diferente do hero: foco em "comece em 2 minutos".
- Personas/ciclo continuam com ícones Lucide (`chef-hat`, `building-2`, `truck`;
  `package`, `clock`, `check-check`) — sem foto nesses blocos.

## Próximos passos
- Plano de execução e implementação.
- Revalidação com Design Critic, QA e Security após publicar.
