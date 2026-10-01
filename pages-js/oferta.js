/**
 * oferta.js — Tela de acompanhamento de uma oferta específica
 * ====================================================================
 * Mostra o ciclo de vida (timeline), o histórico de status e permite
 * avançar o ciclo conforme as regras de negócio.
 *
 * RNs envolvidas:
 *   RN-01 — prazos exibidos; validação de validade
 *   RN-02 — oferta expirada/descartada mostra motivo
 *   RN-03 — instituição sem frio não pode aceitar oferta de frio
 *   RN-04 — voluntário sem caixa térmica não pode assumir oferta de frio
 *   RN-05 — validado no momento da publicação (criar_oferta)
 *   RN-06 — equidade já aplicada no feed
 *   RN-07 — confirmação só pela instituição dona da oferta
 *   RN-08 — congelado = 48h
 *
 * Ciclo: publicada → aceita → coletada → entregue → confirmada
 */

import supabase, { getUserProfile, redirectIfNotAuthenticated, mostrarAlerta } from './supabase.js';

// Estados do ciclo em ordem (para timeline visual)
const CICLO_STATUS = [
  { status: 'publicada', label: 'Publicada', icon: '📢', cor: '#7C5CE0' },
  { status: 'aceita', label: 'Aceita', icon: '✅', cor: '#3B82F6' },
  { status: 'coletada', label: 'Coletada', icon: '🚚', cor: '#F59E0B' },
  { status: 'entregue', label: 'Entregue', icon: '🏠', cor: '#10B981' },
  { status: 'confirmada', label: 'Confirmada', icon: '✓✓', cor: '#16A34A' },
];

// Estados finais (não avançam mais)
const ESTADOS_FINAIS = ['confirmada', 'expirada', 'descartada', 'cancelada'];

let ofertaId = null;
let profile = null;     // perfil do usuário logado
let oferta = null;      // a oferta completa carregada

document.addEventListener('DOMContentLoaded', async () => {
  // --- Proteção de rota ---
  const session = await redirectIfNotAuthenticated();
  if (!session) return;

  // --- Lê o ID da oferta da query string ---
  const params = new URLSearchParams(window.location.search);
  ofertaId = params.get('id');

  if (!ofertaId) {
    mostrarAlerta('warn', 'Oferta não especificada.');
    window.location.href = 'ofertas.html';
    return;
  }

  // --- Carrega perfil do usuário ---
  profile = await getUserProfile();
  if (!profile) {
    window.location.href = 'login.html';
    return;
  }

  // --- Carrega a oferta + histórico ---
  await carregarOferta();
});

/**
 * Carrega a oferta e seu histórico de status da API.
 */
async function carregarOferta() {
  // Busca a oferta (com dados relacionados via view)
  const { data: ofertaData, error: eOferta } = await supabase
    .from('vw_ofertas_feed')
    .select('*')
    .eq('id', ofertaId)
    .single();

  if (eOferta || !ofertaData) {
    mostrarAlerta('danger', `Oferta não encontrada: ${eOferta?.message || 'id inválido'}`);
    window.location.href = 'ofertas.html';
    return;
  }

  oferta = ofertaData;

  // Busca o histórico de status (timeline)
  const { data: historico, error: eHistorico } = await supabase
    .from('oferta_historico')
    .select('*')
    .eq('oferta_id', ofertaId)
    .order('criado_em', { ascending: true });

  document.title = `Oferta: ${oferta.titulo} — Sobra Zero`;

  renderizarTimeline(historico || [], oferta);
  renderizarAcoes(oferta, profile);
}

/**
 * Renderiza a timeline de status da oferta.
 * Cada chip mostra: status, data/hora, ator e comentário.
 */
