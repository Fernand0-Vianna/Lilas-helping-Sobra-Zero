/**
 * cadastro.js — Cadastro de usuário + insert na tabela de detalhe
 * ====================================================================
 * Substitui a maquete estática de pages/cadastro.html.
 *
 * Fluxo:
 *   1. signUp com metadata (user_type, nome, telefone)
 *   2. Trigger fn_handle_new_user() cria o profile automaticamente
 *   3. Insert na tabela de detalhe correta (doadores / instituicoes / voluntarios)
 *
 * RNs envolvidas:
 *   RN-03 — CNPJ obrigatório + responsável legal na instituição
 *   RN-04 — Caixa térmica declarada no voluntário
 *   RN-05 — Validade cadastro sanitário no doador
 */

import supabase, { mostrarAlerta } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-cadastro');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    // --- Determina qual aba de perfil está ativa ---
    const botaoAtivo = document.querySelector('.tabs button.is-active');
    const aba = botaoAtivo ? botaoAtivo.dataset.tab : 'doador';
    const senha = document.getElementById('senha').value;
    const senha2 = document.getElementById('senha2').value;

    // --- Validações ---
    if (senha !== senha2) {
      mostrarAlerta('warn', 'As senhas não conferem.');
      document.getElementById('senha2').focus();
      return;
    }
    if (senha.length < 8) {
      mostrarAlerta('warn', 'A senha precisa ter pelo menos 8 caracteres.');
      document.getElementById('senha').focus();
      return;
    }
    if (!document.getElementById('aceite').checked) {
      mostrarAlerta('warn', 'É preciso aceitar os Termos de uso.');
      return;
    }

    // --- Coleta campos conforme o perfil ---
    let email, nome, telefone;
    const detalhe = {};

    if (aba === 'doador') {
      // RN-05: validade cadastro sanitário
      email = document.getElementById('d-email').value.trim();
      nome = document.getElementById('d-nome').value.trim();
      telefone = document.getElementById('d-tel').value.trim() || null;
      detalhe.nome_estabelecimento = nome;
      detalhe.responsavel = document.getElementById('d-resp').value.trim();
      detalhe.telefone = telefone;
      detalhe.cadastro_sanitario_validade = document.getElementById('d-sanitario').value;
      detalhe.endereco = '';
      detalhe.bairro = '';

    } else if (aba === 'instituicao') {
      // RN-03: CNPJ obrigatório
      email = document.getElementById('i-email').value.trim();
      nome = document.getElementById('i-nome').value.trim();
      telefone = null;
      detalhe.razao_social = nome;
      detalhe.responsavel_legal = document.getElementById('i-resp').value.trim();

      // Formata CNPJ para 14 dígitos (remove pontos, barras, traços)
      detalhe.cnpj = document.getElementById('i-cnpj').value.replace(/\D/g, '');
      const temRefri = document.getElementById('i-frio').value === 'sim';
      detalhe.tem_refrigeracao = temRefri;
      // Se tem refrigeração, pede capacidade; se não, null
      detalhe.capacidade_refrigeracao_kg = temRefri ? 0 : null;
      detalhe.necessidade_semanal = 'ate_20kg';
      detalhe.aceita_congelado = false;
      detalhe.endereco = '';
      detalhe.bairro = '';

    } else { // voluntario
      // RN-04: caixa térmica declarada
      email = document.getElementById('v-email').value.trim();
      nome = document.getElementById('v-nome').value.trim();
      telefone = document.getElementById('v-tel').value.trim();
      detalhe.nome_completo = nome;
      detalhe.telefone = telefone;
      detalhe.tem_caixa_termica = document.getElementById('v-termica').value === 'sim';
      detalhe.meio_transporte = mapearVeiculo(document.getElementById('v-veic').value);
      detalhe.capacidade_kg = null;
      detalhe.raio_atuacao_km = null;
      detalhe.disponivel = true;
    }

    // --- 1. Cria a conta no Auth (com metadata para trigger) ---
    const { data: { user }, error: signUpError } = await supabase.auth.signUp({
      email: email,
      password: senha,
      options: {
        data: {
          user_type: aba,
          nome: nome,
          telefone: telefone || '',
        },
      },
    });

    if (signUpError) {
      mostrarAlerta('danger', `Erro no cadastro: ${signUpError.message}`);
      return;
    }

    if (!user) {
      mostrarAlerta('warn', 'Confirme seu e-mail antes de tentar entrar.');
      return;
    }

    // --- 2. Garante que o profile existe (backup caso trigger falhe) ---
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      user_type: aba,
      nome: nome,
      email: email,
      telefone: telefone || null,
    });

    if (profileError && profileError.code !== '23505') { // 23505 = já existe (ok)
      mostrarAlerta('warn', `Aviso: ${profileError.message}`);
    }

    // --- 3. Insere na tabela de detalhe ---
    let tabela;
    switch (aba) {
      case 'doador': tabela = 'doadores'; break;
      case 'instituicao': tabela = 'instituicoes'; break;
      case 'voluntario': tabela = 'voluntarios'; break;
    }

    const { error: insertError } = await supabase.from(tabela).insert({
      profile_id: user.id,
      ...detalhe,
    });

    if (insertError) {
      mostrarAlerta('danger', `Erro ao salvar dados: ${insertError.message}`);
      console.error(insertError);
      return;
    }

    // --- 4. Redireciona para login ---
    window.location.href = 'login.html?conta=criada';
  });
});

/**
 * Mapeia o texto do select para o ENUM meio_transporte.
 */
function mapearVeiculo(texto) {
  if (texto === 'Carro') return 'carro';
  if (texto === 'Moto / bicicleta') return 'moto_ou_bicicleta';
  if (texto === 'A pé / transporte público') return 'ape_ou_transporte_publico';
  return 'ape_ou_transporte_publico';
}
