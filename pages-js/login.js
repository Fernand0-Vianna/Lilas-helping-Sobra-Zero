/**
 * login.js — Autenticação com Supabase
 * ====================================================================
 * Substitui a maquete estática de pages/login.html por login real.
 *
 * RN-envolvidas: nenhuma direta (é auth), mas determina para onde
 * redirecionar conforme o perfil (doador / instituicao / voluntario).
 */

import supabase, { getSession, getUserProfile, mostrarAlerta } from './supabase.js';

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
      mostrarAlerta('warn', 'A senha precisa ter pelo menos 6 caracteres.');
      senhaInput.focus();
      return;
    }

    // --- Chamada ao Supabase Auth ---
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: senha,
    });

    if (error) {
      mostrarAlerta('danger', `Erro no login: ${error.message}`);
      return;
    }

    // --- Carrega o profile para decidir o redirecionamento ---
    const profile = await getUserProfile();

    if (!profile) {
      mostrarAlerta('warn', 'Usuário sem perfil cadastrado. Redirecionando para criar conta.');
      window.location.href = 'cadastro.html';
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
