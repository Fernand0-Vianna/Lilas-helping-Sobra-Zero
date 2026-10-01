/**
 * relatorio.js — Tela de relatório e KPIs
 * ====================================================================
 * Popula os cards de KPIs gerais e as tabelas de resumo usando as views
 * do Supabase: vw_kpis_gerais, vw_relatorio_doadores e vw_descartes.
 *
 * Tela associada: 12 (desktop) / M7 (mobile).
 *
 * RNs envolvidas:
 *   RN-02 — métrica de descartes (kg e contagem)
 *   RN-06 — equidade: kg recebidos por instituição em 30 dias
 *   RN-07 — doações concluídas (status confirmada)
 */

import supabase, { getUserProfile, redirectIfNotAuthenticated, mostrarAlerta } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  // --- Proteção de rota ---
  const session = await redirectIfNotAuthenticated();
  if (!session) return;

  // --- Carrega perfil (apenas para mostrar nome do usuário logado) ---
  const profile = await getUserProfile();
  if (profile?.nome) {
    const nomeEl = document.getElementById('usuario-nome');
    if (nomeEl) nomeEl.textContent = profile.nome;
  }

  // --- Carrega todos os dados do relatório ---
  // Executa as 3 queries em paralelo para melhor performance
  await Promise.all([
    carregarKpis(),
    carregarTabelaDoadores(),
    carregarTabelaDescartes(),
  ]);
});

/**
 * Carrega os KPIs gerais (cards 2×2) da view vw_kpis_gerais.
 *
 * Campos: total_ofertas, ofertas_confirmadas, ofertas_descartadas,
 *         kg_distribuidos, instituicoes_ativas, doadores_ativos,
 *         voluntarios_ativos
 */
async function carregarKpis() {
  const { data, error } = await supabase
    .from('vw_kpis_gerais')
    .select('*')
    .single(); // retorna uma única linha

  if (error) {
    console.error('[relatorio] Erro KPIs:', error.message);
    return;
  }

  // Popula os cards — usa IDs baseados no HTML da tela 12
  const kpis = {
    kg_doados: data.kg_distribuidos || 0,
    doacoes_concluidas: data.ofertas_confirmadas || 0,
    instituicoes_atendidas: data.instituicoes_ativas || 0,
    descartes: data.ofertas_descartadas || 0,
    total_ofertas: data.total_ofertas || 0,
    doadores_ativos: data.doadores_ativos || 0,
    voluntarios_ativos: data.voluntarios_ativos || 0,
    gerado_em: data.gerado_em,
  };

  // Formata kg com 1 casa decimal
  const kgEl = document.getElementById('kpi-kg-doados');
  if (kgEl) kgEl.textContent = formatarKg(kpis.kg_doados);

  const doacoesEl = document.getElementById('kpi-doacoes-concluidas');
  if (doacoesEl) doacoesEl.textContent = formatarNumero(kpis.doacoes_concluidas);

  const instituicoesEl = document.getElementById('kpi-instituicoes-atendidas');
  if (instituicoesEl) instituicoesEl.textContent = formatarNumero(kpis.instituicoes_atendidas);

  const descartesEl = document.getElementById('kpi-descartes');
  if (descartesEl) descartesEl.textContent = formatarNumero(kpis.descartes);

  // KPIs extra (se houver elementos)
  const totalEl = document.getElementById('kpi-total-ofertas');
  if (totalEl) totalEl.textContent = formatarNumero(kpis.total_ofertas);

  const doadoresEl = document.getElementById('kpi-doadores-ativos');
  if (doadoresEl) doadoresEl.textContent = formatarNumero(kpis.doadores_ativos);

  const voluntariosEl = document.getElementById('kpi-voluntarios-ativos');
  if (voluntariosEl) voluntariosEl.textContent = formatarNumero(kpis.voluntarios_ativos);

  // Taxa de aproveitamento
  const taxa = kpis.total_ofertas > 0
    ? ((kpis.doacoes_concluidas / kpis.total_ofertas) * 100).toFixed(1)
    : '0';
  const taxaEl = document.getElementById('kpi-taxa-aproveitamento');
  if (taxaEl) taxaEl.textContent = `${taxa}%`;
}

/**
 * Carrega a tabela de doadores (barras horizontais) via vw_relatorio_doadores.
 *
 * Campos: doador, ofertas_total, ofertas_confirmadas, kg_doados,
 *         descartes, kg_descartados
 */
