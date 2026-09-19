// @ts-check
/* ui/render.js — rendering helpers (favicon, items, empty states). */
import { api, caps as platformCaps } from '../platform.js';
import { modeById } from '../modes.js';

const fav = (/** @type {string} */ url) => {
  try {
    const h = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  } catch {
    return null;
  }
};

const favEndpoint = (/** @type {string} */ url) => {
  if (!platformCaps.faviconCache) return null;
  try {
    if (!url || !/^https?:/i.test(url)) return null;
    return api.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(url) + '&size=32';
  } catch {
    return null;
  }
};

const iconChain = (/** @type {string} */ url, /** @type {string|undefined} */ direct) => {
  const chain = [];
  if (direct) chain.push(direct);
  const ep = favEndpoint(url);
  if (ep && ep !== direct) chain.push(ep);
  if (url && /^https?:/i.test(url)) {
    const s2 = fav(url);
    if (s2 && !chain.includes(s2)) chain.push(s2);
  }
  return chain;
};

const attrEsc = (/** @type {string} */ s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export const escHtml = (/** @type {any} */ s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const favSpan = (/** @type {any} */ it, /** @type {Record<string,string>} */ PH) => {
  const chain = iconChain(it.url, it.directIcon);
  if (!chain.length) return `<span class="fav fav-ic">${(PH && PH[it.icon]) || (PH && PH.globe) || ''}</span>`;
  const [first, ...rest] = chain;
  const fb = rest.length ? ` data-fb="${rest.map(encodeURIComponent).join('|')}"` : '';
  return `<span class="fav"><img data-fav src="${attrEsc(first)}"${fb} alt=""/></span>`;
};

/**
 * Advance favicon fallback chain.
 * @param {HTMLImageElement} img
 * @param {Record<string,string>} PH
 */
export const advanceFav = (img, PH) => {
  const next = (img.getAttribute('data-fb') || '').split('|').filter(Boolean);
  if (next.length) {
    const first = decodeURIComponent(next.shift() || '');
    img.setAttribute('data-fb', next.join('|'));
    img.src = first;
  } else if (img.parentNode) {
    /** @type {Element} */ (img.parentNode).innerHTML = (PH && PH.globe) || '';
  }
};

/**
 * @param {any[]} items
 * @param {number} selected
 * @param {Record<string,string>} [PH]
 */
export function itemsHtml(items, selected, PH = {}) {
  let html = '';
  let lastGroup = null;
  items.forEach((it, i) => {
    if (it.group !== lastGroup) {
      html += `<div class="cmdk-group">${it.group}</div>`;
      lastGroup = it.group;
    }
    html +=
      `<div class="cmdk-item${i === selected ? ' selected' : ''}" data-i="${i}">${favSpan(it, PH)}` +
      `<div class="t"><b>${escHtml(it.title)}</b><span>${escHtml(it.subtitle || '')}</span></div>` +
      `<span class="k">${it.kind === 'tab' && it.active ? 'current' : it.kind}</span></div>`;
  });
  return html;
}

/**
 * @param {string} scope
 * @param {string} query
 * @param {string} engine
 */
export function emptyHtml(scope, query, engine) {
  if (scope === 'all')
    return `<div class="cmdk-empty">No results — press Enter to search “${escHtml(query)}” on ${escHtml(engine)}</div>`;
  return `<div class="cmdk-empty">No matching ${escHtml(modeById(scope).label.toLowerCase())} — press Esc then / to search everywhere</div>`;
}
