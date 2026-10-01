/**
 * publicar-oferta.js — Publicar oferta de alimento
 * ====================================================================
 * Conecta o formulário da tela 04 à RPC criar_oferta no Supabase.
 *
 * RNs envolvidas:
 *   RN-01 — prazos calculados no banco (4h preparo→coleta, 6h total)
 *   RN-05 — valida cadastro sanitário vencido (bloqueia preparado, frio, congelado)
 *   RN-08 — congelado tem prazo de 48h (calculado via fn_prazo_padrao)
 *
 * O front-end pré-valida, mas a autoridade final é a função pode_ofertar() no banco.
 */

import supabase from './supabase.js';
import { getUserProfile, mostrarAlerta, redirectIfNotAuthenticated } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  // --- Proteção de rota ---
  const session = await redirectIfNotAuthenticated();
  if (!session) return;

  // --- Carrega o perfil do doador logado ---
  const profile = await getUserProfile();

  // Só doadores podem publicar
  if (profile?.user_type !== 'doador') {
    mostrarAlerta('warn', 'Apenas doadores podem publicar ofertas.');
    window.location.href = 'ofertas.html';
    return;
  }

  const doador = profile.detalhe; // { cadastro_sanitario_validade, ... }

  // RN-05: pré-verificação no front-end
  const sanitarioVencido =
    doador && new Date(doador.cadastro_sanitario_validade) < new Date();

  // Campo de alerta de cadastro sanitário vencido
  const alertaSanitario = new SanitarioAlert(sanitarioVencido);

  // --- Referências do formulário ---
  const form = document.getElementById('form-publicar');
  const tipoSelect = document.getElementById('tipo-alimento');
  const tituloInput = document.getElementById('titulo');
  const pesoInput = document.getElementById('peso');
  const preparoInput = document.getElementById('preparo-datetime');
  const enderecoInput = document.getElementById('endereco');
  const bairroInput = document.getElementById('bairro');
  const descricaoInput = document.getElementById('descricao');
  const porcoesInput = document.getElementById('porcoes');
  const submitBtn = document.getElementById('btn-publicar');

  // --- Listener de tipo de alimento (RN-05) ---
  tipoSelect.addEventListener('change', () => {
    const tipo = tipoSelect.value;
    const exigeFrio = tipo === 'frio' || tipo === 'congelado';
    const bloqueado = sanitarioVencido && tipo !== 'nao_perecivel';

    // Mostra alerta de validade sanitária vencida
    if (sanitarioVencido && tipo !== 'nao_perecivel') {
      alertaSanitario.mostrar(
        `Seu cadastro sanitário venceu em ${formatarData(doador.cadastro_sanitario_validade)}. ` +
        'Você só pode ofertar alimento não perecível.'
      );
      submitBtn.disabled = true;
    } else {
      alertaSanitario.esconder();
      submitBtn.disabled = false;
    }

    // Alerta de cadeia de frio (RN-03/RN-04)
    if (exigeFrio) {
      alertaSanitario.mostrar(
        'Este alimento exige cadeia de frio. A instituição e o voluntário precisam estar preparados.',
        'info'
      );
    }
  });

  // --- Submit ---
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const tipo = tipoSelect.value;
    const titulo = tituloInput.value.trim();
    const peso = parseFloat(pesoInput.value);
    const dataPreparo = preparoInput.value;

    // Validações básicas
    if (!titulo || titulo.length < 3) {
      mostrarAlerta('warn', 'O título deve ter pelo menos 3 caracteres.');
      return;
    }
    if (isNaN(peso) || peso <= 0 || peso > 5000) {
      mostrarAlerta('warn', 'A quantidade em kg deve estar entre 0,01 e 5.000.');
      return;
    }
    if (!dataPreparo) {
      mostrarAlerta('warn', 'Informe a data e hora do preparo.');
      return;
    }

    // RN-05: checagem final antes de enviar
    if (sanitarioVencido && tipo !== 'nao_perecivel') {
      mostrarAlerta('danger',
        'Cadastro sanitário vencido. Você só pode ofertar não perecível (RN-05).'
      );
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Publicando...';

    // --- Chamada à RPC criar_oferta ---
    // Os prazos (RN-01/RN-08) são calculados AUTOMATICAMENTE no banco
    // pela trigger fn_oferta_setar_prazos(). O front-end não calcula.
    const { data, error } = await supabase.rpc('criar_oferta', {
      p_titulo: titulo,
      p_tipo: tipo,                    // ENUM: preparado | nao_perecivel | frio | congelado
      p_quantidade_kg: peso,
      p_data_preparo: dataPreparo,     // ISO string
      p_endereco_coleta: enderecoInput.value.trim(),
      p_bairro_coleta: bairroInput.value.trim() || null,
      p_descricao: descricaoInput.value.trim() || null,
      p_porcoes: parseInt(porcoesInput.value) || null,
      p_observacoes: null,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Publicar oferta';

    if (error) {
      // Mensagens amigáveis conforme a RN que foi violada
      if (error.message.includes('cadastro sanitario')) {
        mostrarAlerta('danger', error.message);
      } else if (error.message.includes('futuro')) {
        mostrarAlerta('warn', 'A data de preparo não pode estar no futuro.');
      } else {
        mostrarAlerta('danger', `Erro ao publicar: ${error.message}`);
      }
      return;
    }

    // Sucesso → redireciona para o feed
    mostrarAlerta('info', 'Oferta publicada com sucesso! Redirecionando...');
    setTimeout(() => {
      window.location.href = 'ofertas.html';
    }, 1500);
  });
});

// --- Utilitários ---

/**
 * Formata uma data para exibição brasileira.
 */
function formatarData(dataISO) {
  if (!dataISO) return '';
  const d = new Date(dataISO);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Gerencia o bloco de alerta de cadastro sanitário.
 * Reutiliza as classes .alert do CSS existente.
 */
class SanitarioAlert {
  constructor(vencido) {
    this.vencido = vencido;
    this.el = this.criarElemento();
    if (this.el) {
      const form = document.getElementById('form-publicar');
      if (form) form.parentNode.insertBefore(this.el, form);
    }
    this.esconder();
  }

  criarElemento() {
    const div = document.createElement('div');
    div.className = 'alert alert-warn';
    div.id = 'alerta-sanitario';
    div.style.display = 'none';
    div.innerHTML = '<span>⚠️</span><div></div>';
    return div;
  }

  mostrar(mensagem, tipo = 'warn') {
    if (!this.el) return;
    this.el.className = tipo === 'info' ? 'alert alert-info' : 'alert alert-warn';
    this.el.querySelector('div').innerHTML = `<b>${this.vencido ? 'RN-05' : 'Atenção'}</b>${mensagem}`;
    this.el.style.display = 'flex';
  }

  esconder() {
    if (this.el) this.el.style.display = 'none';
  }
}