function renderizarTimeline(historico, oferta) {
  const container = document.getElementById('timeline-oferta');
  if (!container) return;

  // Encontra a posição do status atual no ciclo
  const statusAtualIndex = CICLO_STATUS.findIndex(s => s.status === oferta.status);

  // Header: chips com os estágios
  const chipsHtml = CICLO_STATUS.map((etapa, idx) => {
    const ativo = idx <= statusAtualIndex;
    const cor = etapa.cor;
    const isFinal = oferta.status && ESTADOS_FINAIS.includes(oferta.status);
    return `
      <div class="chip ${ativo ? 'chip-ativo' : ''}" style="
        ${ativo ? `background:${cor}20; color:${cor}; border-color:${cor}80` : ''}
      ">
        <span style="font-size:1rem">${etapa.icon}</span> ${etapa.label}
      </div>
    `;
  }).join('');

  // Linha do tempo dos eventos do histórico
  const eventosHtml = historico.map(h => {
    const etapa = CICLO_STATUS.find(s => s.status === h.status_novo);
    const avatar = h.ator_tipo === 'doador' ? '🍳' :
                   h.ator_tipo === 'instituicao' ? '🏢' :
                   h.ator_tipo === 'voluntario' ? '🚚' : '🤖';
    const dataHora = formatarDateTime(h.criado_em);
    const comentario = h.comentario ? `<div class="comentario">${h.comentario}</div>` : '';

    return `
      <div class="evento-timeline">
        <span class="avatar">${avatar}</span>
        <div class="evento-detalhe">
          <strong>${etapa?.label || h.status_novo}</strong>
          <span class="data">${dataHora}</span>
          ${comentario}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="chips">${chipsHtml}</div>
    <div class="timeline-eventos">
      ${historico.length > 0 ? eventosHtml : '<p style="color:var(--muted)">Nenhum evento registrado ainda.</p>'}
    </div>
  `;
}

/**
 * Renderiza os botões de ação disponíveis conforme o status da oferta
 * e o perfil do usuário logado.
 *
 * RN-chave: RN-03, RN-04, RN-06, RN-07
 */
function renderizarAcoes(oferta, profile) {
  const container = document.getElementById('acoes-oferta');
  if (!container) return;

  // Se for estado final, não mostra ações
  if (ESTADOS_FINAIS.includes(oferta.status)) {
    let msg = '';
    if (oferta.status === 'confirmada') {
      msg = '✅ Doação confirmada e concluída. Obrigado!';
    } else if (oferta.status === 'expirada') {
      msg = `⏰ Oferta expirada. Motivo: ${oferta.motivo_descarte || 'Prazo ultrapassado.'}`;
    } else if (oferta.status === 'cancelada') {
      msg = '🚫 Oferta cancelada.';
    }
    container.innerHTML = `<div class="alert alert-info" style="margin:0"><span>ℹ️</span><div>${msg}</div></div>`;
    return;
  }

  const botoes = [];
  const tipo = profile.user_type;
  const exigeFrio = oferta.exige_frio;

  // --- RN-07: Instituição que aceitou pode avançar a "coletada" ---
  // (normalmente o voluntário faz, mas a instituição também pode avançar)
  if (oferta.status === 'publicada' && tipo === 'instituicao') {
    // RN-03: verifica refrigeração
    const instituicao = profile.detalhe;
    if (exigeFrio && !instituicao.tem_refrigeracao) {
      botoes.push(`<button class="btn btn-disabled" disabled>
        ❌ Você não tem refrigeração — não pode aceitar ofertas de frio (RN-03)
      </button>`);
    } else {
      botoes.push(`<button class="btn btn-primary" onclick="aceitarOferta()">
        ✅ Aceitar oferta
      </button>`);
    }
  }

  // --- RN-04: Voluntário assume transporte ---
  if (oferta.status === 'publicada' && tipo === 'voluntario') {
    const voluntario = profile.detalhe;
    if (exigeFrio && !voluntario.tem_caixa_termica) {
      botoes.push(`<button class="btn btn-disabled" disabled>
        ❌ Você não tem caixa térmica — não pode transportar alimentos de frio (RN-04)
      </button>`);
    } else {
      botoes.push(`<button class="btn btn-primary" onclick="assumirTransporte()">
        🚚 Assumir transporte
      </button>`);
    }
  }

  // --- Coletada (voluntário que assumiu) ---
  if (oferta.status === 'aceita' && tipo === 'voluntario' &&
      oferta.voluntario_id && oferta.voluntario_nome) {
    botoes.push(`<button class="btn btn-primary" onclick="avancarColetada()">
      📦 Registrar coleta
    </button>`);
  }

  // --- Entregue (voluntário que assumiu) ---
  if (oferta.status === 'coletada' && tipo === 'voluntario' &&
      oferta.voluntario_id && oferta.voluntario_nome) {
    botoes.push(`<button class="btn btn-primary" onclick="avancarEntregue()">
      🏠 Registrar entrega
    </button>`);
  }

  // --- Confirmada (RN-07: só instituição dona confirma) ---
  if (oferta.status === 'entregue' && tipo === 'instituicao') {
    botoes.push(`<button class="btn btn-primary" onclick="abrirConfirmar()">
      ✓✓ Confirmar recebimento
    </button>`);
  }

  // --- Cancelar (doador ou instituição dona) ---
  const podeCancelar =
    (tipo === 'doador' && oferta.doador_id === profile.detalhe?.id) ||
    (tipo === 'instituicao' && oferta.instituicao_id);
  if (podeCancelar && !ESTADOS_FINAIS.includes(oferta.status)) {
    botoes.push(`<button class="btn btn-ghost" onclick="cancelarOferta()">
      🚫 Cancelar oferta
    </button>`);
  }

  if (botoes.length === 0) {
    botoes.push(`<div class="alert alert-info" style="margin:0">
      <span>ℹ️</span><div>${tipo === 'voluntario' ? 'Aguardando instituição aceitar esta oferta.' :
        'Aguardando um voluntário assumir o transporte.'}</div>
    </div>`);
  }

  container.innerHTML = botoes.join('');
}

// ====================================================================
// AÇÕES DO VOLUNTÁRIO / INSTITUIÇÃO
// ====================================================================

/**
 * Instituição aceita a oferta (RN-03).
 * Usa a RPC aceitar_oferta, que valida refrigeração no banco.
 */
window.aceitarOferta = async function () {
  if (!confirm('Aceitar esta oferta? Ela será atribuída para transporte.')) return;

  const { data, error } = await supabase.rpc('aceitar_oferta', {
    p_oferta_id: ofertaId,
  });

  if (error) {
    mostrarAlerta('danger', `Não foi possível aceitar: ${error.message}`);
    return;
  }

  mostrarAlerta('info', 'Oferta aceita com sucesso!');
  await carregarOferta(); // recarrega para atualizar timeline
};

/**
 * Voluntário assume o transporte (RN-04).
 * A RPC pode_assumir valida caixa térmica no banco.
 */
window.assumirTransporte = async function () {
  const { data, error } = await supabase.rpc('assumir_transporte', {
    p_oferta_id: ofertaId,
  });

  if (error) {
    mostrarAlerta('danger', `Não foi possível assumir: ${error.message}`);
    return;
  }

  mostrarAlerta('info', 'Transporte assumido! Registre a coleta quando for buscar.');
  await carregarOferta();
};

/**
 * Voluntário registra a coleta.
 */
window.avancarColetada = async function () {
  await avancarStatus('coletada');
};

/**
 * Voluntário registra a entrega.
 * Só pode se a oferta ainda está dentro do prazo (RN-01).
 */
window.avancarEntregue = async function () {
  await avancarStatus('entregue');
};

/**
 * Avança o status da oferta via RPC avancar_status.
 */
async function avancarStatus(destino, comentario = null) {
  const { data, error } = await supabase.rpc('avancar_status', {
    p_oferta_id: ofertaId,
    p_destino: destino,
    p_comentario: comentario,
  });

  if (error) {
    mostrarAlerta('danger', `Não foi possível avançar: ${error.message}`);
    return;
  }

  mostrarAlerta('info', `Status atualizado para: ${destino}`);
  await carregarOferta();
}

/**
 * Abre modal para confirmar o recebimento (RN-07).
 * A instituição deve informar a quantidade recebida.
 */
window.abrirConfirmar = function () {
  const modal = `
    <div class="modal-backdrop" style="
      position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex;
      align-items:center; justify-content:center; z-index:9999
    ">
      <div class="card" style="max-width:420px; width:90%">
        <h3>Confirmar recebimento (RN-07)</h3>
        <p style="color:var(--muted); margin:1rem 0">
          Informe a quantidade efetivamente recebida em kg:
        </p>
        <div class="field">
          <label for="kg-recebido">Peso recebido (kg)</label>
          <input type="number" id="kg-recebido" step="0.01" min="0.1"
                 placeholder="ex.: 7.8" style="width:100%">
        </div>
        <div class="field">
          <label for="obs-recebido">Observações (opcional)</label>
          <textarea id="obs-recebido" placeholder="Estado do alimento, condições..."
                    style="width:100%; min-height:80px"></textarea>
        </div>
        <div style="display:flex; gap:.7rem; margin-top:1.2rem">
          <button class="btn btn-primary" style="flex:1" onclick="confirmarRecebimento()">Confirmar</button>
          <button class="btn btn-ghost" style="flex:1" onclick="fecharModalRecebimento()">Cancelar</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modal);
};

window.fecharModalRecebimento = function () {
  const modal = document.querySelector('.modal-backdrop');
  if (modal) modal.remove();
};

window.confirmarRecebimento = async function () {
  const kgInput = document.getElementById('kg-recebido');
  const obsInput = document.getElementById('obs-recebido');
  const kg = parseFloat(kgInput?.value);

  if (isNaN(kg) || kg <= 0) {
    mostrarAlerta('warn', 'Informe uma quantidade válida em kg.');
    kgInput?.focus();
    return;
  }

  const { data, error } = await supabase.rpc('confirmar_recebimento', {
    p_oferta_id: ofertaId,
    p_quantidade_recebida_kg: kg,
    p_observacoes: obsInput?.value?.trim() || null,
  });

  if (error) {
    mostrarAlerta('danger', `Erro ao confirmar: ${error.message}`);
    return;
  }

  window.fecharModalRecebimento();
  mostrarAlerta('info', 'Recebimento confirmado! Doação concluída. 🎉');
  await carregarOferta();
};

/**
 * Cancela uma oferta (doador ou instituição dona).
 */
window.cancelarOferta = async function () {
  const motivo = prompt('Informe um motivo para o cancelamento:');
  if (motivo === null) return;

  await avancarStatus('cancelada', motivo || 'Cancelada pelo usuário');
};

// ====================================================================
// UTILITÁRIOS
// ====================================================================

/**
 * Formata datetime para exibição brasileira.
 */
function formatarDateTime(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
