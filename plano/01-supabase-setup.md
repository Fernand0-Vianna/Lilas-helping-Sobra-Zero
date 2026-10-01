# ☁️ 01 — Configuração do Supabase

> Guia passo-a-passo para levantar o ambiente Supabase do **Sobra Zero** do zero.
> Executar em ordem sequencial — dura cerca de 10 minutos.

---

## 📋 Pré-requisitos

| Ferramenta | Versão mínima | Verificação |
|------------|---------------|-------------|
| Node.js    | 18.x LTS      | `node -v`  |
| npm        | 9.x           | `npm -v`   |
| Git        | 2.x           | `git -v`   |
| Navegador  | Chrome/Edge/Firefox (modo incógnit o recomendado para testes) | — |

> **Dica:** se ainda não tem Node.js, instale via [nvm](https://github.com/nvm-sh/nvm):
> ```bash
> curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
> nvm install 18 && nvm use 18
> ```

---

## 1️⃣ Criar conta e projeto no Supabase

### Passo 1 — Criar conta

Acesse [https://supabase.com](https://supabase.com) e clique em **"Start in Slack"** ou
**"Sign up"**. Use um e-mail válido (a confirmação de e-mail é obrigatória).

### Passo 2 — Criar projeto

No painel, clique em **"New project"** e preencha:

| Campo        | Valor sugerido |
|-------------|----------------|
| **Name**     | `sobra-zero-prototipo` |
| **Organization** | Crie uma nova: `Squad Lilás` |
| **Password** | Uma senha forte (ex.: `S0braZero!2026`) — **anote em local seguro** |
| **Region**   | `South America (São Paulo) .sa-east-1` (mais próximo do Brasil) |

Clique em **"Create project"**. A inicialização leva 1–3 minutos. Enquanto isso,
vá passo 3 — instalar a CLI.

### Passo 3 — Pegar URL e anon key

No painel do seu projeto → **Project Settings** (ícone de engrenagem no canto
inferior esquerdo) → **API**:

- **URL:** algo como `https://abcde12345.supabase.co`
- **anon public key:** uma string longa que começa com `eyJhbGciOi...`

> Copie ambas — você vai precisar no `.env.local`.

---

## 2️⃣ Instalar a CLI do Supabase

A CLI permite rodar o banco localmente e empurrar migrations.

### Via npm (recomendado)

```bash
npm install -g supabase
```

### Verificar instalação

```bash
supabase version
# Deve imprimir algo como: 2.7.4 ou superior
```

> **Windows?** Use `winget install --id Stripe.Supabase --source winget` ou
> instale via [Scoop](https://scoop.net/).

---

## 3️⃣ Login e inicialização

### Passo 4 — Fazer login

```bash
supabase login
```

Abrirá uma página no navegador para confirmar a autenticação. Após o login,
o token fica armazenado em `~/.supabase/config.json`.

### Passo 5 — Inicializar o projeto local

Dentro da pasta raiz do projeto:

```bash
cd /media/fernando/PROJETOS/Lilas_Helpig
supabase init
```

Isso cria a estrutura local:

```
.supabase/
├── config.toml      # Configurações do projeto local
├── functions/       # Edge Functions (vazio por enquanto)
└── migrations/      # Pasta de migrations (criada automaticamente)
```

### Passo 6 — Configurar `.env.local`

Crie o arquivo `.env.local` na raiz do projeto:

```bash
cat > .env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui

# Outras variáveis (adicione conforme precisa)
NODE_ENV=development
EOF
```

> **IMPORTANTE para o Sobra Zero:**
> - Não commite `.env.local` ao Git — já está no `.gitignore`.
> - Para páginas estáticas (como esta), o JS lê `NEXT_PUBLIC_SUPABASE_URL` e
>   `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `import.meta.env` (Vite) ou variável
>   global configurada manualmente. Veja [`03-supabase-js.md`](./03-supabase-js.md).

---

## 4️⃣ Linkar ao projeto remoto

### Passo 7 — Linkar

```bash
supabase link --project-id SEU_PROJECT_ID
```

> Para encontrar o `project-id`: no painel Supabase → **Project Settings** →
> em **General**, o campo "Reference" é o ID.

Se pedir a URL e a chave, informe as copiadas no passo 3.

---

## 5️⃣ Subir as migrations

### Passo 8 — Rodar `db push`

```bash
supabase db push
```

Isso empurra as 4 migrations da pasta `plano/migrations/` para o banco remoto.
Se tudo der certo, você verá:

```
Connecting to database...
Pushing to remote database...
Schema: public
✓ Migration 20260101000000_init.sql applied
✓ Migration 20260102000000_profiles.sql applied
✓ Migration 20260103000000_ofertas.sql applied
✓ Migration 20260104000000_functions.sql applied
```

### Passo 9 (alternativo) — Rodar localmente primeiro

Para testar sem tocar o remoto:

```bash
supabase start
supabase db push --local
```

O `supabase start` levanta containers Docker com Postgres + GoTrue + Storage localmente.

---

## 🔧 Comandos úteis do dia a dia

| Comando | O que faz |
|---------|-----------|
| `supabase start` | Sobe os containers locais (Postgres, Auth, Storage) |
| `supabase stop` | Para os containers locais |
| `supabase db push` | Empurra migrations locais para o remoto |
| `supabase db pull` | Baixa o schema remoto para migrations locais |
| `supabase db diff` | Mostra diff entre local e remoto |
| `supabase db reset` | Apaga e recria o banco local do zero |
| `supabase status` | Mostra status dos containers e URLs |
| `supabase functions serve` | Roda Edge Functions localmente |
| `supabase gen types` | Gera tipos TypeScript do schema |

### Verificar se as migrations subiram

No painel Supabase → **SQL Editor** → cole:

```sql
select filename, version, inserted_at
from supabase_migrations.schema_migrations
order by version;
```

---

## 🐛 Problemas comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `role anonymous` não existe | Auth não foi inicializado | Rode `supabase db reset` |
| `extension "pg_cron" does not exist` | pg_cron não disponível no plano gratuito | Crie manualmente no SQL Editor (ver [05-jobs-functions.md](./05-jobs-functions.md)) |
| `search_path` vazio | Role não configurada | As migrations já resolvem isso com `alter role` |
| Login falha via localhost | Redirect URL não configurada | No painel → Authentication → Settings → `http://localhost:3000` |

---

## ✅ Checklist de validação

- [ ] Conta Supabase criada
- [ ] Projeto criado e aguardando confirmação
- [ ] URL e anon key copiadas
- [ ] CLI instalada (`supabase version`)
- [ ] Login realizado (`supabase login`)
- [ ] `.env.local` criado com URL + key
- [ ] Projeto linkado (`supabase link`)
- [ ] Migrations enviadas (`supabase db push`)
- [ ] `schema_migrations` mostra as 4 migrations aplicadas
- [ ] `pg_cron` habilitado (Database → Extensions)
