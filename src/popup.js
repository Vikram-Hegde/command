// @ts-check
/* popup.js — mini palette that works on EVERY tab, including chrome:// where content scripts are blocked. */
import { api } from './platform.js';
import { PHOSPHOR as PH } from './phosphor-icons.js';
import { actionById } from './actions/registry.js';
import { createPaletteController } from './palette/controller.js';

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

let tabId = null;
let windowId = null;

function showNotice(msg) {
  notice.hidden = false;
  notice.textContent = msg;
}

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

const sendExec = (action, payload = {}) =>
  api.runtime.sendMessage({ type: 'EXEC', action, payload: { tabId, windowId, ...payload } });

const palette = createPaletteController({
  includePageOnly: false,
  tabLimit: 40,
  tabMatchLimit: 40,
  maxItems: 40,
  input,
  list,
  chip,
  hints,
  PH,
  onClose: () => window.close(),
  onOpenUrl: async (url, _e, newTab, bg) => {
    if (newTab || bg) await api.runtime.sendMessage({ type: 'NEW_TAB', url });
    else await api.runtime.sendMessage({ type: 'OPEN_URL', url, tabId });
    window.close();
  },
  onAction: async (id) => {
    const def = actionById(id);
    if (!def) return;
    if (id === 'copy-url' || id === 'copy-title') {
      try {
        const t = await api.tabs.get(tabId);
        await navigator.clipboard.writeText(id === 'copy-url' ? t.url : `[${t.title}](${t.url})`);
      } catch {}
    } else if (def.exec) {
      if (def.before) await def.before();
      await sendExec(def.exec, { ...def.payload }).catch(() => {});
    }
    // engine is handled inside controller (keeps popup open); others close
    if (id !== 'engine') window.close();
  },
});
palette.bind();

// NORMAL/help keys arrive via document when input is blurred
document.addEventListener(
  'keydown',
  (e) => {
    if (palette.ui !== 'normal' && !palette.help) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    palette.handleCmdKey(e);
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

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
  palette.renderStatus();
  await palette.refresh('');
})();
