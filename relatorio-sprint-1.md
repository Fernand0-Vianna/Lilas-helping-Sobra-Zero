# Relatório — Sprint 1

**Projeto:** Sobra Zero (Squad Lilás) · **Período da sprint:** 24/09/2026 a 02/10/2026

## Objetivo da sprint

"Estruturar a base do projeto: repositório, design system, telas principais em HTML/CSS, integração inicial com Supabase e contas de teste."

**Status:** atingido.

## Comprometido e entregue

| Métrica | Comprometido | Entregue |
|---|---|---|
| Cartões | 10 | 9 |
| Pontos | 21 | 19 |

## Gráfico de acompanhamento

Burndown da sprint (pontos restantes x dia):

```dataviewjs
const labels = ["24/09", "25/09", "26/09", "27/09", "28/09", "29/09", "30/09", "01/10", "02/10"];
const restante = [21, 21, 19, 16, 14, 12, 10, 4, 2];
const ideal = [21, 19, 16, 14, 12, 9, 7, 5, 2];

const w = 640, h = 300, pad = 40;
const maxY = 24;
const px = i => pad + (i / (labels.length - 1)) * (w - 2 * pad);
const py = v => h - pad - (v / maxY) * (h - 2 * pad);
const polyline = arr => arr.map((v, i) => `${px(i)},${py(v)}`).join(" ");

const grid = [0, 6, 12, 18, 24].map(v =>
  `<line x1="${pad}" y1="${py(v)}" x2="${w - pad}" y2="${py(v)}" stroke="#e5e5e5"/>
   <text x="${pad - 8}" y="${py(v) + 4}" text-anchor="end" font-size="11" fill="#666">${v}</text>`
).join("");

const xlabels = labels.map((l, i) =>
  `<text x="${px(i)}" y="${h - pad + 16}" text-anchor="middle" font-size="10" fill="#666">${l}</text>`
).join("");

const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  ${grid} ${xlabels}
  <polyline points="${polyline(ideal)}" fill="none" stroke="#999" stroke-dasharray="5,4" stroke-width="2"/>
  <polyline points="${polyline(restante)}" fill="none" stroke="#7c3aed" stroke-width="2.5"/>
  <text x="${w - pad}" y="20" text-anchor="end" font-size="11" fill="#999">-- ideal</text>
  <text x="${w - pad - 70}" y="20" text-anchor="end" font-size="11" fill="#7c3aed">— restante</text>
</svg>`;
dv.el("div", svg);
```

## O que ficou para trás

- **Integração completa das páginas HTML com o Supabase JS** — faltou definir o fluxo de sessão com as contas de teste; segue para a Sprint 2.
- **Popup de erro em todas as telas** (RN de validação) — apenas login/cadastro receberam o padrão; segue para a Sprint 2.

## Impedimentos

- **Falha no `.gitignore`** que expunha credenciais do Supabase no repositório — detectada e corrigida em 24/09/2026 pelo dono do repositório; sem dias perdidos, mas gerou a decisão de manter credenciais apenas em `tests/contas-teste.example.json`. Ficou aberto: revisar segredos no histórico antes do merge final.

## Decisões tomadas

- **24/09/2026** — Estrutura inicial sem framework (HTML/CSS/JS puro + Supabase), responsável: líder do Squad Lilás.
- **01/10/2026** — Contas de teste em arquivo separado com exemplo versionado e real ignorado, responsável: líder do Squad Lilás.
- **01/10/2026** — Inclusão de seção de LGPD nos Termos de Uso, responsável: líder do Squad Lilás.

## Ações para a próxima sprint

1. Integrar todas as páginas com Supabase JS (autenticação e sessão) — dono: líder · prazo: 09/10/2026.
2. Padronizar popup de erro em todas as telas — dono: líder · prazo: 09/10/2026.
3. Revisar histórico do git em busca de credenciais expostas — dono: líder · prazo: 06/10/2026.
