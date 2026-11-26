/**
 * Verificador das correções da revisão (Lote 1 + migrations).
 * Roda sem dependências: node tests/verificar-correcoes.mjs
 * Lê os arquivos reais do projeto e falha se um defeito conhecido voltar.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(resolve(root, p), 'utf8');

const falhas = [];
const checar = (nome, condicao, detalhe = '') => {
  if (condicao) {
    console.log(`  ok   ${nome}`);
  } else {
    console.log(`  FALHA ${nome}${detalhe ? ' - ' + detalhe : ''}`);
    falhas.push(nome);
  }
};

const paginasApp = [
  'pages/ofertas.html',
  'pages/oferta.html',
  'pages/publicar-oferta.html',
  'pages/relatorio.html',
  'pages/perfil.html',
];

console.log('\n[1] Botao Sair nas 5 paginas do app');
for (const pagina of paginasApp) {
  const html = ler(pagina);
  checar(
    `${pagina}: logout nao recebe o Event`,
    !/addEventListener\(['"]click['"],\s*logout\s*\)/.test(html),
    'encontrou addEventListener(click, logout)'
  );
  checar(
    `${pagina}: wrapper de logout presente`,
    /addEventListener\(['"]click['"],\s*(?:function\s*\(\)\s*|\(\)\s*=>\s*|evento\s*=>\s*)logout\(/.test(html) ||
      /addEventListener\(['"]click['"],\s*\(\)\s*=>\s*logout\(\s*\)/.test(html),
    'wrapper nao encontrado'
  );
}

console.log('\n[2] Logo da landing');
const index = ler('index.html');
checar('index.html: sem caminho imags/', !/imags\//.test(index));
checar('index.html: rodape aponta para design/Logo/Logo.svg',
  /src=["']design\/Logo\/Logo\.svg["']/.test(index));

console.log('\n[3] XSS armazenado no relatorio');
const relatorio = ler('pages-js/relatorio.js');
for (const campo of ['d.doador', 'd.titulo', 'd.status_final', 'd.motivo_descarte']) {
  checar(`relatorio.js: ${campo} escapado`,
    !new RegExp('\\$\\{\\s*' + campo.replace('.', '\\.') + '\\s*\\}').test(relatorio),
    'interpolacao direta em innerHTML');
}

console.log('\n[4] XSS no popup de publicacao');
const publicar = ler('pages-js/publicar-oferta.js');
checar('publicar-oferta.js: mensagem do popup escapada',
  !/\$\{mensagem\}/.test(publicar), 'interpolacao direta da mensagem');

console.log('\n[5] Cadastro com confirmacao de e-mail');
const cadastro = ler('pages-js/cadastro.js');
checar('cadastro.js: trata ausencia de sessao apos signUp',
  /signUpData\.session/.test(cadastro),
  'nao verifica signUpData.session');

console.log('\n[6] Login sem erro visivel / textos de maquete');
const login = ler('pages-js/login.js');
checar('login.js: mostra popup de erro no signInWithPassword',
  /mostrarPopup\(['"]danger['"]/.test(login));
for (const pagina of ['pages/login.html', 'pages/cadastro.html']) {
  const html = ler(pagina);
  checar(`${pagina}: sem texto de maquete estatica`,
    !/maquete estática|maquete estatica|nenhum dado é enviado|qualquer e-mail e senha avançam|qualquer e-mail e senha avancam/i.test(html));
}

console.log('\n[7] Menu mobile nas paginas do app');
for (const pagina of paginasApp) {
  const html = ler(pagina);
  checar(`${pagina}: botao burger presente`, /class=["'][^"']*burger/.test(html));
  checar(`${pagina}: script do menu dentro do body`,
    html.indexOf('// menu mobile') > -1 && html.indexOf('// menu mobile') < html.indexOf('</body>'));
  checar(`${pagina}: sem BOM no inicio`, html.charCodeAt(0) !== 0xFEFF);
}

console.log('\n[8] Migrations pendentes aplicadas no repositorio');
const migrations = [
  'supabase/migrations/20260107000000_fix_timeline_duplicada.sql',
  'supabase/migrations/20260108000000_correcoes_rn.sql',
];
for (const m of migrations) {
  let existe = false;
  try { ler(m); existe = true; } catch { existe = false; }
  checar(`${m} existe`, existe);
}

console.log('\n[9] Correcoes de regra de negocio no SQL');
try {
  const sql = migrations.slice(1).map(ler).join('\n');
  checar('RN-01: expira_em usa prazo de coleta',
    /expira_em\s*:=\s*(?:v_coleta|new\.prazo_coleta)/.test(sql));
  checar('RN-02: job de expiracao a cada 15 min', /\*\/15\s*\*\s*\*\s*\*\s*\*/.test(sql));
  checar('corrida: aceitar exige status publicada', /where id\s*=\s*p_oferta_id\s+and\s+status\s*=\s*'publicada'/.test(sql));
  checar('corrida: assumir exige voluntario_id nulo',
    /where id\s*=\s*p_oferta_id[\s\S]{0,200}?voluntario_id\s+is\s+null/.test(sql));
  checar('RN-06: view de equidade sem security_invoker', /vw_equidade_instituicoes[\s\S]{0,200}security_invoker\s*=\s*false/.test(sql));
  checar('superficie: revoke execute de public/anon', /revoke\s+execute[\s\S]{0,200}from\s+public,\s*anon/.test(sql));
} catch {
  checar('SQL das correcoes legivel', false);
}

