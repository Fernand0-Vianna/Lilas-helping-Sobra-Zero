# 📦 03 — `supabase-js` no Browser (Browser-Native)

> Como incluir o cliente `supabase-js` via CDN, configurar o cliente
> centralizado e usar helpers de auth e dados em páginas estáticas.
> **Zero build tools, zero npm — funciona direto no browser.**

---

## 1️⃣ Inclusão via CDN (ES Modules)

Adicione este script no `<head>` (ou antes de fechar o `</body>`) de **todas**
as páginas que precisam falar com o Supabase:

```html
<script type="module">
  // Importa supabase-js diretamente da CDN do NPM (ESM)
  import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';

  // Agora supabase-js está disponível nesse módulo.
  const supabase = createClient(
    'https://SEU_PROJETO.supabase.co',
    'SUA_ANON_KEY'
  );
</script>
```

> **Alternativa mais simples** — carregue como módulo externo:
> ```html
> <script type="module" src="../pages-js/supabase.js"></script>
> ```

### Por que CDN e não `npm install`?

- O Sobra Zero é um **projeto estático (HTML/CSS/JS puro)** — não há bundler.
- `supabase-js` v2 já suporta ESM nativo no browser.
- Skypack resolve todas as dependências transitivas automaticamente.

---

## 2️⃣ Cliente centralizado (`pages-js/supabase.js`)

Crie `pages-js/supabase.js` com a configuração centralizada:

```js
// pages-js/supabase.js
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,        // opcional: persiste login entre recargas
    detectSessionInUri: true,     // captura o redirect do magic link / OAuth
  },
});

export default supabase;
```

> Salve este arquivo e importe-o em qualquer página:
> ```js
> import supabase from '../pages-js/supabase.js';
> ```

---

## 3️⃣ Helpers de Auth

### `getSession()` — obtém a sessão atual

```js
import { supabase } from '../pages-js/supabase.js';

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session; // null se não logado
}

// Uso:
const session = await getSession();
if (!session) {
  window.location.href = 'login.html';
}
```

### `getUserProfile()` — carrega o profile + detalhe

```js
import { supabase } from '../pages-js/supabase.js';

async function getUserProfile() {
  const session = await getSession();
  if (!session) return null;

  // Busca o profile com o user_type
  const { data: profile, error: e1 } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (e1 || !profile) return null;

  // Busca a tabela de detalhe conforme o perfil
  let detalhe = null;
  switch (profile.user_type) {
    case 'doador': {
      const { data } = await supabase.from('doadores').select('*').eq('profile_id', profile.id).single();
      detalhe = data;
      break;
    }
    case 'instituicao': {
      const { data } = await supabase.from('instituicoes').select('*').eq('profile_id', profile.id).single();
      detalhe = data;
      break;
    }
    case 'voluntario': {
      const { data } = await supabase.from('voluntarios').select('*').eq('profile_id', profile.id).single();
      detalhe = data;
      break;
    }
  }

  return { ...profile, detalhe };
}
```

### `redirectIfNotAuthenticated()` — proteção de rotas

```js
import { supabase } from '../pages-js/supabase.js';

async function redirectIfNotAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '../pages/login.html';
    return null;
  }
  return session;
}

// Chame no início de cada página protegida:
const session = await redirectIfNotAuthenticated();
if (!session) return; // já redirecionado
```

### `logout()` — encerrar sessão

```js
import { supabase } from '../pages-js/supabase.js';

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (!error) window.location.href = '../pages/login.html';
}

// HTML: <button onclick="logout()">Sair</button>
```

---

## 4️⃣ Helpers de dados (queries)

### Buscar ofertas do feed (com equidade — RN-06)

```js
async function buscarFeedOfertas() {
  const { data: ofertas, error } = await supabase
    .from('vw_ofertas_feed')
    .select('*')
    .order('kg_recebidos_30d_prioridade', { ascending: true });

  return { ofertas, error };
}
```

### Publicar oferta (via RPC — RN-01, RN-05, RN-08)

```js
const { data, error } = await supabase.rpc('criar_oferta', {
  p_titulo: 'Marmitas de frango',
  p_tipo: 'preparado',
  p_quantidade_kg: 8.5,
  p_data_preparo: '2026-10-01T10:00:00Z',
  p_endereco_coleta: 'Rua X, 123 — Tatuapé',
  p_descricao: 'Restam 10 unidades, embaladas individualmente.',
  p_porcoes: 17,
  p_bairro_coleta: 'Tatuapé',
  p_observacoes: null,
});
```

### Avançar status (via RPC — RN-01 a RN-07)

```js
// Instituição aceita:
await supabase.rpc('aceitar_oferta', { p_oferta_id: ofertaId });

// Voluntário assume transporte (RN-04):
await supabase.rpc('assumir_transporte', { p_oferta_id: ofertaId });

// Voluntário registra coleta:
await supabase.rpc('avancar_status', { p_oferta_id: ofertaId, p_destino: 'coletada' });

// Voluntário registra entrega:
await supabase.rpc('avancar_status', { p_oferta_id: ofertaId, p_destino: 'entregue' });

// Instituição confirma (RN-07):
await supabase.rpc('confirmar_recebimento', {
  p_oferta_id: ofertaId,
  p_quantidade_recebida_kg: 7.8,
  p_observacoes: 'Recebido em bom estado.',
});
```

---

## 5️⃣ Proteção de rotas em páginas estáticas

Cada página que exige autenticação deve:

1. Importar o cliente `supabase.js`
2. Chamar `redirectIfNotAuthenticated()` no início
3. Renderizar conteúdo apenas se a sessão existir

```html
<!-- pages/ofertas.html -->
<script type="module">
  import { supabase } from '../pages-js/supabase.js';

  // Proteção de rota
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '../pages/login.html';
    throw new Error('Sessão não encontrada');
  }

  // Carrega dados só com a sessão ativa
  const { data: ofertas } = await supabase
    .from('vw_ofertas_feed')
    .select('*')
    .order('kg_recebidos_30d_prioridade', { ascending: true });

  // Renderiza...
</script>
```

---

## 6️⃣ Referências rápidas

### Tipos TypeScript (gerar via CLI)

```bash
supabase gen types typescript --project-id SEU_ID > supabase-types.d.ts
```

### Debug de conexão

```js
// Testa a conexão:
const { data, error } = await supabase.from('profiles').select('count').limit(1);
console.log('Conexão OK:', data, error);
```

### Erros comuns no browser

| Erro | Causa | Solução |
|------|-------|---------|
| `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` | URL errada | Confira `.env.local` / variáveis no cliente |
| `Invalid JWT` | Anon key inválida | Regenere no painel → API |
| CORS `403` | Origem não permitida | No painel → Authentication → Settings → URL configurada |
| Política retorna 0 linhas | RLS bloqueando | Verifique [04-rls-policies.md](./04-rls-policies.md) |
