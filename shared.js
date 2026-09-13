/* shared.js — helpers shared by the overlay (content.js) and the popup palette.
   DOM-free; page-only action handlers run in the page context. */

const ENGINES = {
  google: q => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  bing: q => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  perplexity: q => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`
};

// Returns null when the background is unreachable so callers keep their last
// cache after an extension reload.
async function fetchData(q) {
  try {
    const d = await chrome.runtime.sendMessage({ type: 'INIT_DATA', query: q });
    const data = { tabs: d.tabs || [], bookmarks: d.bookmarks || [], history: d.recentHistory || [], closed: d.recentlyClosed || [] };
    if (q) {
      try {
        const h = await chrome.runtime.sendMessage({ type: 'SEARCH_HISTORY', query: q });
        data.history = h.results || data.history;
      } catch {}
    }
    return data;
  } catch { return null; }
}

// ---------- fuzzy ----------
// Subsequence match; earlier starts, word boundaries and runs score higher.
function fuzzyScore(q, text) {
  q = q.toLowerCase(); text = (text || '').toLowerCase();
  if (!q) return 1;
  let qi = 0, score = 0, consec = 0, lastIdx = -2;
  for (let i = 0; i < text.length && qi < q.length; i++) {
    if (text[i] === q[qi]) {
      let s = 1;
      if (i === 0) s += 6;
      else if (/[\s\-_\/.:]/.test(text[i - 1])) s += 4;
      if (i === lastIdx + 1) { consec++; s += 2 + consec; } else consec = 0;
      score += s; lastIdx = i; qi++;
    }
  }
  return qi === q.length ? score - text.length * 0.01 : -Infinity;
}
const match = (q, ...fields) => Math.max(...fields.map(f => fuzzyScore(q, f)));

const fav = url => {
  try { const h = new URL(url).hostname; return `https://www.google.com/s2/favicons?domain=${h}&sz=32`; }
  catch { return null; }
};
// Chrome's own favicon cache (needs the "favicon" permission). Works offline
// and for localhost; fails gracefully for unvisited or odd URLs.
const favEndpoint = url => {
  try {
    if (!url || !/^https?:/i.test(url)) return null;
    return chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(url) + '&size=32';
  } catch { return null; }
};
// Icon fallbacks in order: the tab's real icon, Chrome's cache, then Google S2.
// A failed <img> advances through data-fb (see advanceFav) and finally falls
// back to the glyph tile.
const iconChain = (url, direct) => {
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
const attrEsc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const favSpan = (it, PH) => {
  const chain = iconChain(it.url, it.directIcon);
  if (!chain.length) return `<span class="fav fav-ic">${(PH && PH[it.icon]) || (PH && PH.globe) || ''}</span>`;
  const [first, ...rest] = chain;
  const fb = rest.length ? ` data-fb="${rest.map(encodeURIComponent).join('|')}"` : '';
  return `<span class="fav"><img data-fav src="${attrEsc(first)}"${fb} alt=""/></span>`;
};
const advanceFav = (img, PH) => {
  const next = (img.getAttribute('data-fb') || '').split('|').filter(Boolean);
  if (next.length) {
    const first = decodeURIComponent(next.shift());
    img.setAttribute('data-fb', next.join('|'));
    img.src = first;
  } else if (img.parentNode) {
    img.parentNode.innerHTML = (PH && PH.globe) || '';
  }
};
const isUrl = q => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(q.trim()) && !q.includes(' ');
const normUrl = q => /^https?:\/\//i.test(q) ? q : `https://${q}`;

const isMath = q => /^[0-9+\-*/().%^\s]+$/.test(q.trim()) && /\d/.test(q) && /[+\-*/%^]/.test(q);
// Safe math evaluator: recursive-descent parser, no eval()/new Function()
// (extension CSP forbids dynamic code execution). Supports + - * / ^,
// parentheses, decimals, unary minus, and postfix % (percent).
function evalMath(q) {
  const stripped = q.replace(/\s+/g, '');
  if (!stripped || stripped.length > 60) return null;
  const tokens = [];
  let pos = 0;
  while (pos < stripped.length) {
    const num = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(stripped.slice(pos));
    if (num) { tokens.push({ t: 'n', v: parseFloat(num[0]) }); pos += num[0].length; continue; }
    const ch = stripped[pos];
    if ('+-*/%^()'.includes(ch)) { tokens.push({ t: ch }); pos++; continue; }
    return null;
  }
  let i = 0;
  const peek = () => tokens[i];
  function parseExpr() {
    let v = parseTerm();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[i++].t;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = tokens[i++].t;
      const r = parseFactor();
      if (op === '*') v *= r;
      else { if (r === 0) throw new Error('div0'); v /= r; }
    }
    return v;
  }
  function parseFactor() {
    if (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[i++].t;
      const v = parseFactor();
      return op === '-' ? -v : v;
    }
    let v = parsePrimary();
    while (peek() && peek().t === '%') { i++; v /= 100; }
    if (peek() && peek().t === '^') { i++; v = Math.pow(v, parseFactor()); }
    return v;
  }
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('end');
    if (tk.t === 'n') { i++; return tk.v; }
    if (tk.t === '(') {
      i++;
      const v = parseExpr();
      if (!peek() || peek().t !== ')') throw new Error('paren');
      i++;
      return v;
    }
    throw new Error('token');
  }
  try {
    const v = parseExpr();
    if (i !== tokens.length) return null;
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round(v * 1e8) / 1e8;
  } catch { return null; }
}

