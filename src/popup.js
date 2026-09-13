// @ts-check
/* popup.js — mini command palette that works on EVERY tab, including
   chrome://, error and store pages where content scripts are blocked.
   Talks to background.js only (INIT_DATA/SEARCH_HISTORY/EXEC/NEW_TAB/OPEN_URL),
   always passing an explicit tabId/windowId since popup senders have no sender.tab. */
import { api } from './platform.js';
import { PHOSPHOR as PH } from './phosphor-icons.js';
import {
  ENGINES,
  buildItems,
  itemsHtml,
  emptyHtml,
  helpHtml,
  modeById,
  nextEngine,
  actionById,
  commandIntent,
  advanceFav,
  fetchData,
} from './shared.js';

const $ = (id) => document.getElementById(id);
if (PH.command) {
  if ($('logo')) $('logo').innerHTML = PH.command;
  if ($('mini-logo')) $('mini-logo').innerHTML = PH.command;
}

const notice = /** @type {HTMLElement} */ ($('notice'));
const btn = /** @type {HTMLButtonElement} */ ($('open'));
const input = /** @type {HTMLInputElement} */ ($('q'));
const list = /** @type {HTMLElement} */ ($('results'));
const chip = /** @type {HTMLElement} */ ($('chip'));
const hints = /** @type {HTMLElement} */ ($('hints'));

let tabId = null,
  windowId = null;
let filtered = [],
  sel = 0;
let mode = 'all',
  ui = 'search',
  help = false;
let cache = { tabs: [], bookmarks: [], history: [], closed: [] };
let engine = 'google';
let debounce = null;

api.storage.local
  .get(['engine'])
  .then((r) => {
    if (r.engine) engine = r.engine;
  })
  .catch(() => {});

function showNotice(msg) {
  notice.hidden = false;
  notice.textContent = msg;
}

// Same restricted-page classification as the overlay: page injection is
// impossible here, but the mini palette below works regardless.
async function restrictedReason(url) {
  if (/^(chrome|chrome-error|about|edge|brave|opera|vivaldi):/.test(url)) return 'settings';
  if (/^(chrome|edge)-extension:/.test(url)) return 'extension';
  if (/chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url)) return 'store';
  if (url.startsWith('file://') && api.extension?.isAllowedFileSchemeAccess) {
    if (!(await api.extension.isAllowedFileSchemeAccess())) return 'file';
  }
  return null;
}

const MESSAGES = {
  settings: 'This tab is a browser page — the overlay is blocked here, but the mini palette above works fully.',
  extension: 'This tab belongs to another extension — overlay blocked, mini palette works.',
  store: 'The Web Store blocks overlays — mini palette works.',
  file: 'For local files, enable “Allow access to file URLs” for full overlay support. Mini palette works.',
};

async function refresh(q) {
  const d = await fetchData(q);
  if (d) cache = d;
  filtered = buildItems(q, mode, cache, { engine, includePageOnly: false, tabLimit: 40, tabMatchLimit: 40 }).slice(
    0,
    40,
  );
  sel = 0;
  render();
}

function render() {
  if (help) {
    list.innerHTML = helpHtml();
    return;
  }
  list.innerHTML = filtered.length ? itemsHtml(filtered, sel, PH) : emptyHtml(mode, input.value, engine);
  list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
}

// Highlight moves must not rebuild the list (favicon <img> reload/flash).
function setSel(n) {
  sel = Math.max(0, Math.min(n, filtered.length - 1));
  const nodes = list.querySelectorAll('.cmdk-item');
  nodes.forEach((el, i) => el.classList.toggle('selected', i === sel));
  nodes[sel]?.scrollIntoView({ block: 'nearest' });
}

// ---------- modal state (NORMAL / SEARCH / help) ----------
const searchPlaceholder = () => modeById(mode).placeholder || 'Search…';
const NORMAL_FOOTER =
  '<span><kbd>t</kbd> tabs</span><span><kbd>h</kbd> history</span><span><kbd>b</kbd> bookmarks</span><span><kbd>a</kbd> actions</span><span><kbd>/</kbd> search</span><span><kbd>?</kbd> help</span>';
const SEARCH_FOOTER =
  '<span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>⇧↵</kbd> new tab</span><span><kbd>esc</kbd> normal mode</span>';

