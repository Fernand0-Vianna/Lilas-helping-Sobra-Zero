# Abas por perfil, top bar e dados de teste — Sobra Zero

## Intenção
Dar identidade própria à porta de entrada de cada perfil e corrigir o top bar.
Hoje instituição e voluntário caem na mesma `ofertas.html` (`login.js:89-91`),
o nome do usuário não aparece em nenhuma tela (embora `stily.css:198` já tenha
`#usuario-nome`), e a nav é idêntica para todos.

## Goals
- Páginas iniciais distintas: `instituicao.html` e `voluntario.html`, com
  conteúdo, título e ações próprios. Doador segue em `publicar-oferta.html`.
-Nome do usuário no top bar das 5 páginas do app + das 2 novas.
- "Ofertas" destacada na nav de todas as páginas do app.
- Dados de teste no banco (seed) e no front (chips de preenchimento).

## Non-goals
- Não alterar RLS, policies ou regras de negócio.
- Não mudar o fluxo de autenticação nem o papel switcher do admin.
- Não apagar os 2 perfis de teste existentes.

## Constraints
- App estático: HTML + módulos JS + anon key; identidade visual vem de
  `css/stily.css` e ícones de `pages-js/icons.js` (`currentColor`).
- Ícones disponíveis: `chef-hat` (doador), `building-2` (instituição),
  `truck` (voluntário), `package`, `user-round`, `route`, `weight`, `snowflake`.
- `getUserProfile()` já devolve `nome` e `user_type`; `relatorio.js:25` já
  preenche `#usuario-nome`, mas só no relatório (que hoje não tem o elemento).
- `renderPapelSwitcher(profile)` cria o mount sozinho; admin flutua entre papéis.

## Abordagens
1. **Páginas separadas (escolhida)** — duas páginas novas, cada uma com seu
   `page-head`, filtros e feedback de regra (RN-06 para instituição, RN-04/RN-07
   para voluntário). O login passa a redirecionar cada perfil para sua home.
   Reaproveita `ofertas.js` para carregar o feed, com um parâmetro de modo.
   Mais fiel ao pedido; custo: 2 páginas + 1 módulo JS compartilhado.
2. **Uma `ofertas.html` condicional** — mesmo arquivo muda título/cards por
   `user_type`. Menos arquivos, mas não é uma tela diferente de fato.
3. **Só destacar a nav** — descartada: não atende ao pedido de diferença entre
   instituição e voluntário.

## Como ficou decidido
- `instituicao.html`: kicker "Área da instituição", ícone `building-2`, chamada
  "Ofertas que você pode aceitar", alerta RN-06, filtros de frio e tipo.
- `voluntario.html`: kicker "Área do voluntário", ícone `truck`, chamada
  "Coletas disponíveis para transporte", alertas RN-04 e RN-07, filtro de frio.
- Top bar: `<span id="usuario-nome">` em todas as páginas do app, preenchido
  por um helper novo `preencherNomeTopBar()` em `supabase.js`, chamado por cada
  módulo de página após `getUserProfile()`. Nome escapado com `textContent`.
- Nav: link "Ofertas" com `aria-current="page"` + classe `.is-current` (pílula
  roxa com ícone `package`) em todas as páginas do app. Nas páginas novas, o
  link "Ofertas" continua apontando para `ofertas.html`, mas ganha o destaque;
  a página corrente também ganha `.is-current`.
- Dados de teste no front: chips clicáveis em `cadastro.html` que preenchem
  os campos de cada aba (CNPJ válido `11444777000161` para instituição),
  inspirados nos `.qchip` do login. Não gravam nada.
- Dados de teste no banco: migration seed **aplicada na produção**, com
  perfis/ofereças de exemplo e CNPJs válidos, identificados com prefixo
  `[TESTE]` para não passarem por dados reais. **Os 2 perfis existentes
  ficam intactos** — o seed só acrescenta. Não é necessário criar contas
  logáveis em `auth.users`: os dados servem para demonstração do MVP no
  feed e nos KPIs (decisão do usuário).
- Helper `preencherNomeTopBar(profile)` recebe o perfil **já carregado**
  pela página e só escreve no DOM com `textContent` — sem nova query.
- CSS novo `.nav a.is-current` (pílula roxa com ícone `package`). Em
  `instituicao.html`/`voluntario.html`, `aria-current="page"` fica só na
  página corrente; "Ofertas" ganha apenas o destaque visual `.is-current`.
- No mobile o nome continua dentro de `.header-actions`, visível com o menu
  aberto (padrão atual do layout).
- "Modo" do feed controla também as ações: nas páginas novas o botão
  "Publicar" e "Editar" (doador) são omitidos; "Ver detalhes" segue levando
  a `oferta.html?id=`.
- RN-07 no `voluntario.html` é texto informativo: a entrega só conclui com
  a confirmação da instituição.

## Próximos passos
- Design review concluído; decisões do usuário registradas acima.
- Plano de execução: top bar + nav, páginas novas, seeds, validação.