// Engine cycling is context-specific (content toast vs popup re-render), so the
// 'engine' entry carries no `local` — each host handles the id explicitly.
const nextEngine = (cur) => {
  const order = Object.keys(ENGINES);
  return order[(order.indexOf(cur) + 1) % order.length];
};

// ---------- modes (vim-style scopes) ----------
// `groups` lists the item groups visible in that mode; null = everything.
// Single-letter mnemonics; '/' is search-everything.
const MODES = [
  { id: 'all',       key: '/', label: 'All',       placeholder: 'Type a command, tab, bookmark…', groups: null },
  { id: 'tabs',      key: 't', label: 'Tabs',      placeholder: 'Search open tabs…',       groups: ['Current / Open Tabs', 'Open Tabs'] },
  { id: 'history',   key: 'h', label: 'History',   placeholder: 'Search history…',         groups: ['History', 'Recently Closed'] },
  { id: 'bookmarks', key: 'b', label: 'Bookmarks', placeholder: 'Search bookmarks…',       groups: ['Bookmarks'] },
  { id: 'actions',   key: 'a', label: 'Actions',   placeholder: 'Search actions…',         groups: ['Actions'] }
];
const modeById = id => MODES.find(m => m.id === id) || MODES[0];
const modeByKey = key => MODES.find(m => m.key === key);
const scopedItems = (items, modeId) => {
  const m = modeById(modeId);
  return m.groups ? items.filter(it => m.groups.includes(it.group)) : items;
};

// Static cheatsheet markup; hosts inject it into their own list container.
function helpHtml() {
  const rows = list => list.map(([k, d]) =>
    `<div class="cmdk-help-row"><span class="cmdk-help-k">${k}</span><span class="cmdk-help-d">${d}</span></div>`).join('');
  return `
    <div class="cmdk-help">
      <div class="cmdk-help-head">Keyboard reference</div>
      <div class="cmdk-help-sec">Modes <span>Esc from search, then…</span></div>
      ${rows([
        ['t', 'Open tabs only'],
        ['h', 'History and recently closed'],
        ['b', 'Bookmarks only'],
        ['a', 'Browser actions only'],
        ['/', 'Search everything'],
        ['i', 'Search the current scope'],
        ['?', 'Toggle this help']
      ])}
      <div class="cmdk-help-sec">Navigate <span>in NORMAL mode</span></div>
      ${rows([
        ['↑ ↓ / j k', 'Move selection'],
        ['↵', 'Open'],
        ['⇧↵', 'Open in new tab'],
        ['⌃↵ / ⌘↵', 'Open in background'],
        ['esc', 'Back · close'],
        ['q', 'Close palette']
      ])}
    </div>`;
}

