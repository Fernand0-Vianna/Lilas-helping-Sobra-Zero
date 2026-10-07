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
import { getUserProfile, redirectIfNotAuthenticated, mostrarAlerta, mostrarPopup, fecharPopup } from './supabase.js';

// Perfil logado (para saber quais ofertas são minhas)
let perfilLogado = null;

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
  perfilLogado = profile;

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
}

/**
 * Cria o HTML de um card de oferta seguindo o guia de estilo
 * (design/desktop/guia_de_estilo.html §7 Card, §5 Chips, §3 Botões, §6 Alertas).
 *
 * Estrutura: card-top (chip de status + prazo) → h3 → meta → tags →
 * box de detalhes → alerta de frio (RN-03/RN-04) → botões.
 *
 * @param {object} o - oferta do vw_ofertas_feed
 * @returns {string} HTML do card
 */
function criarCardOferta(o) {
  const rotuloTipo = {
    preparado: 'Preparado',
    nao_perecivel: 'Não perecível',
    frio: 'Frio',
    congelado: 'Congelado',
  }[o.tipo_alimento] || o.tipo_alimento;

  const rotuloStatus = {
    publicada: 'Publicada',
    aceita: 'Aceita',
    coletada: 'Coletada',
    entregue: 'Entregue',
    confirmada: 'Confirmada',
    expirada: 'Expirada',
    descartada: 'Descartada',
    cancelada: 'Cancelada',
  }[o.status] || o.status;

  // Classe do chip de status (§5 Chips)
  const statusClasse = {
    publicada: 'chip-publicada',
    aceita: 'chip-aceita',
    coletada: 'chip-coletada',
    entregue: 'chip-entregue',
    confirmada: 'chip-confirmada',
    expirada: 'chip-expirada',
    descartada: 'chip-cancelada',
    cancelada: 'chip-cancelada',
  }[o.status] || '';

  // Prazo restante no padrão do guia ("Expira em 2h15")
  const agora = new Date();
  const expira = new Date(o.expira_em);
  const diffMs = expira - agora;
  let prazo;
  if (diffMs <= 0) {
    prazo = 'Prazo encerrado';
  } else {
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    prazo = h > 0 ? `Expira em ${h}h${String(m).padStart(2, '0')}` : `Expira em ${m}min`;
  }

  // Linha meta no padrão do guia ("Tatuapé · 8 kg · preparado às 11:30")
  const metaPartes = [
    o.bairro_coleta || o.doador_bairro || null,
    `${formatarKg(o.quantidade_kg)} kg`,
    `${rotuloTipo.toLowerCase()} às ${formatarHora(o.data_preparo)}`,
  ].filter(Boolean);

  // Tags (§7: card-tags)
  const tags = [`<span class="tag">${escaparHtml(rotuloTipo)}</span>`];
  if (o.exige_frio) tags.push('<span class="tag">Exige frio</span>');
  if (o.tipo_alimento === 'congelado') tags.push('<span class="tag">Prazo 48h</span>');
  if (o.porcoes) tags.push(`<span class="tag">${o.porcoes} porções</span>`);

  // Box de detalhes (descrição + coleta + prazos)
  const detalheLinhas = [];
  if (o.descricao) {
    detalheLinhas.push(
      `<div class="detalhe-linha"><span>Descrição</span><p>${escaparHtml(o.descricao)}</p></div>`
    );
  }
  detalheLinhas.push(
    `<div class="detalhe-linha"><span>Coleta</span><p>${escaparHtml(o.endereco_coleta || '—')}</p></div>` +
    `<div class="detalhe-linha"><span>Coletar até</span><p>${formatarDataHora(o.prazo_coleta)}</p></div>` +
    `<div class="detalhe-linha"><span>Entregar até</span><p>${formatarDataHora(o.prazo_entrega)}</p></div>`
  );
  if (o.doador_nome) {
    detalheLinhas.push(
      `<div class="detalhe-linha"><span>Doador</span><p>${escaparHtml(o.doador_nome)}</p></div>`
    );
  }
  const boxDetalhes = `
    <div class="detalhe-box">
      ${detalheLinhas.join('')}
    </div>`;

  // Alerta de cadeia de frio, padrão §6 (sem emoji)
  const alertaFrio = o.exige_frio
    ? `<div class="alert alert-rn02" style="margin:0 0 1rem">
         <strong>Cadeia de frio</strong>
         <p>Este alimento exige refrigeração na instituição (RN-03) e caixa térmica no transporte (RN-04).</p>
       </div>`
    : '';

  // Botão de edição: só o doador dono da oferta vê
  const souDono = perfilLogado?.user_type === 'doador'
    && perfilLogado?.detalhe?.id
    && o.doador_id === perfilLogado.detalhe.id;
  const botaoEditar = souDono
    ? `<button class="btn btn-ghost" style="flex:1" onclick="event.stopPropagation();abrirEdicao('${o.id}')">
         Editar
       </button>`
    : '';

  return `
    <div class="card" data-id="${o.id}">
      <div class="card-top">
        <span class="chip ${statusClasse}">${escaparHtml(rotuloStatus)}</span>
        <span class="card-exp">${prazo}</span>
      </div>
      <h3>${escaparHtml(o.titulo)}</h3>
      <div class="meta">${metaPartes.map(escaparHtml).join(' · ')}</div>
      <div class="card-tags">${tags.join('')}</div>
      ${boxDetalhes}
      ${alertaFrio}
      <div style="display:flex; gap:.6rem">
        <button class="btn btn-secondary" style="flex:2"
                onclick="window.location.href='oferta.html?id=${o.id}'">
          Ver detalhes
        </button>
        ${botaoEditar}
      </div>
    </div>
  `;
}

