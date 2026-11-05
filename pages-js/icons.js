/**
 * icons.js · Biblioteca de ícones do Sobra Zero
 * ====================================================================
 * Conjunto local baseado na linguagem do Lucide (ISC), desenhado para
 * herdar a cor do texto (currentColor) e substituir os emojis da interface.
 *
 * Uso em HTML estático:
 *   <span data-icon="alert-triangle"></span>
 *   (chame hidratarIcones() ou inclua este módulo na página)
 *
 * Uso em conteúdo renderizado por JS:
 *   import { icone } from './icons.js';
 *   icone('truck', { tamanho: 18, rotulo: 'Transporte' })
 */

const ICONES = {
  'megaphone':
    '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'circle-check':
    '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'check-check':
    '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  'truck':
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>' +
    '<path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>' +
    '<circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  'house':
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>' +
    '<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'chef-hat':
    '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/>' +
    '<path d="M6 17h12"/>',
  'building-2':
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>' +
    '<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>' +
    '<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>' +
    '<path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  'bot':
    '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>' +
    '<path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  'package':
    '<path d="m7.5 4.27 9 5.15"/>' +
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
    '<path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'ban':
    '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  'info':
    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'alert-triangle':
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>' +
    '<path d="M12 9v4"/><path d="M12 17h.01"/>',
  'circle-x':
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  'clock':
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  'snowflake':
    '<path d="M2 12h20"/><path d="M12 2v20"/><path d="m20 16-4-4 4-4"/>' +
    '<path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
  'map-pin':
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
    '<circle cx="12" cy="10" r="3"/>',
  'weight':
    '<circle cx="12" cy="5" r="3"/>' +
    '<path d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.5 8Z"/>',
  'route':
    '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>' +
    '<circle cx="18" cy="5" r="3"/>',
  'plus':
    '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'pencil':
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>' +
    '<path d="m15 5 4 4"/>',
  'arrow-right':
    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'arrow-left':
    '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'filter':
    '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  'user-round':
    '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  'utensils':
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>' +
    '<path d="M7 2v20"/>' +
    '<path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  'leaf':
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>' +
    '<path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
};

/**
 * Gera o SVG de um ícone da biblioteca.
 * @param {string} nome - chave do ícone (ex.: 'truck')
 * @param {{tamanho?: number, classe?: string, rotulo?: string}} [opcoes]
 * @returns {string} markup SVG (string vazia se o ícone não existir)
 */
export function icone(nome, { tamanho = 18, classe = '', rotulo = '' } = {}) {
  const conteudo = ICONES[nome];
  if (!conteudo) return '';
  const a11y = rotulo
    ? `role="img" aria-label="${escaparAtributo(rotulo)}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="icon${classe ? ` ${classe}` : ''}" width="${tamanho}" height="${tamanho}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
    `stroke-linecap="round" stroke-linejoin="round" ${a11y}>${conteudo}</svg>`;
}

/**
 * Substitui elementos [data-icon] pelo SVG correspondente.
 * Também aceita data-size e data-label.
 * @param {ParentNode} [root]
 */
export function hidratarIcones(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const nome = el.getAttribute('data-icon');
    const svg = icone(nome, {
      tamanho: Number(el.getAttribute('data-size')) || 18,
      rotulo: el.getAttribute('data-label') || '',
    });
    if (!svg) return;
    el.innerHTML = svg;
    el.removeAttribute('data-icon');
  });
}

function escaparAtributo(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Hidrata automaticamente os ícones declarados no HTML estático.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hidratarIcones());
  } else {
    hidratarIcones();
  }
}