// ---------- action registry ----------
// `icon` names refer to the bundled Phosphor set (window.PHOSPHOR).
// `pageOnly` actions need a live page DOM and are hidden in the popup palette.
// `local` runs in the page; otherwise `exec` is the background EXEC action and
// `payload` its extra args — hosts just forward these, no per-host switch.
const ACTIONS = [
  { id: 'new-tab', title: 'New Tab', hint: 'Action', icon: 'plus', kw: 'new tab create blank', exec: 'new-tab' },
  { id: 'new-window', title: 'New Window', hint: 'Action', icon: 'app-window', kw: 'new window popup', exec: 'new-window' },
  { id: 'incognito', title: 'New Incognito Window', hint: 'Action', icon: 'sunglasses', kw: 'incognito private secret', exec: 'new-window', payload: { incognito: true } },
  { id: 'reopen', title: 'Reopen Closed Tab', hint: 'Action', icon: 'arrow-counter-clockwise', kw: 'reopen restore undo closed', exec: 'reopen-closed' },
  { id: 'duplicate', title: 'Duplicate Tab', hint: 'Tab', icon: 'copy', kw: 'duplicate clone copy tab', exec: 'duplicate' },
  { id: 'pin', title: 'Pin / Unpin Tab', hint: 'Tab', icon: 'push-pin', kw: 'pin unpin', exec: 'pin-toggle' },
  { id: 'mute', title: 'Mute / Unmute Tab', hint: 'Tab', icon: 'speaker-slash', kw: 'mute unmute sound audio', exec: 'mute-toggle' },
  { id: 'reload', title: 'Reload Tab', hint: 'Tab', icon: 'arrow-clockwise', kw: 'reload refresh', exec: 'reload' },
  { id: 'hard-reload', title: 'Hard Reload (bypass cache)', hint: 'Tab', icon: 'lightning', kw: 'hard reload cache refresh', exec: 'hard-reload' },
  { id: 'back', title: 'Go Back', hint: 'Navigate', icon: 'arrow-left', kw: 'back previous history', exec: 'go-back' },
  { id: 'forward', title: 'Go Forward', hint: 'Navigate', icon: 'arrow-right', kw: 'forward next history', exec: 'go-forward' },
  { id: 'close-tab', title: 'Close This Tab', hint: 'Tab', icon: 'x', kw: 'close delete tab', exec: 'close-tab' },
  { id: 'close-others', title: 'Close Other Tabs', hint: 'Tab', icon: 'broom', kw: 'close others', exec: 'close-others' },
  { id: 'close-right', title: 'Close Tabs to the Right', hint: 'Tab', icon: 'arrow-line-right', kw: 'close right', exec: 'close-right' },
  { id: 'close-dupes', title: 'Close Duplicate Tabs', hint: 'Tab', icon: 'trash', kw: 'close duplicate dedupe', exec: 'close-duplicates' },
  { id: 'move-window', title: 'Move Tab to New Window', hint: 'Tab', icon: 'arrow-square-out', kw: 'move pop out window', exec: 'move-to-new-window' },
  { id: 'group', title: 'Group / Ungroup Tab', hint: 'Tab', icon: 'stack', kw: 'group ungroup organize', exec: 'group-tab' },
  { id: 'discard', title: 'Unload (Discard) Tab to Save Memory', hint: 'Tab', icon: 'moon', kw: 'discard unload sleep memory suspend', exec: 'discard' },
  { id: 'copy-url', title: 'Copy URL', hint: 'Clipboard', icon: 'link', kw: 'copy url link address', local: () => navigator.clipboard.writeText(location.href) },
  { id: 'copy-title', title: 'Copy Title + URL', hint: 'Clipboard', icon: 'clipboard-text', kw: 'copy title markdown', local: () => navigator.clipboard.writeText(`[${document.title}](${location.href})`) },
  { id: 'bookmark', title: 'Bookmark This Tab', hint: 'Action', icon: 'bookmark', kw: 'bookmark star favorite save', exec: 'bookmark-tab' },
  { id: 'screenshot', title: 'Screenshot Visible Area (PNG download)', hint: 'Action', icon: 'camera', kw: 'screenshot capture png image', exec: 'screenshot' },
  { id: 'print', title: 'Print Page', hint: 'Action', icon: 'printer', kw: 'print pdf', pageOnly: true, local: () => window.print() },
  { id: 'source', title: 'View Page Source', hint: 'Dev', icon: 'code', kw: 'source view html code', pageOnly: true, local: () => window.open('view-source:' + location.href, '_blank') },
  { id: 'scroll-top', title: 'Scroll to Top', hint: 'Page', icon: 'arrow-up', kw: 'scroll top up', pageOnly: true, local: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
  { id: 'scroll-bottom', title: 'Scroll to Bottom', hint: 'Page', icon: 'arrow-down', kw: 'scroll bottom down', pageOnly: true, local: () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) },
  { id: 'fullscreen', title: 'Toggle Fullscreen', hint: 'View', icon: 'corners-out', kw: 'fullscreen f11 present', pageOnly: true, local: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() },
  { id: 'zoom-in', title: 'Zoom In', hint: 'View', icon: 'magnifying-glass-plus', kw: 'zoom in bigger', pageOnly: true, local: () => document.body.style.zoom = (parseFloat(document.body.style.zoom) || 1) + 0.1 },
  { id: 'zoom-out', title: 'Zoom Out', hint: 'View', icon: 'magnifying-glass-minus', kw: 'zoom out smaller', pageOnly: true, local: () => document.body.style.zoom = (parseFloat(document.body.style.zoom) || 1) - 0.1 },
  { id: 'zoom-reset', title: 'Reset Zoom', hint: 'View', icon: 'arrows-counter-clockwise', kw: 'zoom reset 100', pageOnly: true, local: () => document.body.style.zoom = 1 },
  { id: 'pg-history', title: 'Open History', hint: 'Chrome', icon: 'clock', kw: 'history open chrome page', exec: 'chrome-page', payload: { page: 'history' } },
  { id: 'pg-downloads', title: 'Open Downloads', hint: 'Chrome', icon: 'download-simple', kw: 'downloads files chrome', exec: 'chrome-page', payload: { page: 'downloads' } },
  { id: 'pg-bookmarks', title: 'Open Bookmark Manager', hint: 'Chrome', icon: 'bookmarks-simple', kw: 'bookmarks manager chrome', exec: 'chrome-page', payload: { page: 'bookmarks' } },
  { id: 'pg-settings', title: 'Open Settings', hint: 'Chrome', icon: 'gear', kw: 'settings preferences chrome', exec: 'chrome-page', payload: { page: 'settings' } },
  { id: 'pg-extensions', title: 'Open Extensions', hint: 'Chrome', icon: 'puzzle-piece', kw: 'extensions plugins chrome', exec: 'chrome-page', payload: { page: 'extensions' } },
  { id: 'pg-passwords', title: 'Open Password Manager', hint: 'Chrome', icon: 'key', kw: 'password passkey login', exec: 'chrome-page', payload: { page: 'passwords' } },
  { id: 'pg-clear', title: 'Clear Browsing Data…', hint: 'Chrome', icon: 'eraser', kw: 'clear cache cookies data privacy', exec: 'chrome-page', payload: { page: 'clearData' } },
  { id: 'engine', title: 'Cycle Search Engine (Google→DDG→Bing→Perplexity)', hint: 'Settings', icon: 'magnifying-glass', kw: 'search engine google duckduckgo bing default' }
];
const actionById = id => ACTIONS.find(a => a.id === id);

