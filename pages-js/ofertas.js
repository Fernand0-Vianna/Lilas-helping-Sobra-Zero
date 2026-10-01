/**
 * ofertas.js — Feed de ofertas disponíveis
 * ====================================================================
 * Exibe ofertas publicadas, ordenadas por equidade (RN-06),
 * com filtros por tipo de alimento e exigência de frio.
 *
 * RNs envolvidas:
 *   RN-02 — ofertas expiradas saem do feed automaticamente
 *   RN-03 — instituições sem refrigeração veem alerta em ofertas de frio
 *   RN-04 — voluntários sem caixa térmica veem alerta em ofertas de frio
 *   RN-06 — ORDER BY kg_recebidos_30d_prioridade ASC (quem recebeu menos primeiro)
 */

import supabase from './supabase.js';
import { getUserProfile, redirectIfNotAuthenticated, mostrarAlerta } from './supabase.js';

// Estado dos filtros ativos
let filtrosAtivos = {
  tipo: null,       // null = todos, ou 'frio', 'congelado', 'preparado', 'nao_perecivel'
  exigeFrio: null,  // null = todos, true/false
  bairro: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  // --- Proteção de rota ---
  const session = await redirectIfNotAuthenticated();
  if (!session) return;

  // --- Carrega perfil para contexto de perfil ---
  const profile = await getUserProfile();

  // --- Renderiza o feed ---
  await renderizarFeed();

  // --- Event listeners dos filtros ---
  const filtroTipo = document.getElementById('filtro-tipo');
  if (filtroTipo) {
    filtroTipo.addEventListener('change', (e) => {
      filtrosAtivos.tipo = e.target.value || null;
      renderizarFeed();
    });
  }

  const filtroFrio = document.getElementById('filtro-frio');
  if (filtroFrio) {
    filtroFrio.addEventListener('change', (e) => {
      filtrosAtivos.exigeFrio = e.target.value === 'true' ? true : e.target.value === 'false' ? false : null;
      renderizarFeed();
    });
  }

  // Botão de limpar filtros
  const limparBtn = document.getElementById('limpar-filtros');
  if (limparBtn) {
    limparBtn.addEventListener('click', () => {
      filtrosAtivos = { tipo: null, exigeFrio: null, bairro: null };
      filtroTipo.value = '';
      filtroFrio.value = '';
      renderizarFeed();
    });
  }
});

/**
 * Busca ofertas do feed com os filtros ativos.
 * Usa vw_ofertas_feed que já inclui dados do doador e a prioridade de equidade.
 *
 * @returns {Promise<{ofertas: Array, error: object|null}>}
 */
async function buscarFeedOfertas() {
  let query = supabase
    .from('vw_ofertas_feed')
    .select('*')
    // RN-06: ordena pelo kg recebido em 30 dias ASC (quem recebeu menos aparece primeiro)
    .order('kg_recebidos_30d_prioridade', { ascending: true });

  // Filtro por tipo de alimento
  if (filtrosAtivos.tipo) {
    query = query.eq('tipo_alimento', filtrosAtivos.tipo);
  }

  // Filtro por exigência de frio
  if (filtrosAtivos.exigeFrio !== null) {
    query = query.eq('exige_frio', filtrosAtivos.exigeFrio);
  }

  // Filtro por bairro
  if (filtrosAtivos.bairro) {
    query = query.ilike('bairro_coleta', `%${filtrosAtivos.bairro}%`);
  }

  const { data: ofertas, error } = await query;
  return { ofertas, error };
}

/**
 * Renderiza a lista de ofertas no container do feed.
 */
async function renderizarFeed() {
  const container = document.getElementById('feed-ofertas') ||
    document.querySelector('.feed-container');

  if (!container) return;

  const { ofertas, error } = await buscarFeedOfertas();

  if (error) {
    console.error('[ofertas] Erro ao buscar feed:', error.message);
    mostrarAlerta('danger', `Erro ao carregar ofertas: ${error.message}`);
    return;
  }

  if (!ofertas || ofertas.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center; padding:3rem">
        <p style="color:var(--muted)">Nenhuma oferta disponível no momento.</p>
        <p style="font-size:.85rem; color:var(--muted)">
          Novas ofertas aparecem automaticamente conforme odoantes publicam.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = ofertas.map(oferta => criarCardOferta(oferta)).join('');

  // Anexa eventos de clique nos cards
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = `oferta.html?id=${card.dataset.id}`;
    });
  });
}

/**
 * Cria o HTML de um card de oferta usando classes CSS existentes.
 *
 * @param {object} o - oferta do vw_ofertas_feed
 * @returns {string} HTML do card
 */
function criarCardOferta(o) {
  // Calcula tempo restante até expira_em
  const agora = new Date();
  const expira = new Date(o.expira_em);
  const diffMs = expira - agora;
  const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const tempoRestante = `${diffHoras}h${diffMin.toString().padStart(2, '0')}m`;

  // Classe do chip de status
  const statusClasse = {
    publicada: 'chip-publicada',
    aceita: 'chip-aceita',
    coletada: 'chip-coletada',
    entregue: 'chip-entregue',
    confirmada: 'chip-confirmada',
    expirada: 'chip-expirada',
    cancelada: 'chip-cancelada',
  }[o.status] || '';

  // Tags de tipo e frio
  const tags = [];
  tags.push(`<span class="tag">${o.tipo_alimento.replace(/_/g, ' ')}</span>`);
  if (o.exige_frio) tags.push('<span class="tag">Exige frio</span>');
  if (o.tipo_alimento === 'congelado') tags.push('<span class="tag">Congelado (48h)</span>');

  // Alerta de frio para instituições/voluntários sem capacidade (RN-03/RN-04)
  const alertaFrio = (!o.voluntario_nome && o.exige_frio)
    ? `<div class="alert alert-info" style="margin:0; margin-top:.75rem; padding:.5rem .75rem; font-size:.8rem">
         <span>⛈️</span>
         <div>Este alimento exige caixa térmica (RN-03/RN-04).</div>
       </div>`
    : '';

  return `
    <div class="card" data-id="${o.id}" style="cursor:pointer; transition:transform .2s">
      <div class="card-top">
        <span class="chip ${statusClasse}">${o.status}</span>
        <span class="card-exp">Expira em ${tempoRestante}</span>
      </div>
      <h3>${o.titulo}</h3>
      <div class="meta">
        ${o.doador_nome || 'Doador anônimo'} · ${o.quantidade_kg} kg
        ${o.porcoes ? `· ${o.porcoes} porções` : ''}
      </div>
      <div class="card-tags">
        ${tags.join('')}
      </div>
      ${alertaFrio}
      <button class="btn btn-secondary" style="width:100%; margin-top:.75rem"
              onclick="window.location.href='oferta.html?id=${o.id}'">
        Ver detalhes
      </button>
    </div>
  `;
}

// Exporta para uso em outros módulos (ex.: refresh manual)
export { buscarFeedOfertas, renderizarFeed };
