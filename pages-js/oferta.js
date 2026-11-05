/**
 * oferta.js-Tela de acompanhamento de uma oferta específica
 * ====================================================================
 * Mostra o ciclo de vida (timeline), o histórico de status e permite
 * avançar o ciclo conforme as regras de negócio.
 *
 * RNs envolvidas:
 *   RN-01-prazos exibidos; validação de validade
 *   RN-02-oferta expirada/descartada mostra motivo
 *   RN-03-instituição sem frio não pode aceitar oferta de frio
 *   RN-04-voluntário sem caixa térmica não pode assumir oferta de frio
 *   RN-05-validado no momento da publicação (criar_oferta)
 *   RN-06-equidade já aplicada no feed
 *   RN-07-confirmação só pela instituição dona da oferta
 *   RN-08-congelado = 48h
 *
 * Ciclo: publicada → aceita → coletada → entregue → confirmada
 */

import supabase, { getUserProfile, redirectIfNotAuthenticated, mostrarPopup, papelEfetivo, vinculoDe, renderPapelSwitcher } from './supabase.js';
import { icone } from './icons.js';

// Estados do ciclo em ordem (para timeline visual)
const CICLO_STATUS = [
  { status: 'publicada', label: 'Publicada', icon: 'megaphone' },
  { status: 'aceita', label: 'Aceita', icon: 'circle-check' },
  { status: 'coletada', label: 'Coletada', icon: 'truck' },
  { status: 'entregue', label: 'Entregue', icon: 'house' },
  { status: 'confirmada', label: 'Confirmada', icon: 'check-check' },
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
    mostrarPopup('warn', 'Oferta não especificada', 'Volte ao feed e escolha uma oferta.');
    window.location.href = 'ofertas.html';
    return;
  }

  // --- Carrega perfil do usuário ---
  profile = await getUserProfile();
  if (!profile) {
    window.location.href = 'login.html';
    return;
  }

  // --- Switcher de papel (só renderiza para admin) ---
  renderPapelSwitcher(profile);

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
    mostrarPopup('danger', 'Oferta não encontrada', eOferta?.message || 'ID inválido.');
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

  document.title = `Oferta: ${oferta.titulo}-Sobra Zero`;

  renderizarResumo(oferta);
  renderizarTimeline(historico || [], oferta);
  renderizarAcoes(oferta, profile);
}

/**
 * Renderiza o resumo/detalhes da oferta publicada.
 * Mostra status, prazo, tipo, quantidade, prazos, doador e endereço.
 */
