/**
 * login.js — Autenticação com Supabase
 * ====================================================================
 * Substitui a maquete estática de pages/login.html por login real.
 *
 * RN-envolvidas: nenhuma direta (é auth), mas determina para onde
 * redirecionar conforme o perfil (doador / instituicao / voluntario).
 */

import supabase, { getSession, getUserProfile, mostrarPopup } from './supabase.js';

/**
 * Traduz erros do Supabase Auth para mensagens amigáveis em pt-BR.
 */
function traduzirErroLogin(error) {
  const msg = error.message || '';
  if (msg.includes('Invalid login credentials')) {
    return ['E-mail ou senha incorretos',
      'Verifique os dados e tente de novo. Se acabou de criar a conta, confirme seu e-mail antes de entrar.'];
  }
  if (msg.includes('Email not confirmed')) {
    return ['E-mail não confirmado',
      'Enviamos um link de confirmação para o seu e-mail. Clique nele e tente entrar novamente.'];
  }
  if (msg.includes('Too many requests')) {
    return ['Muitas tentativas',
      'Aguarde alguns minutos antes de tentar novamente.'];
  }
  return ['Erro no login', msg];
}

// --- Inicialização segura ---
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');
  const emailInput = document.getElementById('email');
  const senhaInput = document.getElementById('senha');

  // Chips de demonstração continuam funcionando
  document.querySelectorAll('.qchip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      emailInput.value = chip.dataset.email;
      senhaInput.value = 'sobrazero123';
      emailInput.focus();
    });
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = emailInput.value.trim();
    const senha = senhaInput.value;

    // Validação mínima
    if (!email.includes('@')) {
      emailInput.focus();
      return;
    }
    if (senha.length < 6) {
      mostrarPopup('warn', 'Senha muito curta', 'A senha precisa ter pelo menos 6 caracteres.');
      senhaInput.focus();
      return;
    }

    // --- Chamada ao Supabase Auth ---
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: senha,
    });

    if (error) {
      const [titulo, texto] = traduzirErroLogin(error);
      mostrarPopup('danger', titulo, texto);
      return;
    }

    // --- Carrega o profile para decidir o redirecionamento ---
    const profile = await getUserProfile();

    if (!profile) {
      mostrarPopup('warn', 'Conta sem perfil',
        'Entramos, mas não achamos seu perfil. Complete o cadastro para continuar.');
      setTimeout(() => { window.location.href = 'cadastro.html'; }, 2500);
      return;
    }

    // Mapeia user_type → página inicial
    const redirecionar = {
      doador: 'publicar-oferta.html',
      instituicao: 'ofertas.html',
      voluntario: 'ofertas.html',
    };

    const destino = redirecionar[profile.user_type] || 'ofertas.html';
    window.location.href = destino;
  });
});
