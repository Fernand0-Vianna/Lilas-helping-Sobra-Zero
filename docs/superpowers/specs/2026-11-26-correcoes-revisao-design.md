# Correções da revisão — Sobra Zero (Squad Lilás)

Data: 2026-11-26
Repo: `D:\Projetos\Lilas-helping-Sobra-Zero` (commit base `3e40671`)
Supabase: projeto `oyhynvksczzxgkpvsbxv` ("Lilas | Helping", us-east-1)

## Intenção

Corrigir os defeitos encontrados pelas quatro avaliações (QA, segurança, revisão
de frontend e revisão de SQL), priorizados por risco, sem mudar o escopo do
produto: continua sendo um app estático (HTML + CSS + ES modules, sem build)
que fala direto com o Supabase usando a anon/publishable key.

O pedido do dono do projeto nesta sessão foi: **tudo, priorizado por risco**,
com **migrations aplicadas no Supabase agora**. O deploy na Vercel **não** está
autorizado nesta leva; fica como decisão posterior.

## Estado real verificado (diferente do que os revisores assumiram)

- Clone local limpo, idêntico ao commit revisado.
- Banco: 8 tabelas com RLS, 5 views com `security_invoker=true`,
  `pg_cron` instalado — mas o job `sobrazero-expirar-ofertas` roda
  `0 0 */3 * *` (a cada 3 dias), não a cada 15 min como diz o README.
- **A migration `20260107000000_fix_timeline_duplicada.sql` existe no repo mas
  não está aplicada no banco.** O banco está na versão `20260106000001`.
- `aceitar_oferta` e `assumir_transporte` confirmados sem `where` de status/
  vínculo no `update` — corrida real.
- Nenhuma credencial de service role no repo; token de acesso ao Supabase
  já fornecido pelo dono via cofre do OpenBot e usado somente para consultas.

## Metas

1. Eliminar os 3 defeitos que quebram o uso: botão Sair (5 páginas), cadastro
   com confirmação de e-mail, e app sem navegação no mobile.
2. Eliminar os 2 vetores de injeção de HTML confirmados: tabela de descartes
   do relatório e mensagem do popup de publicação.
3. Fazer as RNs existirem no banco, não só na tela: RN-01 (prazo de coleta
   4h), RN-02 (expiração em 15 min), RN-06 (equidade), RN-07 (prova de entrega).
4. Fechar a corrida no aceite/assunção e a auto-atribuição de papéis.
5. Aplicar a migration pendente e as novas migrations no projeto real.
6. Verificar depois de cada lote: sintaxe JS, migrations aplicadas, consultas
   de regressão no banco e passada no site.

## Não metas / anti-metas

- Não refatorar estilo, não redesenhar telas, não renomear arquivos.
- Não publicar na Vercel nesta leva.
- Não criar contas de teste reais nem mexer em dados de produção além do
  necessário para validar as funções (usarei consultas somente leitura quando
  der; qualquer escrita de teste será combinada antes).
- Não mexer em `prints/`, `design/` ou textos de marketing além dos erros
  factuais apontados (logo 404, "maquete estática", cláusulas dos termos).

## Abordagens consideradas

**A. Corrigir tudo em uma única migration grande e um único commit de frontend.**
Simples de aplicar, mas impossível de reverter por partes e mistura
responsabilidades. Descartada.

**B. Commits pequenos por lote de risco, com migrations numeradas em sequência**
(escolhida). Permite aplicar/verificar cada lote, mantém o histórico legível e
deixa a migration pendente ser aplicada na ordem correta. A ordem dos lotes vem
da priorização dos revisores e do estado real do banco:

1. **Lote 1 — frontend quebrado e XSS (risco de uso e injeção)**
   - `btn-sair`: trocar `addEventListener('click', logout)` por wrapper
     `() => logout()` nas 5 páginas.
   - `index.html:286`: `imags/` → `design/` (e `index.html:16` virar
     caminho relativo).
   - `pages-js/relatorio.js`: escapar `d.doador`, `d.titulo`,
     `d.motivo_descarte`, `d.status_final` com o `escaparHtml` existente.
   - `pages-js/publicar-oferta.js:198`: escapar a mensagem do popup; separar
     alertas RN-05 e de frio para não sobrescrever.
   - `pages-js/cadastro.js`: se `signUp` não devolve sessão, mostrar
     "confirme seu e-mail" e não tentar os inserts; mapear `necessidade_semanal`
     do select; remover `novalidate` onde a validação nativa resolve.
   - Erro de senha no login (QA) e texto "maquete estática" de login/cadastro.
   - Burger/menu nas 5 páginas do app no mobile.
2. **Lote 2 — migration pendente + RNs do banco**
   - Aplicar `20260107000000_fix_timeline_duplicada.sql` (pendente).
   - Nova `20260108000000_correcoes_rn.sql`: `expira_em` = prazo de coleta,
     checagem de `prazo_entrega` em `avancar_status`, cron 15 min, corrida
     no aceite/assunção, `revoke execute ... from public, anon`, RN-06
     (`security_invoker=false` na view de equidade), limitar insert direto em
     `recebimentos`, constraints de status e `data_preparo` antiga.
3. **Lote 3 — papéis e KPIs**
   - Policies das tabelas de detalhe exigindo `user_type` compatível;
     views de relatório/KPI com guard de admin ou `security_invoker=false`.
   - Índice em `recebimentos(instituicao_id, criado_em desc)`.
4. **Lote 4 — verificação final**
   - `git diff --check`, checagem de sintaxe dos `.js` com `node --check`,
     consultas de regressão no Supabase, passada no site publicado (somente
     leitura); relatório final com o que ficou pendente.

## Decisões do construtor (minhas, não precisam de aval)

- `vercel.json` com headers/CSP entra no Lote 1 **apenas se** não quebrar os
  scripts inline existentes; vou começar com `X-Content-Type-Options`,
  `Referrer-Policy` e `frame-ancestors 'none'`, sem `script-src` restritivo,
  para não derrubar o site. CSP restritiva fica para uma leva futura.
- A cláusula extra dos termos (10 em vez de 9) vou conferir e corrigir o
  README para 10 se o texto estiver coerente — não vou apagar cláusula de
  documento legal sem confirmação.
- Testes de escrita no banco (ex.: dois aceites concorrentes) serão feitos
  com transação `rollback` sempre que possível; se precisar de dado real,
  peço confirmação antes.

## O que fica para o dono

- Aprovar este desenho e o plano gerado em seguida.
- Decidir depois se publica na Vercel (o repo local fica pronto, sem deploy).
- Confirmar se quer que o perfil de admin continue restrito a quem já tem
  `user_type='admin'` no banco (afeta o Lote 3).

## Riscos

- Alterar RLS/policies pode trancar usuários reais fora do app. Por isso o
  Lote 2 vem depois do Lote 1 e cada migration será verificada com consultas
  de leitura imediatamente após aplicada.
- O `fix_timeline_duplicada` nunca aplicado pode ter divergido do schema
  atual. Já conferi: a parte de deduplicação removeria **0 linhas** no banco
  real (consulta com `rollback` implícito do `execute_sql` de leitura), então
  aplicá-lo não apaga histórico. Ainda vou comparar as definições de função
  antes de aplicar.