function renderStatus() {
  if (!chip) return;
  const m = modeById(mode);
  chip.textContent = help ? '? help' : ui === 'normal' ? (mode === 'all' ? 'NORMAL' : `NORMAL · ${m.label}`) : m.label;
  chip.dataset.ui = help ? 'help' : ui;
  input.readOnly = ui === 'normal';
  input.placeholder = ui === 'normal' ? 'Press t/h/b/a to scope · / to search' : searchPlaceholder();
  hints.innerHTML = help
    ? '<span><kbd>?</kbd> or <kbd>esc</kbd> to close help</span>'
    : ui === 'normal'
      ? NORMAL_FOOTER
      : SEARCH_FOOTER;
}
function setUI(next) {
  if (next === 'normal' && help) help = false;
  ui = next;
  if (ui === 'search') setTimeout(() => input.focus(), 0);
  else input.blur();
  renderStatus();
}
function setHelp(on) {
  help = on;
  if (on) input.blur();
  else if (ui === 'search') setTimeout(() => input.focus(), 0);
  renderStatus();
  render();
}
function handleCmdKey(e) {
  if (help) {
    if (e.key === '?' || e.key === 'Escape' || e.key === 'q') setHelp(false);
    return;
  }
  const intent = commandIntent(e.key);
  if (!intent) return;
  switch (intent.type) {
    case 'help':
      setHelp(true);
      break;
    case 'mode':
      mode = intent.mode;
      setUI('search');
      refresh(input.value);
      break;
    case 'search':
      setUI('search');
      break;
    case 'move':
      setSel(sel + intent.delta);
      break;
    case 'choose':
      choose(e);
      break;
    case 'escape':
      if (mode !== 'all') {
        mode = 'all';
        renderStatus();
        refresh(input.value);
      } else window.close();
      break;
    case 'close':
      window.close();
      break;
  }
}

const sendExec = (action, payload = {}) =>
  api.runtime.sendMessage({ type: 'EXEC', action, payload: { tabId, windowId, ...payload } });

async function choose(e) {
  const it = filtered[sel];
  const q = input.value;
  if (!it) {
    if (q.trim() && mode === 'all') {
      api.runtime.sendMessage({ type: 'OPEN_URL', url: ENGINES[engine](q.trim()), tabId });
      window.close();
    }
    return;
  }
  const newTab = e.shiftKey,
    bg = e.ctrlKey || e.metaKey;
  if (it.kind === 'tab') {
    await sendExec('switch-tab', { tabId: it.tabId, windowId: it.windowId });
    window.close();
  } else if (it.kind === 'calc') {
    try {
      await navigator.clipboard.writeText(it.value);
    } catch {}
    window.close();
  } else if (it.kind === 'action') {
    await runAction(it.actionId);
  } else if (newTab || bg) {
    await api.runtime.sendMessage({ type: 'NEW_TAB', url: it.url });
    window.close();
  } else {
    await api.runtime.sendMessage({ type: 'OPEN_URL', url: it.url, tabId });
    window.close();
  }
}

async function runAction(id) {
  const def = actionById(id);
  if (!def) return;
  if (id === 'engine') {
    engine = nextEngine(engine);
    await api.storage.local.set({ engine });
    await refresh(input.value);
    return; // keep popup open
  }
  // copy-* must read the page from the popup side; everything else forwards
  // the registry's exec/payload to the background.
  if (id === 'copy-url' || id === 'copy-title') {
    try {
      const t = await api.tabs.get(tabId);
      await navigator.clipboard.writeText(id === 'copy-url' ? t.url : `[${t.title}](${t.url})`);
    } catch {}
  } else if (def.exec) {
    if (def.before) await def.before();
    await sendExec(def.exec, { ...def.payload }).catch(() => {});
  }
  window.close();
}

input.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => refresh(input.value), 140);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSel(sel + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSel(sel - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(e);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    setUI('normal');
  } else if (e.key === '?' && !input.value) {
    e.preventDefault();
    setHelp(true);
  }
});
input.addEventListener('click', () => {
  if (ui === 'normal' || help) setUI('search');
});
// NORMAL/help keys arrive here because the input is blurred in those states.
document.addEventListener(
  'keydown',
  (e) => {
    if (ui !== 'normal' && !help) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    handleCmdKey(e);
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
list.addEventListener(
  'error',
  (e) => {
    const t = /** @type {Element} */ (e.target);
    if (t && t.tagName === 'IMG' && t.hasAttribute('data-fav')) advanceFav(t, PH);
  },
  true,
);
list.addEventListener('click', (e) => {
  const target = /** @type {Element} */ (e.target);
  const el = /** @type {HTMLElement} */ (target.closest('.cmdk-item'));
  if (!el) return;
  sel = +el.dataset.i;
  choose(e);
});

(async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  windowId = tab?.windowId ?? null;
  const reason = await restrictedReason(tab?.url || '');
  if (reason && reason !== 'file') {
    showNotice(MESSAGES[reason]);
    btn.disabled = true;
  } else {
    if (reason === 'file') showNotice(MESSAGES.file);
    btn.addEventListener('click', async () => {
      const [t] = await api.tabs.query({ active: true, currentWindow: true });
      if (!t?.id) return;
      try {
        await api.tabs.sendMessage(t.id, { type: 'TOGGLE_PALETTE' });
        window.close();
      } catch {
        try {
          await api.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] });
          await api.scripting.insertCSS({ target: { tabId: t.id }, files: ['host.css'] });
          setTimeout(() => api.tabs.sendMessage(t.id, { type: 'TOGGLE_PALETTE' }), 200);
          window.close();
        } catch {
          showNotice('Could not reach this tab — it is likely restricted. The mini palette above still works.');
        }
      }
    });
  }
  input.focus();
  renderStatus();
  await refresh('');
})();
