# 🔄 06 — Migração das Páginas Estáticas

> Guia para transformar as páginas HTML estáticas em páginas conectadas ao
> Supabase, passo a passo, mantendo o CSS existente.

---

## 📋 Páginas existentes

| Página | Estado atual | Próximos passos |
|--------|-------------|-----------------|
| `index.html` | Landing estática | Proteger links para páginas logadas (login) |
| `pages/login.html` | Maquete estática | Conectar com `supabase.auth.signInWithPassword` |
| `pages/cadastro.html` | Maquete estática | Conectar com `supabase.auth.signUp` + insert tabela de detalhe |
| `pages/termos.html` | Estatística | (não precisa migrar — é conteúdo fixo) |

### Novas páginas a criar (pasta raiz ou `pages/`)

| Página | JS associado | Telas do protótipo |
|--------|-------------|-------------------|
| `pages/ofertas.html` | `pages-js/ofertas.js` | 05 / M2 |
| `pages/publicar-oferta.html` | `pages-js/publicar-oferta.js` | 04 / M1 |
| `pages/oferta.html?id=...` | `pages-js/oferta.js` | 06/07/08 |
| `pages/relatorio.html` | `pages-js/relatorio.js` | 12 / M7 |

---

## 1️�⃣ Estrutura de pastas recomendada

```
Lilas_Helpig/
├── index.html
├── css/
│   └── stily.css
├── pages/
│   ├── login.html
│   ├── cadastro.html
│   ├── termos.html
│   ├── ofertas.html          ← NOVA
│   ├── publicar-oferta.html  ← NOVA
│   ├── oferta.html           ← NOVA
│   └── relatorio.html        ← NOVA
├── pages-js/                  ← (no escopo do plano/)
│   ├── supabase.js
│   ├── login.js
│   ├── cadastro.js
│   ├── publicar-oferta.js
│   ├── ofertas.js
│   ├── oferta.js
│   └── relatorio.js
└── plano/
    └── ... (documentação)
```

---

## 2️⃣ Migrando `login.html` → login real

### Passo 1 — Incluir o cliente Supabase

```html
<!-- antes de fechar </body> -->
<script type="module" src="../pages-js/supabase.js"></script>
```

> Copie a versão da raiz (`plano/pages-js/supabase.js`) para `../pages-js/`
> na pasta principal do projeto.

### Passo 2 — Substituir o JS estático

O script atual no `login.html` redirige para a landing. Substitua por:

```html
<script type="module">
  import supabase from '../pages-js/supabase.js';

  const form = document.getElementById('form-login');
  const emailInput = document.getElementById('email');
  const senhaInput = document.getElementById('senha');
  const erroEl = document.getElementById('erro') ||
    (() => {
      const e = document.createElement('p');
      e.className = 'alert alert-warn';
      e.id = 'erro';
      document.querySelector('.auth-card').appendChild(e);
      return e;
    })();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailInput.value,
      password: senhaInput.value,
    });

    if (error) {
      erroEl.textContent = error.message;
      erroEl.style.display = 'flex';
      return;
    }

    // Redireciona por tipo de perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('id', data.user.id)
      .single();

    const redirect = {
      doador: 'publicar-oferta.html',
      instituicao: 'ofertas.html',
      voluntario: 'ofertas.html',
    }[profile?.user_type || 'doador'];

    window.location.href = redirect;
  });
</script>
```

### Passo 3 — Manter os chips de demonstração

Os chips (`doador@cantinadoze.com`, etc.) continuam funcionando —
agora eles preparam os campos e o clique no "Entrar" dispara o `signInWithPassword`.

---

## 3️⃣ Migrando `cadastro.html` → cadastro real

### Substitua o script de validação estática por:

