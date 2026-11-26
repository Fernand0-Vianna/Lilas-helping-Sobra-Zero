/** voluntario.js - feed da área do voluntário (RN-04/RN-07). */

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

  await renderizarFeed('voluntario');

  const filtroFrio = document.getElementById('filtro-frio');
  filtroFrio?.addEventListener('change', () => renderizarFeed('voluntario'));
  document.getElementById('limpar-filtros')?.addEventListener('click', () => {
    if (filtroFrio) filtroFrio.value = '';
    renderizarFeed('voluntario');
  });
});
