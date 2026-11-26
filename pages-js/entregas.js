/**
 * entregas.js - Tela "Minhas entregas" do voluntário.
 * Mostra as ofertas atribuídas ao voluntário logado com uma linha de
 * progresso no estilo "seu pedido está sendo enviado".
 *
 * RN-07: quem conclui a doação é a instituição, nunca só o voluntário.
 */

import supabase, {
  getUserProfile,
  redirectIfNotAuthenticated,
  preencherNomeTopBar,
} from './supabase.js';
import { icone } from './icons.js';

const ETAPAS = [
  { status: 'aceita', label: 'Coleta confirmada', icon: 'circle-check' },
  { status: 'coletada', label: 'A caminho', icon: 'truck' },
  { status: 'entregue', label: 'Entregue na instituição', icon: 'house' },
  { status: 'confirmada', label: 'Confirmado!', icon: 'check-check' },
];

const INDICE = Object.fromEntries(ETAPAS.map((e, i) => [e.status, i]));

function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatarDataHora(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function mensagemProgresso(status) {
  switch (status) {
    case 'aceita': return 'Sua coleta está confirmada. Retire o alimento no prazo.';
    case 'coletada': return 'Seu pedido está sendo enviado para a instituição.';
    case 'entregue': return 'Entrega registrada. Aguardando a confirmação da instituição.';
    case 'confirmada': return 'Entrega confirmada pela instituição. Doação concluída!';
    default: return 'Aguardando a instituição aceitar esta oferta.';
  }
}

function renderizarProgresso(oferta, historico) {
  const atual = INDICE[oferta.status] ?? -1;
  const etapasHtml = ETAPAS.map((etapa, idx) => {
    const concluida = idx <= atual;
    const atualEtapa = idx === atual;
    return `
      <div class="progress-step ${concluida ? 'is-done' : ''} ${atualEtapa ? 'is-current' : ''}">
        <span class="progress-dot">${concluida ? icone('check') : icone(etapa.icon)}</span>
        <span class="progress-label">${escaparHtml(etapa.label)}</span>
      </div>
    `;
  }).join('');

  const ultimoEvento = historico.length
    ? historico[historico.length - 1]
    : null;
  const atualizado = ultimoEvento?.criado_em || oferta.atualizado_em;

  const eventosHtml = historico.slice().reverse().map((h) => `
    <li class="entrega-evento">
      <span>${icone(h.ator_tipo === 'voluntario' ? 'truck' : h.ator_tipo === 'doador' ? 'chef-hat' : 'building-2')}</span>
      <div>
        <strong>${escaparHtml(h.status_novo)}</strong>
        <time>${formatarDataHora(h.criado_em)}</time>
        ${h.comentario ? `<p>${escaparHtml(h.comentario)}</p>` : ''}
      </div>
    </li>
  `).join('');

  return `
    <article class="card entrega-card">
      <div class="entrega-topo">
        <div>
          <span class="kicker">Entrega · ${escaparHtml(oferta.status)}</span>
          <h2>${escaparHtml(oferta.titulo)}</h2>
          <p class="entrega-sub">${escaparHtml(oferta.descricao || '')}</p>
        </div>
        <span class="chip chip-${escaparHtml(oferta.status)}">${escaparHtml(oferta.status)}</span>
      </div>

      <div class="entrega-mensagem">
        <span data-icon="truck" data-size="20"></span>
        <div>
          <strong>${escaparHtml(mensagemProgresso(oferta.status))}</strong>
          <small>Atualizado em ${formatarDataHora(atualizado)}</small>
        </div>
      </div>

      <div class="progress-track" role="list" aria-label="Progresso da entrega">
        ${etapasHtml}
      </div>

      <div class="entrega-info">
        <div><span>Retirada</span><strong>${escaparHtml(oferta.endereco_coleta || '-')}</strong></div>
        <div><span>Doador</span><strong>${escaparHtml(oferta.doador_nome || '-')}</strong></div>
        <div><span>Destino</span><strong>${escaparHtml(oferta.instituicao_nome || 'A definir')}</strong></div>
        <div><span>Quantidade</span><strong>${oferta.quantidade_kg} kg · ${oferta.porcoes ?? '-'} porções</strong></div>
      </div>

      <details class="entrega-historico">
        <summary>Ver histórico da entrega</summary>
        <ul class="entrega-eventos">
          ${eventosHtml || '<li>Nenhum evento registrado.</li>'}
        </ul>
      </details>

      <a class="btn btn-ghost" href="oferta.html?id=${escaparHtml(oferta.id)}">Ver detalhes da oferta</a>
    </article>
  `;
}

async function carregarEntregas() {
  const container = document.getElementById('lista-entregas');
  if (!container) return;

  const { data: ofertas, error } = await supabase
    .from('vw_ofertas_feed')
    .select('*')
    .not('voluntario_id', 'is', null)
    .in('status', ['aceita', 'coletada', 'entregue', 'confirmada'])
    .order('criado_em', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="card"><p style="color:var(--danger)">Não foi possível carregar as entregas: ${escaparHtml(error.message)}</p></div>`;
    return;
  }

  if (!ofertas?.length) {
    container.innerHTML = `
      <div class="card">
        <h2>Você ainda não tem entregas</h2>
        <p style="color:var(--muted)">Assuma uma coleta no <a href="voluntario.html">feed do voluntário</a> para acompanhar o progresso por aqui.</p>
      </div>
    `;
    return;
  }

  const historicos = await Promise.all(ofertas.map(async (oferta) => {
    const { data } = await supabase
      .from('oferta_historico')
      .select('*')
      .eq('oferta_id', oferta.id)
      .order('criado_em', { ascending: true });
    return data || [];
  }));

  container.innerHTML = ofertas
    .map((oferta, i) => renderizarProgresso(oferta, historicos[i]))
    .join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await redirectIfNotAuthenticated();
  if (!session) return;

  const profile = await getUserProfile();
  preencherNomeTopBar(profile);
  await carregarEntregas();
});
