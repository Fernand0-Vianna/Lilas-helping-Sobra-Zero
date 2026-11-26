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

console.log(`\nResultado: ${falhas.length === 0 ? 'TUDO OK' : falhas.length + ' FALHA(S)'}`);
if (falhas.length) {
  console.log(falhas.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
