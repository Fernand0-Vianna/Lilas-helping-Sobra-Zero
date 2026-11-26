# Execução das correções da revisão — 2026-11-26

## Estado

Lotes 1, 2 e 3 implementados e aplicados. Lote 4 (verificação) em andamento;
os agentes QA Tester e Security Reviewer foram acionados para revalidar.

## Lote 1 — frontend (working tree, não commitado)

- `btn-sair`: wrapper `() => logout('../pages/login.html')` nas 5 páginas do app.
- Logo do rodapé: `imags/` → `design/`; header virou caminho relativo.
- XSS: `escaparHtml` exportado em `supabase.js` e aplicado em `relatorio.js`
  (doador, título, status_final, motivo_descarte) e no popup de `publicar-oferta.js`.
- Cadastro: trata ausência de sessão após `signUp` (confirmação de e-mail),
  mapeia `necessidade_semanal` do select.
- Login: erro de senha visível já existia; textos de "maquete estática" trocados.
- Menu mobile: burger com script dentro do `<body>` nas 5 páginas (o rascunho
  anterior tinha o script depois de `</html>` — corrigido).
- BOMs removidos dos arquivos editados.
- `README.md`: termos de 9 → 10 cláusulas (texto real conferido).
- `vercel.json`: headers `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options` (sem CSP restritiva, para não quebrar scripts inline).

## Lote 2 — banco (aplicado no projeto `oyhynvksczzxgkpvsbxv`)

- `20260107000000_fix_timeline_duplicada.sql` aplicado: 0 linhas deduplicadas.
- `20260108000000_correcoes_rn.sql` escrito no repo e aplicado em 3 partes:
  - RN-01: trigger e `criar_oferta()` fixam `expira_em = prazo_coleta`.
  - RN-02: cron de 3 dias → `*/15 * * * *` (confirmado no `cron.job`).
  - Corrida: `aceitar_oferta()` e `assumir_transporte()` revalidam no UPDATE.
  - RN-06: `vw_equidade_instituicoes` com `security_invoker=false`, select só
    para `authenticated`.
  - Superfície: EXECUTE revogado de public/anon, grants de authenticated mantidos.
  - RN-07: INSERT direto em `recebimentos` revogado e policy antiga
  `recebimentos_insert_instituicao` removida; RPC exige status `entregue`.
  - Constraints `ofertas_data_preparo_passado` e `ofertas_expira_em_coleta`
    (NOT VALID, para não afetar 12 ofertas históricas com diff de 2h).
  - Índice `recebimentos_instituicao_criado_idx`.

## Lote 3 — papéis e KPIs (aplicado)

- `20260109000000_papeis_kpis.sql`: policies de INSERT nas 3 tabelas de detalhe
  agora exigem `user_type` compatível (admin flutua nos 3).
- Views de relatório/KPIs/descartes/feed com grant explícito só a authenticated.
- Índice `recebimentos_criado_idx`.

## Verificações já feitas

- `node tests/verificar-correcoes.mjs`: TUDO OK.
- `node --check` nos 9 arquivos de `pages-js/`: todos ok.
- `git diff --check`: sem erros.
- Banco ao vivo: cron `*/15`, view opts `security_invoker=false`, 0 EXECUTE anon,
  2 constraints, índice presente, 3 policies de insert com `meu_user_type()`.
- Teste de corrida em transação com rollback: 2º aceite bloqueado, 0 dados gravados.
- Teste de `expira_em` malicioso em transação com rollback: trigger corrigiu para
  `prazo_coleta`, 0 dados gravados.
- Nenhuma chave `service_role` no repo (só menções em comentários).

## Retorno dos agentes (2026-11-26)

- **QA Tester (done)**: regressão local validada — teste TUDO OK nas 9 seções,
  `node --check` ok nos 9 `.js`, logo 200, login/cadastro sem maquete, 5 páginas
  com Sair e burger no body, XSS escapado. Site publicado desatualizado (esperado).
- **Security Reviewer (done)**: achados anteriores confirmados corrigidos, sem
  novos segredos. Riscos restantes:
  - [Médio] CNPJ validado só no cliente (`pages-js/cadastro.js`) — escalonamento
    ao declarar perfil sem CNPJ válido. Correção: validar no backend/RPC.
  - [Baixo] `vw_equidade_instituicoes` com `security_invoker=false` expõe dados
    de todas as instituições a qualquer `authenticated` — por desenho (RN-06);
    manter grant restrito e monitorar.
  - Não verificou: aplicação real das migrations no banco (eu verifiquei),
    headers/CSP da Vercel, rate limiting de login.

## Pendente

- Deploy na Vercel: não autorizado nesta leva. O site publicado segue com o
  código antigo até decisão do dono do projeto.
- Commit: mudanças ainda no working tree, sem commit.
- Opcional para leva futura: validação de CNPJ no backend e rate limiting de login.