/**
 * Abre o modal de edição das observações da oferta.
 * Limite do banco (RLS): só a coluna `observacoes` pode ser editada
 * diretamente — título, tipo e quantidade são fixos após publicar.
 */
window.abrirEdicao = async function (ofertaId) {
  const { data: oferta, error } = await supabase
    .from('ofertas')
    .select('id, titulo, observacoes')
    .eq('id', ofertaId)
    .single();

  if (error || !oferta) {
    mostrarPopup('danger', 'Não foi possível carregar',
      'Verifique se você ainda é o doador desta oferta.');
    return;
  }

  fecharPopup();
  const backdrop = document.createElement('div');
  backdrop.id = 'popup-backdrop';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(17,24,39,.5);display:flex;' +
    'align-items:center;justify-content:center;z-index:9999;padding:1rem';
  backdrop.innerHTML =
    '<div role="dialog" aria-modal="true" style="' +
      'max-width:420px;width:100%;background:#fff;border:1px solid #E5E7EB;' +
      'border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(17,24,39,.2);' +
      'font-family:\'IBM Plex Sans\',system-ui,sans-serif;color:#111827;line-height:1.5">' +
      `<h3 style="margin-top:0">Editar oferta</h3>` +
      `<p style="font-size:14px;color:#6B7280">${escaparHtml(oferta.titulo)}</p>` +
      '<div class="field" style="margin:1rem 0">' +
        '<label for="edit-observacoes">Observações</label>' +
        `<textarea id="edit-observacoes" style="width:100%;min-height:90px" placeholder="Ponto de referência, horário preferencial...">${escaparHtml(oferta.observacoes || '')}</textarea>` +
        '<div class="hint">Título, tipo e quantidade são fixos após a publicação.</div>' +
      '</div>' +
      '<div style="display:flex;gap:.6rem">' +
        '<button class="btn btn-primary" style="flex:1" id="edit-salvar" type="button">Salvar</button>' +
        '<button class="btn btn-ghost" style="flex:1" id="edit-cancelar" type="button">Cancelar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(backdrop);

  document.getElementById('edit-cancelar').addEventListener('click', fecharPopup);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) fecharPopup(); });
  document.getElementById('edit-salvar').addEventListener('click', async () => {
    const valor = document.getElementById('edit-observacoes').value.trim() || null;
    const { error: erroSalvar } = await supabase
      .from('ofertas')
      .update({ observacoes: valor })
      .eq('id', ofertaId);

    if (erroSalvar) {
      mostrarPopup('danger', 'Não foi possível salvar', erroSalvar.message);
      return;
    }
    fecharPopup();
    mostrarPopup('info', 'Oferta atualizada', 'Observações salvas com sucesso.');
    await renderizarFeed();
  });
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

// Exporta para uso em outros módulos (ex.: refresh manual)
export { buscarFeedOfertas, renderizarFeed };
