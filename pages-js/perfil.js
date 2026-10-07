/**
 * perfil.js — Ver e editar o perfil do usuário logado
 * ====================================================================
 * Lê profiles + tabela de detalhe (doadores / instituicoes / voluntarios)
 * via getUserProfile() e permite UPDATE apenas nas linhas do próprio
 * usuário (policies *_update_own já garantem no banco).
 */

import supabase, {
  getUserProfile,
  redirectIfNotAuthenticated,
  mostrarPopup,
} from './supabase.js';

const LABEL_TIPO = { doador: 'Doador', instituicao: 'Instituição', voluntario: 'Voluntário' };

let profileAtual = null;

document.addEventListener('DOMContentLoaded', async () => {
  await redirectIfNotAuthenticated();
  await carregar();

  document.getElementById('btn-recarregar')?.addEventListener('click', carregar);
  document.getElementById('form-perfil')?.addEventListener('submit', salvar);
});

async function carregar() {
  setErro(null);
  const resumo = document.getElementById('perfil-resumo');
  if (resumo) resumo.textContent = 'Carregando seus dados…';

  profileAtual = await getUserProfile();
  if (!profileAtual) {
    setErro('Não foi possível carregar seu perfil. Tente entrar novamente.');
    return;
  }
  preencher(profileAtual);
}

function preencher(p) {
  document.getElementById('p-tipo').value = LABEL_TIPO[p.user_type] ?? p.user_type;
  document.getElementById('p-nome').value = p.nome ?? '';
  document.getElementById('p-tel').value = p.telefone ?? '';
  document.getElementById('p-email').value = p.email ?? '';

  const box = document.getElementById('perfil-detalhe');
  const d = p.detalhe ?? {};

  if (p.user_type === 'doador') {
    box.innerHTML = `
      <div class="field"><label for="d-estab">Nome do estabelecimento</label>
        <input id="d-estab" type="text" value="${esc(d.nome_estabelecimento)}" required></div>
      <div class="field"><label for="d-resp">Responsável</label>
        <input id="d-resp" type="text" value="${esc(d.responsavel)}" required></div>
      <div class="field"><label for="d-sanit">Validade do cadastro sanitário <span class="hint">RN-05</span></label>
        <input id="d-sanit" type="date" value="${esc(d.cadastro_sanitario_validade ?? '')}" required></div>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="field"><label for="d-end">Endereço</label>
          <input id="d-end" type="text" value="${esc(d.endereco)}"></div>
        <div class="field"><label for="d-bairro">Bairro</label>
          <input id="d-bairro" type="text" value="${esc(d.bairro)}"></div>
      </div>`;
  } else if (p.user_type === 'instituicao') {
    box.innerHTML = `
      <div class="field"><label for="i-razao">Razão social</label>
        <input id="i-razao" type="text" value="${esc(d.razao_social)}" required></div>
      <div class="field"><label for="i-resp">Responsável legal</label>
        <input id="i-resp" type="text" value="${esc(d.responsavel_legal)}" required></div>
      <div class="field"><label for="i-frio">Refrigeração <span class="hint">RN-03: sem frio, sem oferta fria</span></label>
        <select id="i-frio">
          <option value="sim" ${d.tem_refrigeracao ? 'selected' : ''}>Sim, tem refrigeração</option>
          <option value="nao" ${!d.tem_refrigeracao ? 'selected' : ''}>Não tem</option>
        </select></div>
      <div class="field"><label for="i-cong">Aceita congelado</label>
        <select id="i-cong">
          <option value="sim" ${d.aceita_congelado ? 'selected' : ''}>Sim</option>
          <option value="nao" ${!d.aceita_congelado ? 'selected' : ''}>Não</option>
        </select></div>
      <div class="field"><label for="i-end">Endereço</label>
        <input id="i-end" type="text" value="${esc(d.endereco)}"></div>
      <div class="field"><label for="i-bairro">Bairro</label>
        <input id="i-bairro" type="text" value="${esc(d.bairro)}"></div>`;
  } else {
    box.innerHTML = `
      <div class="field"><label for="v-nome">Nome completo</label>
        <input id="v-nome" type="text" value="${esc(d.nome_completo)}" required></div>
      <div class="field"><label for="v-caixa">Caixa térmica <span class="hint">RN-04</span></label>
        <select id="v-caixa">
          <option value="sim" ${d.tem_caixa_termica ? 'selected' : ''}>Sim, tenho</option>
          <option value="nao" ${!d.tem_caixa_termica ? 'selected' : ''}>Não tenho</option>
        </select></div>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="field"><label for="v-cap">Capacidade (kg)</label>
          <input id="v-cap" type="number" min="0" step="0.1" value="${esc(d.capacidade_kg ?? '')}"></div>
        <div class="field"><label for="v-raio">Raio de atuação (km)</label>
          <input id="v-raio" type="number" min="0" step="1" value="${esc(d.raio_atuacao_km ?? '')}"></div>
      </div>
      <div class="field"><label for="v-disp">Disponível para coletas</label>
        <select id="v-disp">
          <option value="sim" ${d.disponivel !== false ? 'selected' : ''}>Sim</option>
          <option value="nao" ${d.disponivel === false ? 'selected' : ''}>Pausado</option>
        </select></div>`;
  }

  const resumo = document.getElementById('perfil-resumo');
  if (resumo) resumo.textContent = `${LABEL_TIPO[p.user_type] ?? p.user_type} · ${p.email ?? ''}`;
}