console.log('\n[10] CNPJ validado no backend e no front');
const cnpjMigration = 'supabase/migrations/20260110000000_cnpj_backend.sql';
try {
  const sqlCnpj = ler(cnpjMigration);
  checar('migration cnpj_backend existe', !!sqlCnpj);
  checar('cnpj_valido com digitos verificadores',
    /w1 int\[\]\s*:=\s*array\[5,4,3,2,9,8,7,6,5,4,3,2\]/.test(sqlCnpj) &&
    /w2 int\[\]\s*:=\s*array\[6,5,4,3,2,9,8,7,6,5,4,3,2\]/.test(sqlCnpj));
  checar('constraint NOT VALID (nao afeta linhas antigas)',
    /check \(public\.cnpj_valido\(cnpj\)\) not valid/i.test(sqlCnpj));
  checar('execute revogado de anon/public',
    /revoke all on function public\.cnpj_valido[\s\S]{0,100}from public, anon/i.test(sqlCnpj));
} catch {
  checar('migration cnpj_backend legivel', false);
}
checar('cadastro.js: valida CNPJ antes do signUp',
  /cnpjValido\(detalhe\.cnpj\)/.test(cadastro));
checar('cadastro.js: funcao cnpjValido exportada', /export function cnpjValido/.test(cadastro));

console.log('\n[11] Nome no top bar e destaque de Ofertas');
const supModulo = ler('pages-js/supabase.js');
checar('supabase.js: exporta preencherNomeTopBar', /export function preencherNomeTopBar/.test(supModulo));
checar('supabase.js: usa textContent', /textContent\s*=\s*profile\.nome/.test(supModulo));
const cssNav = ler('css/stily.css');
checar('stily.css: .nav a.is-current', /\.nav a\.is-current\s*\{/.test(cssNav));
for (const pagina of paginasApp) {
  const html = ler(pagina);
  checar(`${pagina}: #usuario-nome no top bar`, /id=["']usuario-nome["']/.test(html));
  checar(`${pagina}: Ofertas com is-current`, /class=["'][^"']*is-current[^"']*["'][^>]*>\s*<span data-icon="package"/.test(html));
}
checar('ofertas.html: aria-current so na pagina corrente',
  /class="is-current" aria-current="page"/.test(ler('pages/ofertas.html')));
checar('relatorio.html: sem aria-current duplo',
  !/href="ofertas\.html"[^>]*aria-current/.test(ler('pages/relatorio.html')));

console.log('\n[12] Homes propias por perfil');
for (const [pagina, iconePerfil, modo] of [
  ['pages/instituicao.html', 'building-2', 'instituicao'],
  ['pages/voluntario.html', 'truck', 'voluntario'],
]) {
  let html = '';
  try { html = ler(pagina); } catch { /* falta */ }
  checar(`${pagina}: existe`, !!html);
  checar(`${pagina}: icone ${iconePerfil}`, html.includes(`data-icon="${iconePerfil}"`));
  checar(`${pagina}: feed-ofertas`, html.includes('id="feed-ofertas"'));
  checar(`${pagina}: top bar com nome`, html.includes('id="usuario-nome"'));
  checar(`${pagina}: Publicar marcado para doador`, html.includes('data-so-doador'));
  const modulo = ler(`pages-js/${modo}.js`);
  checar(`pages-js/${modo}.js: chama renderizarFeed(${modo})`,
    new RegExp(`renderizarFeed\\('${modo}'\\)`).test(modulo));
}
checar('ofertas.js: renderizarFeed aceita modo',
  /export async function renderizarFeed\(modo = 'doador'\)/.test(ler('pages-js/ofertas.js')));
checar('ofertas.js: esconde acoes de doador',
  /data-so-doador/.test(ler('pages-js/ofertas.js')));
const loginJs = ler('pages-js/login.js');
checar('login: instituicao -> instituicao.html', /instituicao:\s*'instituicao\.html'/.test(loginJs));
checar('login: voluntario -> voluntario.html', /voluntario:\s*'voluntario\.html'/.test(loginJs));

console.log('\n[13] Chips de demonstracao no cadastro');
const htmlCadastro = ler('pages/cadastro.html');
for (const papel of ['doador', 'instituicao', 'voluntario']) {
  checar(`cadastro.html: chip ${papel}`, htmlCadastro.includes(`data-preencher="${papel}"`));
}
checar('cadastro.html: CNPJ valido no chip', htmlCadastro.includes("'11444777000161'"));
checar('cadastro.html: sem gravacao automatica nos chips',
  !/qchip\[data-preencher\][\s\S]{0,1200}?signUp|signUp[\s\S]{0,1200}?qchip\[data-preencher\]/.test(htmlCadastro));

console.log('\n[14] Seed de demonstracao no banco');
const seedPath = 'supabase/migrations/20260111000000_seed_demo.sql';
let seedSql = '';
try { seedSql = ler(seedPath); } catch { /* falta */ }
checar('seed_demo existe', !!seedSql);
checar('seed: 3 ofertas marcadas [TESTE]',
  (seedSql.match(/\[TESTE\]/g) || []).length >= 5);
checar('seed: nao insere exige_frio (coluna gerada)',
  !/\bexige_frio\b[\s\S]{0,40}?select|\(\s*doador_id[\s\S]{0,200}?exige_frio/.test(seedSql));
checar('seed: nao cria auth.users', !/auth\.users/.test(seedSql.replace(/--[\s\S]*?(?=\n)/g, '')));
checar('seed: protege titulos repetidos', /not exists/.test(seedSql));

console.log(`\nResultado: ${falhas.length === 0 ? 'TUDO OK' : falhas.length + ' FALHA(S)'}`);
if (falhas.length) {
  console.log(falhas.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
