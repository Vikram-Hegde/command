/* ui/render.ts — rendering helpers (favicon, items, empty states). */
import { api, caps as platformCaps } from '../platform.js';
import { modeById } from '../modes.js';
import type { ResultItem } from '../shared.js';

const fav = (url: string): string | null => {
  try {
    const h = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  } catch {
    return null;
  }
};

const favEndpoint = (url: string): string | null => {
  if (!platformCaps.faviconCache) return null;
  try {
    if (!url || !/^https?:/i.test(url)) return null;
    return api.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(url) + '&size=32';
  } catch {
    return null;
  }
};

const iconChain = (url: string, direct: string | undefined): string[] => {
  const chain: string[] = [];
  if (direct) chain.push(direct);
  const ep = favEndpoint(url);
  if (ep && ep !== direct) chain.push(ep);
  if (url && /^https?:/i.test(url)) {
    const s2 = fav(url);
    if (s2 && !chain.includes(s2)) chain.push(s2);
  }
  return chain;
};

const attrEsc = (s: string): string => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export const escHtml = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const favSpan = (it: ResultItem, PH: Record<string, string>): string => {
  const chain = iconChain(it.url ?? '', it.directIcon);
  if (!chain.length) return `<span class="fav fav-ic">${(PH && PH[it.icon ?? '']) || (PH && PH.globe) || ''}</span>`;
  const [first, ...rest] = chain;
  const fb = rest.length ? ` data-fb="${rest.map(encodeURIComponent).join('|')}"` : '';
  return `<span class="fav"><img data-fav src="${attrEsc(first)}"${fb} alt=""/></span>`;
};

export const advanceFav = (img: HTMLImageElement, PH: Record<string, string>): void => {
  const next = (img.getAttribute('data-fb') || '').split('|').filter(Boolean);
  if (next.length) {
    const first = decodeURIComponent(next.shift() || '');
    img.setAttribute('data-fb', next.join('|'));
    img.src = first;
  } else if (img.parentNode) {
    (img.parentNode as Element).innerHTML = (PH && PH.globe) || '';
  }
};

export function itemsHtml(items: ResultItem[], selected: number, PH: Record<string, string> = {}): string {
  let html = '';
  let lastGroup: string | null = null;
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

export function emptyHtml(scope: string, query: string, engine: string): string {
  if (scope === 'all')
    return `<div class="cmdk-empty">No results — press Enter to search “${escHtml(query)}” on ${escHtml(engine)}</div>`;
  return `<div class="cmdk-empty">No matching ${escHtml(modeById(scope).label.toLowerCase())} — press Esc then / to search everywhere</div>`;
}