function renderizarResumo(oferta) {
  const container = document.getElementById('oferta-resumo');
  if (!container) return;

  const tipo = oferta.tipo_alimento;
  const rotuloTipo = {
    preparado: 'Preparado',
    nao_perecivel: 'Não perecível',
    frio: 'Frio',
    congelado: 'Congelado',
  }[tipo] || tipo;

  const rotuloStatus = {
    publicada: 'Publicada',
    aceita: 'Aceita',
    coletada: 'Coletada',
    entregue: 'Entregue',
    confirmada: 'Confirmada',
    expirada: 'Expirada',
    descartada: 'Descartada',
    cancelada: 'Cancelada',
  }[oferta.status] || oferta.status;

  const statusClasse = {
    publicada: 'chip-publicada',
    aceita: 'chip-aceita',
    coletada: 'chip-coletada',
    entregue: 'chip-entregue',
    confirmada: 'chip-confirmada',
    expirada: 'chip-expirada',
    descartada: 'chip-cancelada',
    cancelada: 'chip-cancelada',
  }[oferta.status] || '';

  const statusIcone = {
    publicada: 'megaphone',
    aceita: 'circle-check',
    coletada: 'truck',
    entregue: 'house',
    confirmada: 'check-check',
    expirada: 'clock',
    descartada: 'alert-triangle',
    cancelada: 'ban',
  }[oferta.status] || 'info';

  const metaPartes = [];
  const bairro = oferta.bairro_coleta || oferta.doador_bairro;
  if (bairro) metaPartes.push({ nome: 'map-pin', texto: bairro });
  metaPartes.push({ nome: 'weight', texto: `${formatarKg(oferta.quantidade_kg)} kg` });
  if (oferta.data_preparo) {
    metaPartes.push({ nome: 'clock', texto: `${rotuloTipo.toLowerCase()} às ${formatarHora(oferta.data_preparo)}` });
  }

  const tags = [`<span class="tag">${escaparHtml(rotuloTipo)}</span>`];
  if (oferta.exige_frio) tags.push('<span class="tag">Exige frio</span>');
  if (tipo === 'congelado') tags.push('<span class="tag">Prazo 48h</span>');
  if (oferta.porcoes) tags.push(`<span class="tag">${oferta.porcoes} porções</span>`);

  const itens = [
    ['Quantidade', 'weight', `${formatarKg(oferta.quantidade_kg)} kg`],
    ['Coletar até', 'clock', formatarDataHora(oferta.prazo_coleta)],
    ['Entregar até', 'route', formatarDataHora(oferta.prazo_entrega)],
    ['Doador', 'chef-hat', oferta.doador_nome],
    ['Instituição', 'building-2', oferta.instituicao_nome],
    ['Voluntário', 'truck', oferta.voluntario_nome],
  ].filter(([, , valor]) => valor);

  const detalhes = itens.map(([rotulo, nomeIcone, valor]) => `
    <div class="detail-item">
      <span>${icone(nomeIcone)} ${escaparHtml(rotulo)}</span>
      <strong>${escaparHtml(valor)}</strong>
    </div>
  `).join('');

  const blocoTexto = (rotulo, valor) => valor
    ? `<div class="detail-block">
         <span>${escaparHtml(rotulo)}</span>
         <p>${escaparHtml(valor)}</p>
       </div>`
    : '';

  const motivo = oferta.motivo_descarte
    ? `<div class="alert alert-rn02" style="margin-top:1rem">
         <strong>${icone('alert-triangle')} Motivo do encerramento</strong>
         <p>${escaparHtml(oferta.motivo_descarte)}</p>
       </div>`
    : '';

  const alertaFrio = oferta.exige_frio
    ? `<div class="alert alert-rn02" style="margin-top:1rem">
         <strong>${icone('snowflake')} Cadeia de frio</strong>
         <p>Este alimento exige refrigeração na instituição (RN-03) e caixa térmica no transporte (RN-04).</p>
       </div>`
    : '';

  container.innerHTML = `
    <article class="card card-detalhe" data-status="${escaparHtml(oferta.status)}">
      <div class="card-rail">
        <span class="chip ${statusClasse}">${icone(statusIcone)} ${escaparHtml(rotuloStatus)}</span>
        <span class="card-exp">${icone('clock')} ${escaparHtml(descreverPrazo(oferta))}</span>
      </div>
      <div class="card-main">
        <h1 id="oferta-titulo">${escaparHtml(oferta.titulo)}</h1>
        <div class="meta">${metaPartes.map((m) => `<span>${icone(m.nome)} ${escaparHtml(m.texto)}</span>`).join('')}</div>
        <div class="card-tags">${tags.join('')}</div>
        <div class="detail-grid">${detalhes}</div>
        ${blocoTexto('Endereço de coleta', oferta.endereco_coleta)}
        ${blocoTexto('Descrição', oferta.descricao)}
        ${blocoTexto('Observações', oferta.observacoes)}
        ${motivo}
        ${alertaFrio}
      </div>
    </article>
  `;
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
    return `
      <div class="chip chip-${etapa.status} ${ativo ? '' : 'is-futuro'}">
        ${icone(etapa.icon)} ${etapa.label}
      </div>
    `;
  }).join('');

  // Linha do tempo dos eventos do histórico
  const eventosHtml = historico.map(h => {
    const etapa = CICLO_STATUS.find(s => s.status === h.status_novo);
    const avatar = {
      doador: 'chef-hat',
      instituicao: 'building-2',
      voluntario: 'truck',
    }[h.ator_tipo] || 'bot';
    const dataHora = formatarDateTime(h.criado_em);
    const comentario = h.comentario
      ? `<div class="comentario">${escaparHtml(h.comentario)}</div>`
      : '';

    return `
      <div class="evento-timeline">
        <span class="avatar">${icone(avatar)}</span>
        <div class="evento-detalhe">
          <strong>${escaparHtml(etapa?.label || h.status_novo)}</strong>
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
    let nomeIcone = 'info';
    let classe = 'alert-info';
    if (oferta.status === 'confirmada') {
      msg = 'Doação confirmada e concluída. Obrigado!';
      nomeIcone = 'circle-check';
      classe = 'alert-success';
    } else if (oferta.status === 'expirada') {
      msg = `Oferta expirada. Motivo: ${oferta.motivo_descarte || 'Prazo ultrapassado.'}`;
      nomeIcone = 'clock';
      classe = 'alert-warn';
    } else if (oferta.status === 'descartada') {
      msg = `Oferta descartada. Motivo: ${oferta.motivo_descarte || 'Não informado.'}`;
      nomeIcone = 'alert-triangle';
      classe = 'alert-danger';
    } else if (oferta.status === 'cancelada') {
      msg = 'Oferta cancelada.';
      nomeIcone = 'ban';
      classe = 'alert-danger';
    }
    container.innerHTML =
      `<div class="alert ${classe}" style="margin:0">${icone(nomeIcone)}<div>${escaparHtml(msg)}</div></div>`;
    return;
  }

  const botoes = [];
  const tipo = papelEfetivo(profile);
  const exigeFrio = oferta.exige_frio;

  // --- RN-03: Instituição aceita a oferta publicada ---
  // (usa a RPC aceitar_oferta, que valida refrigeração no banco)
  if (oferta.status === 'publicada' && tipo === 'instituicao') {
    // RN-03: verifica refrigeração (sem vínculo: orienta a completar o perfil)
    const instituicao = vinculoDe(profile, 'instituicao');
    if (!instituicao) {
      botoes.push(`<button class="btn btn-disabled" type="button" disabled>
        ${icone('user-round')} Complete seu vínculo de instituição no perfil para aceitar ofertas.
      </button>`);
    } else if (exigeFrio && !instituicao.tem_refrigeracao) {
      botoes.push(`<button class="btn btn-disabled" type="button" disabled>
        ${icone('circle-x')} Você não tem refrigeração-não pode aceitar ofertas de frio (RN-03)
      </button>`);
    } else {
      botoes.push(`<button class="btn btn-primary" type="button" onclick="aceitarOferta()">
        ${icone('circle-check')} Aceitar oferta
      </button>`);
    }
  }

  // --- RN-04: Voluntário assume transporte ---
  if (oferta.status === 'publicada' && tipo === 'voluntario') {
    const voluntario = vinculoDe(profile, 'voluntario');
    if (!voluntario) {
      botoes.push(`<button class="btn btn-disabled" type="button" disabled>
        ${icone('user-round')} Complete seu vínculo de voluntário no perfil para assumir transportes.
      </button>`);
    } else if (exigeFrio && !voluntario.tem_caixa_termica) {
      botoes.push(`<button class="btn btn-disabled" type="button" disabled>
        ${icone('circle-x')} Você não tem caixa térmica-não pode transportar alimentos de frio (RN-04)
      </button>`);
    } else {
      botoes.push(`<button class="btn btn-primary" type="button" onclick="assumirTransporte()">
        ${icone('truck')} Assumir transporte
      </button>`);
    }
  }

  // --- Coletada (voluntário que assumiu) ---
  const vincVol = vinculoDe(profile, 'voluntario');
  if (oferta.status === 'aceita' && tipo === 'voluntario' &&
      vincVol?.id && oferta.voluntario_id === vincVol.id) {
    botoes.push(`<button class="btn btn-primary" type="button" onclick="avancarColetada()">
      ${icone('package')} Registrar coleta
    </button>`);
  }

  // --- Entregue (voluntário que assumiu) ---
  if (oferta.status === 'coletada' && tipo === 'voluntario' &&
      vincVol?.id && oferta.voluntario_id === vincVol.id) {
    botoes.push(`<button class="btn btn-primary" type="button" onclick="avancarEntregue()">
      ${icone('house')} Registrar entrega
    </button>`);
  }

  // --- Confirmada (RN-07: só instituição dona confirma) ---
  const vincInst = vinculoDe(profile, 'instituicao');
  if (oferta.status === 'entregue' && tipo === 'instituicao'
      && vincInst?.id && oferta.instituicao_id === vincInst.id) {
    botoes.push(`<button class="btn btn-primary" type="button" onclick="abrirConfirmar()">
      ${icone('check-check')} Confirmar recebimento
    </button>`);
  }

  // --- Cancelar (doador ou instituição dona) ---
  const podeCancelar =
    (tipo === 'doador' && vinculoDe(profile, 'doador')?.id
      && oferta.doador_id === vinculoDe(profile, 'doador').id) ||
    (tipo === 'instituicao' && vinculoDe(profile, 'instituicao')?.id
      && oferta.instituicao_id === vinculoDe(profile, 'instituicao').id);
  if (podeCancelar && !ESTADOS_FINAIS.includes(oferta.status)) {
    botoes.push(`<button class="btn btn-ghost" type="button" onclick="cancelarOferta()">
      ${icone('ban')} Cancelar oferta
    </button>`);
  }

  if (botoes.length === 0) {
    botoes.push(`<div class="alert alert-info" style="margin:0">
      ${icone('info')}<div>${tipo === 'voluntario' ? 'Aguardando instituição aceitar esta oferta.' :
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
    mostrarPopup('danger', 'Não foi possível aceitar', error.message);
    return;
  }

  mostrarPopup('info', 'Oferta aceita', 'Oferta aceita com sucesso!');
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
    mostrarPopup('danger', 'Não foi possível assumir', error.message);
    return;
  }

  mostrarPopup('info', 'Transporte assumido', 'Transporte assumido! Registre a coleta quando for buscar.');
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
    mostrarPopup('danger', 'Não foi possível avançar', error.message);
    return;
  }

  mostrarPopup('info', 'Status atualizado', `Status atualizado para: ${destino}`);
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
    mostrarPopup('warn', 'Quantidade inválida', 'Informe uma quantidade válida em kg.');
    kgInput?.focus();
    return;
  }

  const { data, error } = await supabase.rpc('confirmar_recebimento', {
    p_oferta_id: ofertaId,
    p_quantidade_recebida_kg: kg,
    p_observacoes: obsInput?.value?.trim() || null,
  });

  if (error) {
    mostrarPopup('danger', 'Erro ao confirmar', error.message);
    return;
  }

  window.fecharModalRecebimento();
  mostrarPopup('info', 'Recebimento confirmado', 'Recebimento confirmado! Doação concluída.');
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

function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatarKg(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
}

function formatarHora(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatarDataHora(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Descreve o prazo restante da oferta no padrão do feed ("Expira em 2h15").
 */
function descreverPrazo(oferta) {
  if (ESTADOS_FINAIS.includes(oferta.status)) {
    return oferta.status === 'confirmada' ? 'Doação concluída' : 'Prazo encerrado';
  }
  const expira = new Date(oferta.expira_em);
  const diffMs = expira - new Date();
  if (Number.isNaN(diffMs) || diffMs <= 0) return 'Prazo encerrado';

  const h = Math.floor(diffMs / (1000 * 60 * 60));
  const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return h > 0 ? `Expira em ${h}h${String(m).padStart(2, '0')}` : `Expira em ${m}min`;
}

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