```html
<script type="module">
  import supabase from '../pages-js/supabase.js';

  const form = document.getElementById('form-cadastro');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Determina qual aba (perfil) está ativa
    const aba = document.querySelector('.tabs button.is-active').dataset.tab;
    const senha = document.getElementById('senha').value;
    const senha2 = document.getElementById('senha2').value;

    // Validações básicas (ajuste conforme os IDs do HTML)
    if (senha !== senha2) {
      mostrarErro('As senhas não conferem.');
      return;
    }
    if (!document.getElementById('aceite').checked) {
      mostrarErro('É preciso aceitar os Termos de uso.');
      return;
    }

    let email, nome, telefone, userType = aba;

    // Coleta campos conforme a aba
    if (aba === 'doador') {
      email = document.getElementById('d-email').value;
      nome = document.getElementById('d-nome').value;
      telefone = document.getElementById('d-tel').value;
    } else if (aba === 'instituicao') {
      email = document.getElementById('i-email').value;
      nome = document.getElementById('i-nome').value;
    } else { // voluntario
      email = document.getElementById('v-email').value;
      nome = document.getElementById('v-nome').value;
      telefone = document.getElementById('v-tel').value;
    }

    // 1. Cria a conta no Auth (com metadata)
    const { data: { user }, error: signUpError } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { user_type: userType, nome, telefone }
      }
    });

    if (signUpError) {
      mostrarErro(signUpError.message);
      return;
    }

    // 2. Trigger fn_handle_new_user cria o profile automaticamente
    //    Se falhar, insira manualmente:
    await supabase.from('profiles').upsert({
      id: user.id, user_type: userType, nome, email, telefone
    });

    // 3. Insere na tabela de detalhe correta
    if (aba === 'doador') {
      await supabase.from('doadores').insert({
        profile_id: user.id,
        nome_estabelecimento: document.getElementById('d-nome').value,
        responsavel: document.getElementById('d-resp').value,
        telefone: document.getElementById('d-tel').value || null,
        cadastro_sanitario_validade: document.getElementById('d-sanitario').value,
        endereco: '', bairro: ''
      });
    } else if (aba === 'instituicao') {
      const cnpj = document.getElementById('i-cnpj').value.replace(/\D/g, '');
      await supabase.from('instituicoes').insert({
        profile_id: user.id,
        razao_social: document.getElementById('i-nome').value,
        cnpj: cnpj,
        responsavel_legal: document.getElementById('i-resp').value,
        telefone: '',
        tem_refrigeracao: document.getElementById('i-frio').value === 'sim',
        // capacidade_refrigeracao_kg: ...
        necessidade_semanal: 'ate_20kg',
        aceita_congelado: false,
        endereco: '', bairro: ''
      });
    } else { // voluntario
      await supabase.from('voluntarios').insert({
        profile_id: user.id,
        nome_completo: document.getElementById('v-nome').value,
        telefone: document.getElementById('v-tel').value,
        tem_caixa_termica: document.getElementById('v-termica').value === 'sim',
        meio_transporte: mapearVeiculo(document.getElementById('v-veic').value),
        disponivel: true
      });
    }

    // 4. Redireciona
    window.location.href = 'login.html?conta=criada';
  });

  function mostrarErro(msg) {
    const el = document.getElementById('erro');
    el.textContent = msg;
    el.style.display = 'flex';
  }

  function mapearVeiculo(sel) {
    return sel === 'Carro' ? 'carro'
      : sel === 'Moto / bicicleta' ? 'moto_ou_bicicleta'
      : 'ape_ou_transporte_publico';
  }
</script>
```

---

## 4️⃣ Proteger rotas em páginas logadas

Toda página que exige login deve começar com:

```html
<script type="module">
  import { supabase } from '../pages-js/supabase.js';

  const { data: { session }, error } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '../pages/login.html';
    throw new Error('Usuário não autenticado');
  }

  // ... resto do script
</script>
```

---

## 5️⃣ Conectar forms ao Supabase

### Publicar oferta (tela 04)

```js
const { data: oferta, error } = await supabase.rpc('criar_oferta', {
  p_titulo: document.getElementById('titulo').value,
  p_tipo: document.getElementById('tipo').value,
  p_quantidade_kg: parseFloat(document.getElementById('peso').value),
  p_data_preparo: document.getElementById('preparo-datetime').value,
  p_endereco_coleta: document.getElementById('endereco').value,
  p_bairro_coleta: document.getElementById('bairro').value,
  p_descricao: document.getElementById('descricao').value || null,
  p_porcoes: parseInt(document.getElementById('porcoes').value) || null,
  p_observacoes: null
});
```

> Os prazos (RN-01/RN-08) são calculados **no banco** pela trigger
> `fn_oferta_setar_prazos`. O front-end não precisa calcular.

### Feed de ofertas (tela 05)

```js
const { data: ofertas, error } = await supabase
  .from('vw_ofertas_feed')  // view materializada
  .select('*')
  .order('kg_recebidos_30d_prioridade', { ascending: true });  // RN-06
```

---

## 6️⃣ Testar a migração

| Passo | Como testar |
|-------|-------------|
| 1. Auth funciona | Faça login com um usuário criado — deve redirecionar para a dashboard |
| 2. Cadastro cria profile | Após `signUp`, verifique `profiles` no painel → Table Editor |
| 3. Publicar oferta | Como doador, crie uma oferta — confira se `prazo_coleta` foi calculado |
| 4. Feed ordenado | Abra o feed — instituições com menos kg aparecem primeiro (RN-06) |
| 5. Policies aplicadas | Tente acessar como outro usuário — deve bloquear |
| 6. pg_cron expira | Crie uma oferta expirada — aguarde 15 min → status deve virar `expirada` |
| 7. Timeline | Abra uma oferta — a timeline (`oferta_historico`) deve mostrar eventos |

---

## 7️⃣ Checklist final de migração

- [ ] `pages-js/supabase.js` copiado para a raiz do projeto (fora de `plano/`)
- [ ] Todas as URLs de `import` apontam para `../pages-js/*.js`
- [ ] `.env.local` configurado com URL + anon key reais
- [ ] Redirects em `login.js` usam `user_type` do profile
- [ ] `cadastro.js` faz `signUp` + insert na tabela de detalhe correta
- [ ] `publicar-oferta.js` chama `criar_oferta` via RPC
- [ ] `ofertas.js` ordena por `kg_recebidos_30d_prioridade ASC` (RN-06)
- [ ] `oferta.js` usa `avancar_status` / `confirmar_recebimento`
- [ ] Todas as páginas têm `redirectIfNotAuthenticated()`
- [ ] Chips de demonstração atualizados com e-mails reais (ou mantenha como mock)
- [ ] CSS existente (`.btn`, `.card`, `.chip`, `.alert`, `.auth`, `.tabs`) reaproveitado