// ---------- result building (shared by the overlay and the popup) ----------
// `data` = { tabs, bookmarks, history, closed }. `scope` is a MODES id.
function buildItems(q, scope, data, { engine = 'google', includePageOnly = true, tabLimit = 6, tabMatchLimit = 8 } = {}) {
  const out = [];
  const ql = (q || '').trim().toLowerCase();
  const tabs = data.tabs || [], bookmarks = data.bookmarks || [],
        history = data.history || [], closed = data.closed || [];

  const tabItems = tabs.map(t => ({
    kind: 'tab', group: t.active ? 'Current / Open Tabs' : 'Open Tabs',
    title: t.title || t.url, subtitle: t.url, icon: 'globe', url: t.url,
    directIcon: t.favIconUrl, tabId: t.id, windowId: t.windowId, active: t.active,
    score: ql ? match(ql, t.title, t.url) : (t.active ? 999 : 50 - t.index * 0.1)
  })).filter(t => t.score > -Infinity);
  out.push(...tabItems.sort((a, b) => b.score - a.score).slice(0, ql ? tabMatchLimit : tabLimit));

  for (const a of ACTIONS) {
    if (a.pageOnly && !includePageOnly) continue;
    const s = ql ? match(ql, a.title, a.kw) : 5;
    if (s > -Infinity && (!ql || s > 0)) out.push({ kind: 'action', group: 'Actions', title: a.title, subtitle: a.hint, icon: a.icon, actionId: a.id, def: a, score: s + 20 });
  }
  for (const b of bookmarks.slice(0, 30)) {
    if (!b.url) continue;
    const s = ql ? match(ql, b.title, b.url) : 1;
    if (s > -Infinity && (!ql || s > 0)) out.push({ kind: 'bookmark', group: 'Bookmarks', title: b.title || b.url, subtitle: b.url, icon: 'bookmark-simple', url: b.url, score: s + 10 });
  }
  for (const h of history.slice(0, 20)) {
    if (!h.url || h.url.startsWith('chrome://')) continue;
    const s = ql ? match(ql, h.title, h.url) : 0.5;
    if (s > -Infinity && (!ql || s > 0)) out.push({ kind: 'history', group: 'History', title: h.title || h.url, subtitle: h.url, icon: 'clock', url: h.url, score: s });
  }
  for (const c of closed) {
    const t = c.tab; if (!t?.url) continue;
    const s = ql ? match(ql, t.title, t.url) : 0;
    if (!ql || s > 0) out.push({ kind: 'history', group: 'Recently Closed', title: '↩ ' + (t.title || t.url), subtitle: t.url, icon: 'clock', url: t.url, score: s + 2 });
  }

  if (q && isMath(q)) {
    const v = evalMath(q);
    if (v !== null) out.unshift({ kind: 'calc', group: 'Calculator', title: `${q.trim()} = ${v}`, subtitle: 'Enter to copy result', icon: 'calculator', value: String(v), score: 1e6 });
  }
  if (ql) {
    if (isUrl(ql)) out.unshift({ kind: 'url', group: 'Go To', title: normUrl(ql), subtitle: 'Open URL', icon: 'globe', url: normUrl(ql), score: 1e5 });
    out.unshift({ kind: 'search', group: 'Search', title: `Search ${engine} for “${q.trim()}”`, subtitle: 'Enter to search', icon: 'magnifying-glass', url: ENGINES[engine](q.trim()), score: 1e5 - 1 });
  }

  // calc on top, a typed URL next, real matches, then the generic search row.
  const groupOrder = { 'Calculator': 0, 'Go To': 1, 'Search': 2, 'Current / Open Tabs': 3, 'Open Tabs': 4, 'Actions': 5, 'Bookmarks': 6, 'History': 7, 'Recently Closed': 8 };
  const rank = it => it.kind === 'calc' ? 0 : it.kind === 'url' ? 1 : it.kind === 'search' ? 3 : 2;
  const sorted = out.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9) || b.score - a.score;
  });
  return scopedItems(sorted, scope);
}

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

