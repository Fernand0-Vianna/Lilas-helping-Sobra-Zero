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
 * Limpa alertas prévios com o ID fornecido.
 */
export function limparAlerta(id = 'erro') {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