async function salvar(e) {
  e.preventDefault();
  setErro(null);
  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;
  btn.textContent = 'Salvando…';

  try {
    const nome = document.getElementById('p-nome').value.trim();
    const telefone = document.getElementById('p-tel').value.trim() || null;
    if (nome.length < 2) {
      mostrarPopup('warn', 'Nome muito curto', 'Informe um nome com pelo menos 2 caracteres.');
      return;
    }

    // 1. Atualiza profiles (nome + telefone)
    const { error: eProf } = await supabase
      .from('profiles')
      .update({ nome, telefone })
      .eq('id', profileAtual.id);
    if (eProf) throw new Error(`Perfil: ${eProf.message}`);

    // 2. Atualiza tabela de detalhe conforme o tipo
    const t = profileAtual.user_type;
    let tabela, payload;
    if (t === 'doador') {
      tabela = 'doadores';
      payload = {
        nome_estabelecimento: val('d-estab'),
        responsavel: val('d-resp'),
        cadastro_sanitario_validade: val('d-sanit') || null,
        endereco: val('d-end') || null,
        bairro: val('d-bairro') || null,
        telefone,
      };
    } else if (t === 'instituicao') {
      tabela = 'instituicoes';
      payload = {
        razao_social: val('i-razao'),
        responsavel_legal: val('i-resp'),
        tem_refrigeracao: val('i-frio') === 'sim',
        aceita_congelado: val('i-cong') === 'sim',
        endereco: val('i-end') || null,
        bairro: val('i-bairro') || null,
        telefone,
      };
    } else {
      tabela = 'voluntarios';
      const cap = val('v-cap');
      const raio = val('v-raio');
      payload = {
        nome_completo: val('v-nome'),
        tem_caixa_termica: val('v-caixa') === 'sim',
        capacidade_kg: cap === '' ? null : Number(cap),
        raio_atuacao_km: raio === '' ? null : Number(raio),
        disponivel: val('v-disp') === 'sim',
        telefone,
      };
    }

    const { error: eDet } = await supabase
      .from(tabela)
      .update(payload)
      .eq('profile_id', profileAtual.id);
    if (eDet) throw new Error(`Dados de ${LABEL_TIPO[t]}: ${eDet.message}`);

    mostrarPopup('info', 'Perfil atualizado', 'Suas alterações foram salvas com sucesso.');
    await carregar();
  } catch (err) {
    mostrarPopup('danger', 'Não foi possível salvar', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar alterações';
  }
}

function val(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

function setErro(msg) {
  const el = document.getElementById('perfil-erro');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'flex';
  el.textContent = msg;
}

function esc(v) {
  return String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
