# Validacao de CNPJ no backend — Sobra Zero

## Intenção
Fechar o risco apontado pelo Security Reviewer: o CNPJ da instituição é
validado apenas no formulário (`pages-js/cadastro.js`). Qualquer pessoa pode
chamar o Supabase direto com a anon key e inserir 14 dígitos quaisquer, ganhando
perfil de instituição sem CNPJ real (RN-03).

## Goals
- Validar dígitos verificadores do CNPJ no banco, não só o formato.
- Não quebrar os 2 perfis de teste já existentes (`12345678000195` e
  `98765432000110`, ambos inválidos).
- Manter a validação do formulário alinhada à do banco.

## Non-goals
- Corrigir ou apagar os CNPJs de teste existentes (dívida documentada).
- Mexer no rate limiting de login: o Supabase já limita `/auth/v1/token` por IP
  e `login.js` já traduz o erro 429. É config do dashboard, não código.

## Constraints
- App é estático (HTML/JS + anon key); toda proteção depende de RLS/RPC/constraints.
- Migrações são aplicadas direto no projeto Supabase `oyhynvksczzxgkpvsbxv`.
- `instituicoes.cnpj` já tem `CHECK (cnpj ~ '^[0-9]{14}$')` e UNIQUE.
- INSERT no front vai direto na tabela (`supabase.from('instituicoes').insert`).

## Abordagens
1. **Constraint NOT VALID (escolhida)** — cria `cnpj_valido(cnpj text)` e
   `CHECK (public.cnpj_valido(cnpj)) NOT VALID`. NOT VALID não revisa linhas
   antigas, mas passa a valer para INSERT/UPDATE novos. Fecha o escalonamento
   sem quebrar os perfis de teste. Reversível (drop constraint + function).
2. **Validar e corrigir dados antigos** — exigiria apagar/substituir os 2 CNPJs
   de teste e quebraria o login desses perfis. Mais correto, mais destrutivo.
3. **Só reforçar o front** — descartada: é exatamente o problema atual.

## Como ficou decidido
- `cnpj_valido` com os dois dígitos verificadores (algoritmo da Receita),
  `immutable`, `security invoker`, sem EXECUTE para anon/public.
- Constraint nomeada `instituicoes_cnpj_digitos_verificadores`, `NOT VALID`,
  para não bloquear UPDATE em linhas antigas inválidas.
- Front valida com a mesma regra antes do signUp e mostra popup específico.
- Nenhuma linha existente é alterada.

## Próximos passos
- Migration `20260110000000_cnpj_backend.sql` (a criar, idempotente).
- Teste ao vivo: CNPJ válido passa; inválido falha; linhas antigas continuam.
- Commit + push + deploy Vercel.
