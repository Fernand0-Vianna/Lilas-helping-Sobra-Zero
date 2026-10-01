/**
 * supabase.js — Cliente centralizado do Supabase
 * ====================================================================
 * Importado por todas as páginas JS. Via CDN, ES modules nativos.
 *
 * Uso:
 *   import supabase, { getSession, getUserProfile, redirectIfNotAuthenticated } from '../pages-js/supabase.js';
 */

// Importa createClient diretamente da CDN (ESM nativo do browser)
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';

// --- Configurações (projeto Sobra Zero) ---
const SUPABASE_URL = 'https://oyhynvksczzxgkpvsbxv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h-IFz7GKFawSHM3wtZ3pOg_bMZaIrgv';

// --- Cliente singleton ---
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,   // renova token automaticamente
    persistSession: true,     // persiste no localStorage entre recargas
    storage: localStorage,    // onde salva a sessão
    detectSessionInUri: true, // captura redirect de magic link / OAuth
  },
});

export default supabase;

// ====================================================================
// HELPERS DE AUTENTICAÇÃO
// ====================================================================

/**
 * Retorna a sessão atual do usuário logado.
 * Útil para páginas que precisam condicionar renderização ao auth.
 *
 * @returns {Promise<object|null>} sessão ou null
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('[supabase] getSession error:', error.message);
  return session;
}

/**
 * Carrega o profile do usuário logado + a tabela de detalhe correspondente
 * (doadores, instituicoes ou voluntarios), conforme user_type.
 *
 * @returns {Promise<object|null>} profile unido com detalhe, ou null
 */
export async function getUserProfile() {
  const session = await getSession();
  if (!session) return null;

  // 1. Busca o profile (1:1 com auth.users)
  const { data: profile, error: eProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (eProfile || !profile) {
    console.error('[supabase] Profile não encontrado:', eProfile?.message);
    return null;
  }

  // 2. Busca a tabela de detalhe baseada no user_type
  let detalhe = null;

  switch (profile.user_type) {
    case 'doador': {
      const { data, error } = await supabase
        .from('doadores')
        .select('*')
        .eq('profile_id', profile.id)
        .single();
      if (!error) detalhe = data;
      break;
    }
    case 'instituicao': {
      const { data, error } = await supabase
        .from('instituicoes')
        .select('*')
        .eq('profile_id', profile.id)
        .single();
      if (!error) detalhe = data;
      break;
    }
    case 'voluntario': {
      const { data, error } = await supabase
        .from('voluntarios')
        .select('*')
        .eq('profile_id', profile.id)
        .single();
      if (!error) detalhe = data;
      break;
    }
    default:
      break;
  }

  return { ...profile, detalhe };
}

/**
 * Protege rotas: redireciona para login se o usuário não estiver autenticado.
 *
 * @param {string} redirectUrl - URL para onde redirecionar se autenticado
 * @returns {Promise<object|null>} sessão ou null (se redirecionado)
 */
export async function redirectIfNotAuthenticated(redirectUrl = '../pages/login.html') {
  const session = await getSession();
  if (!session) {
    window.location.href = redirectUrl;
    return null;
  }
  return session;
}

/**
 * Encerra a sessão e redireciona para a página de login.
 */
export async function logout(redirectUrl = '../pages/login.html') {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[supabase] logout error:', error.message);
  }
  window.location.href = redirectUrl;
}

// ====================================================================
// FUNÇÕES UTILITÁRIAS DE UI
// ====================================================================

/**
 * Exibe um alerta na tela usando as classes CSS do projeto.
 *
 * @param {string} tipo - 'info' | 'warn' | 'danger'
 * @param {string} texto  - mensagem a exibir
 * @returns {HTMLElement} elemento do alerta criado
 */
export function mostrarAlerta(tipo, texto) {
  const mapaClasses = {
    info: 'alert alert-info',
    warn: 'alert alert-warn',
    danger: 'alert alert-warn',
  };

  const el = document.createElement('div');
  el.className = mapaClasses[tipo] || 'alert alert-info';
  el.innerHTML = `<span>${tipo === 'info' ? 'ℹ️' : tipo === 'warn' ? '⚠️' : '❌'}</span><div>${texto}</div>`;
  el.style.display = 'flex';

  // Insere no topo do main ou body
  const container = document.querySelector('main') || document.body;
  container.insertBefore(el, container.firstChild);

  // Auto-remove após 5s
  setTimeout(() => el.remove(), 5000);
  return el;
}

/**
 * Exibe um popup modal de erro/alerta centralizado na tela.
 * Segue o guia de estilo (design/desktop/guia_de_estilo.html):
 * fonte IBM Plex Sans, radius 16px, alerta tipo RN-05 com mensagem em vermelho.
 * Fecha no botão, no clique fora ou na tecla Escape.
 *
 * Tokens: danger #DC2626 · danger-bg #FEE2E2 · danger-text #991B1B
 *         primary #7C5CE0 · border #E5E7EB · text #111827
 *
 * @param {string} tipo - 'info' | 'warn' | 'danger'
 * @param {string} titulo - título do popup
 * @param {string} texto - mensagem a exibir (em vermelho)
 */
export function mostrarPopup(tipo, titulo, texto) {
  fecharPopup();

  const paleta = {
    info:    { barra: '#1E40AF', fundo: '#DBEAFE', texto: '#1E40AF', btn: '#7C5CE0' },
    warn:    { barra: '#D97706', fundo: '#FFFBEB', texto: '#92400E', btn: '#7C5CE0' },
    danger:  { barra: '#DC2626', fundo: '#FEF2F2', texto: '#991B1B', btn: '#DC2626' },
  }[tipo] || { barra: '#DC2626', fundo: '#FEF2F2', texto: '#991B1B', btn: '#DC2626' };

  const backdrop = document.createElement('div');
  backdrop.id = 'popup-backdrop';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(17,24,39,.5);display:flex;' +
    'align-items:center;justify-content:center;z-index:9999;padding:1rem';

  backdrop.innerHTML =
    '<div role="alertdialog" aria-modal="true" style="' +
      'max-width:420px;width:100%;background:#fff;border:1px solid #E5E7EB;' +
      'border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(17,24,39,.2);' +
      'font-family:\'IBM Plex Sans\',system-ui,sans-serif;color:#111827;line-height:1.5">' +
      '<div style="' +
        'border-left:4px solid ' + paleta.barra + ';background:' + paleta.fundo + ';' +
        'border-radius:12px;padding:16px;margin-bottom:16px">' +
        '<strong style="display:block;font-size:14px;margin-bottom:6px;color:' + paleta.texto + '">' +
          escaparHtml(titulo) +
        '</strong>' +
        '<p style="font-size:14px;margin:0;color:#DC2626">' + escaparHtml(texto) + '</p>' +
      '</div>' +
      '<button id="popup-fechar" type="button" style="' +
        'width:100%;font-family:inherit;font-size:15px;font-weight:600;' +
        'padding:14px 24px;border-radius:8px;border:1.5px solid transparent;' +
        'cursor:pointer;background:' + paleta.btn + ';color:#fff">Entendi</button>' +
    '</div>';

  document.body.appendChild(backdrop);

  const fechar = () => fecharPopup();
  document.getElementById('popup-fechar').addEventListener('click', fechar);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) fechar(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); }
  });
}

/**
 * Escapa HTML para exibir mensagens com segurança no popup.
 */
function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * Remove o popup modal da tela, se existir.
 */
export function fecharPopup() {
  document.getElementById('popup-backdrop')?.remove();
}

/**
 * Limpa alertas prévios com o ID fornecido.
 */
export function limparAlerta(id = 'erro') {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