function itemsHtml(items, selected, PH = {}) {
  let html = '', lastGroup = null;
  items.forEach((it, i) => {
    if (it.group !== lastGroup) { html += `<div class="cmdk-group">${it.group}</div>`; lastGroup = it.group; }
    html += `<div class="cmdk-item${i === selected ? ' selected' : ''}" data-i="${i}">${favSpan(it, PH)}` +
      `<div class="t"><b>${escHtml(it.title)}</b><span>${escHtml(it.subtitle || '')}</span></div>` +
      `<span class="k">${it.kind === 'tab' && it.active ? 'current' : it.kind}</span></div>`;
  });
  return html;
}

function emptyHtml(scope, query, engine) {
  if (scope === 'all') return `<div class="cmdk-empty">No results — press Enter to search “${escHtml(query)}” on ${engine}</div>`;
  return `<div class="cmdk-empty">No matching ${escHtml(modeById(scope).label.toLowerCase())} — press Esc then / to search everywhere</div>`;
}

// Maps a NORMAL-mode keystroke to an intent; hosts execute it against their DOM.
function commandIntent(key) {
  if (key === '?') return { type: 'help' };
  const m = modeByKey(key);
  if (m) return { type: 'mode', mode: m.id };
  if (key === 'i') return { type: 'search' };
  if (key === 'j' || key === 'ArrowDown') return { type: 'move', delta: 1 };
  if (key === 'k' || key === 'ArrowUp') return { type: 'move', delta: -1 };
  if (key === 'Enter') return { type: 'choose' };
  if (key === 'Escape') return { type: 'escape' };
  if (key === 'q') return { type: 'close' };
  return null;
}