async function carregarTabelaDoadores() {
  const { data: doadores, error } = await supabase
    .from('vw_relatorio_doadores')
    .select('*')
    .order('kg_doados', { ascending: false });

  const container = document.getElementById('tabela-doadores');
  if (!container) return;

  if (error) {
    console.error('[relatorio] Erro doadores:', error.message);
    container.innerHTML = '<p class="alert alert-warn">Erro ao carregar dados.</p>';
    return;
  }

  if (!doadores || doadores.length === 0) {
    container.innerHTML = '<p style="color:var(--muted)">Nenhum doador registrado ainda.</p>';
    return;
  }

  // Tabela com barras de progresso
  container.innerHTML = `
    <table class="relatorio-tabela" style="width:100%; border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left; padding:.75rem">Doador</th>
          <th style="text-align:right; padding:.75rem">Doações</th>
          <th style="text-align:right; padding:.75rem">kg doados</th>
          <th style="text-align:right; padding:.75rem">Descartes</th>
          <th style="text-align:right; padding:.75rem">Aproveitamento</th>
        </tr>
      </thead>
      <tbody>
        ${doadores.map(d => {
          const total = (d.ofertas_total || 0);
          const confirmadas = (d.ofertas_confirmadas || 0);
          const aproveitamento = total > 0 ? ((confirmadas / total) * 100).toFixed(0) : 0;
          const maxKg = Math.max(...doadores.map(x => x.kg_doados || 0));

          return `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:.75rem">
                <div style="display:flex; align-items:center; gap:.5rem">
                  <div class="barra" style="
                    width:40px; height:8px; background:var(--purple);
                    border-radius:4px;
                    width:${Math.max((d.kg_doados / maxKg) * 100, 2)}%;
                    max-width:120px
                  "></div>
                  ${d.doador}
                </div>
              </td>
              <td style="text-align:right; padding:.75rem">${confirmadas}/${total}</td>
              <td style="text-align:right; padding:.75rem">${formatarKg(d.kg_doados || 0)}</td>
              <td style="text-align:right; padding:.75rem">${d.descartes || 0}</td>
              <td style="text-align:right; padding:.75rem">
                <span style="
                  background:${aproveitamento >= 70 ? 'var(--success-bg)' :
                              aproveitamento >= 40 ? 'var(--warning-bg)' : 'var(--danger-bg)'};
                  color:${aproveitamento >= 70 ? 'var(--success-text)' :
                          aproveitamento >= 40 ? 'var(--warning-text)' : '#991B1B'};
                  padding:.15rem .5rem; border-radius:999px; font-size:.8rem
                ">${aproveitamento}%</span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Carrega a tabela de descartes (RN-02) via vw_descartes.
 *
 * Campos: doador, titulo, tipo_alimento, quantidade_kg, status_final,
 *         motivo_descarte, registrado_em
 */
async function carregarTabelaDescartes() {
  const { data: descartes, error } = await supabase
    .from('vw_descartes')
    .select('*')
    .order('registrado_em', { ascending: false })
    .limit(50); // limite para não sobrecarregar

  const container = document.getElementById('tabela-descartes');
  if (!container) return;

  if (error) {
    console.error('[relatorio] Erro descartes:', error.message);
    container.innerHTML = '<p class="alert alert-warn">Erro ao carregar dados.</p>';
    return;
  }

  if (!descartes || descartes.length === 0) {
    container.innerHTML = '<p style="color:var(--muted)">Nenhum descarte registrado.</p>';
    return;
  }

  // Tabela de descartes
  container.innerHTML = `
    <table class="relatorio-tabela" style="width:100%; border-collapse:collapse">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left; padding:.5rem">Oferta</th>
          <th style="text-align:left; padding:.5rem">Doador</th>
          <th style="text-align:center; padding:.5rem">Tipo</th>
          <th style="text-align:right; padding:.5rem">kg</th>
          <th style="text-align:center; padding:.5rem">Status</th>
          <th style="text-align:left; padding:.5rem">Motivo</th>
          <th style="text-align:right; padding:.5rem">Data</th>
        </tr>
      </thead>
      <tbody>
        ${descartes.map(d => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:.5rem">${d.titulo}</td>
            <td style="padding:.5rem">${d.doador}</td>
            <td style="padding:.5rem; text-align:center">
              <span class="tag">${d.tipo_alimento}</span>
            </td>
            <td style="padding:.5rem; text-align:right">${formatarKg(d.quantidade_kg)}</td>
            <td style="padding:.5rem; text-align:center">
              <span class="chip ${d.status_final === 'expirada' ? 'chip-expirada' : 'chip-cancelada'}">
                ${d.status_final}
              </span>
            </td>
            <td style="padding:.5rem; font-size:.85rem; color:var(--muted)">
              ${d.motivo_descarte || '<span style="color:var(--muted)">—</span>'}
            </td>
            <td style="padding:.5rem; text-align:right; font-size:.8rem; color:var(--muted)">
              ${formatarData(d.registrado_em)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ====================================================================
// UTILITÁRIOS
// ====================================================================

/**
 * Formata kg com 1 casa decimal.
 */
function formatarKg(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Formata número inteiro com separador de milhar.
 */
function formatarNumero(valor) {
  return Number(valor || 0).toLocaleString('pt-BR');
}

/**
 * Formata data para exibição curta.
 */
function formatarData(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
