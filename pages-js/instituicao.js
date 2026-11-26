/** instituicao.js - feed da área da instituição (RN-03/RN-06/RN-07). */

import {
  getUserProfile,
  redirectIfNotAuthenticated,
  mostrarPopup,
  renderPapelSwitcher,
  preencherNomeTopBar,
} from './supabase.js';
import { renderizarFeed } from './ofertas.js';

document.addEventListener('DOMContentLoaded', async () => {
  const session = await redirectIfNotAuthenticated();
  if (!session) return;

  const profile = await getUserProfile();
  renderPapelSwitcher(profile);
  preencherNomeTopBar(profile);

  await renderizarFeed('instituicao');

  const filtroTipo = document.getElementById('filtro-tipo');
  filtroTipo?.addEventListener('change', () => renderizarFeed('instituicao'));
  const filtroFrio = document.getElementById('filtro-frio');
  filtroFrio?.addEventListener('change', () => renderizarFeed('instituicao'));
  document.getElementById('limpar-filtros')?.addEventListener('click', () => {
    if (filtroTipo) filtroTipo.value = '';
    if (filtroFrio) filtroFrio.value = '';
    renderizarFeed('instituicao');
  });
});
