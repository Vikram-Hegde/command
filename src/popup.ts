/* popup.ts — mini palette that works on EVERY tab, including chrome:// where content scripts are blocked. */
import { api } from './platform.js';
import { PHOSPHOR as PH } from './phosphor-icons.js';
import { actionById } from './actions/registry.js';
import { createPaletteController } from './palette/controller.js';

const $ = (id: string): HTMLElement | null => document.getElementById(id);
if ((PH as unknown as { command?: string }).command) {
  if ($('logo')) $('logo')!.innerHTML = (PH as unknown as Record<string, string>).command;
  if ($('mini-logo')) $('mini-logo')!.innerHTML = (PH as unknown as Record<string, string>).command;
}

const notice = $('notice') as HTMLElement;
const btn = $('open') as HTMLButtonElement;
const input = $('q') as HTMLInputElement;
const list = $('results') as HTMLElement;
const chip = $('chip') as HTMLElement;
const hints = $('hints') as HTMLElement;

let tabId: number | null = null;
let windowId: number | null = null;

function showNotice(msg: string): void {
  notice.hidden = false;
  notice.textContent = msg;
}

async function restrictedReason(url: string): Promise<string | null> {
  if (/^(chrome|chrome-error|about|edge|brave|opera|vivaldi):/.test(url)) return 'settings';
  if (/^(chrome|edge)-extension:/.test(url)) return 'extension';
  if (/chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url)) return 'store';
  if (
    url.startsWith('file://') &&
    (api.extension as unknown as { isAllowedFileSchemeAccess?: () => Promise<boolean> })?.isAllowedFileSchemeAccess
  ) {
    if (
      !(await (
        api.extension as unknown as { isAllowedFileSchemeAccess: () => Promise<boolean> }
      ).isAllowedFileSchemeAccess())
    )
      return 'file';
  }
  return null;
}

const MESSAGES: Record<string, string> = {
  settings: 'This tab is a browser page — the overlay is blocked here, but the mini palette above works fully.',
  extension: 'This tab belongs to another extension — overlay blocked, mini palette works.',
  store: 'The Web Store blocks overlays — mini palette works.',
  file: 'For local files, enable “Allow access to file URLs” for full overlay support. Mini palette works.',
};

const sendExec = (action: string, payload: Record<string, unknown> = {}): Promise<unknown> =>
  api.runtime.sendMessage({ type: 'EXEC', action, payload: { tabId, windowId, ...payload } } as unknown as never);

const palette = createPaletteController({
  includePageOnly: false,
  tabLimit: 40,
  tabMatchLimit: 40,
  maxItems: 40,
  input,
  list,
  chip,
  hints,
  PH: PH as unknown as Record<string, string>,
  onClose: () => window.close(),
  onOpenUrl: async (url, _e, newTab, bg) => {
    if (newTab || bg) await api.runtime.sendMessage({ type: 'NEW_TAB', url } as unknown as never);
    else await api.runtime.sendMessage({ type: 'OPEN_URL', url, tabId } as unknown as never);
    window.close();
  },
  onAction: async (id) => {
    const def = actionById(id);
    if (!def) return;
    if (id === 'copy-url' || id === 'copy-title') {
      try {
        const t = await api.tabs.get(tabId as number);
        await navigator.clipboard.writeText(id === 'copy-url' ? (t.url as string) : `[${t.title}](${t.url})`);
      } catch {}
    } else if (def.exec) {
      if (def.before) await def.before();
      await sendExec(def.exec, { ...(def.payload as Record<string, unknown>) }).catch(() => {});
    }
    if (id !== 'engine') window.close();
  },
});
palette.bind();

document.addEventListener(
  'keydown',
  (e) => {
    if (palette.ui !== 'normal' && !palette.help) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    palette.handleCmdKey(e as KeyboardEvent);
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

(async function init(): Promise<void> {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  tabId = (tab?.id as number | undefined) ?? null;
  windowId = (tab?.windowId as number | undefined) ?? null;
  const reason = await restrictedReason((tab?.url as string) || '');
  if (reason && reason !== 'file') {
    showNotice(MESSAGES[reason]);
    btn.disabled = true;
  } else {
    if (reason === 'file') showNotice(MESSAGES.file);
    btn.addEventListener('click', async () => {
      const [t] = await api.tabs.query({ active: true, currentWindow: true });
      if (!t?.id) return;
      try {
        await api.tabs.sendMessage(t.id, { type: 'TOGGLE_PALETTE' } as unknown as never);
        window.close();
      } catch {
        try {
          await api.scripting.executeScript({ target: { tabId: t.id! }, files: ['content.js'] });
          await api.scripting.insertCSS({ target: { tabId: t.id! }, files: ['host.css'] });
          setTimeout(() => api.tabs.sendMessage(t.id!, { type: 'TOGGLE_PALETTE' } as unknown as never), 200);
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
