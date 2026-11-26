# Design — Recriar hero da landing com mais apelo a imagens

## Intenção
O usuário pediu para recriar `index.html` com design melhor, mais apelo a imagens,
respeitando a paleta lilás do projeto e com uma hero melhor que a atual.

## Estado atual
- Hero já tem foto Unsplash, mas como card lateral `4/5` num grid `1.15fr / .85fr`.
- Fundo `--ink-deep` com mancha roxa e grão; foto com overlay lilás escuro e badge.
- Resto da página (stats, ciclo, personas, galeria com abas Desktop/Mobile,
  regras, CTA, footer, drawer mobile acessível) foi aprovado pelo Design Critic
  nas levas anteriores e não deve ser alterado.

## Abordagens consideradas
1. **Foto de fundo em toda a hero (escolhida)** — imagem ocupa a largura toda com
   overlay `--ink-deep`→transparente; título centralizado maior; 3 cartões
   flutuantes com ícones Lucide já existentes (`chef-hat`, `building-2`, `truck`).
   Mais apelo visual e mantém a paleta. Risco: texto sobre imagem exige overlay
   forte o suficiente para contraste.
2. **Card lateral ampliado** — manter o grid, só aumentar a foto e o título.
   Menos risco, mas não entrega "mais apelo a imagens" de forma convincente.
3. **Ilustração vetorial** — descartada: o usuário pediu explicitamente imagens
   e a leva anterior já definição foto real no hero.

## Decisões (minhas, conforme recomendação enviada)
- Fundo completo, não card lateral.
- Incluir os 3 cartões flutuantes dos perfis com ícones Lucide existentes.
- Unsplash externo via `images.unsplash.com`, sem chave de API, com `srcset`
  800/1200/1600/2000, `sizes`, `width/height`, `fetchpriority="high"`.
- Overlay com `--ink-deep` para contraste; `.kicker` em `--purple-dark`.
- Cartões com `--tint`/`--purple` e `backdrop-filter`, sem quebrar o drawer mobile.
- Resto da página intacto.

## Fora de escopo
- `srcset`/WebP nos 14 PNGs da galeria (não bloqueante, aprovado para leva futura).
- Fallback inline dos ícones Lucide (não bloqueante).
- Mudanças em migrations, RLS, vercel.json ou dados do Supabase.

## Verificação
- `node tests/verificar-correcoes.mjs` deve dar `TUDO OK`.
- Foto externa responde 200.
- Deploy Vercel `READY`; Design Critic, QA e Security revalidam.
