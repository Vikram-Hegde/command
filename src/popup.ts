/* popup.ts — mini palette that works on EVERY tab, including chrome:// where content scripts are blocked. */
import { api } from './platform.js';
import { PHOSPHOR as PH } from './phosphor-icons.js';
import { createPaletteController } from './palette/controller.js';
import { restrictionFor, type Restriction } from './popup/reachability.js';

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
let status: 'loading' | 'ready' | 'restricted' | 'injecting' | 'failed' = 'loading';
input.disabled = true;
btn.disabled = true;

const MESSAGES: Record<Restriction, string> = {
  settings: 'This tab is a browser page — the overlay is blocked here, but the mini palette above works fully.',
  extension: 'This tab belongs to another extension — overlay blocked, mini palette works.',
  store: 'The Web Store blocks overlays — mini palette works.',
  file: 'For local files, enable “Allow access to file URLs” for full overlay support. Mini palette works.',
};

const fileAccessAllowed = async (): Promise<boolean> => {
  try {
    const ext = api.extension as unknown as { isAllowedFileSchemeAccess?: () => Promise<boolean> };
    if (!ext?.isAllowedFileSchemeAccess) return true;
    return await ext.isAllowedFileSchemeAccess();
  } catch {
    return false;
  }
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
  onAction: async (def) => {
    const run = def.run;
    if (run.type === 'clipboard') {
      if (tabId == null) return window.close();
      try {
        const t = await api.tabs.get(tabId);
        const url = t.url as string;
        const text = run.field === 'url' ? url : `[${t.title}](${url})`;
        await navigator.clipboard.writeText(text);
      } catch {}
      window.close();
      return;
    }
    if (run.type === 'exec') {
      if (run.before) await run.before();
      await sendExec(run.action, { ...run.payload }).catch(() => {});
    }
    window.close();
  },
});
palette.bind();

document.addEventListener(
  'keydown',
  (e) => {
    if (palette.phase === 'search') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    palette.handleCmdKey(e as KeyboardEvent);
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

function setStatus(next: typeof status, message?: string): void {
  status = next;
  if (message) {
    notice.hidden = false;
    notice.textContent = message;
  } else {
    notice.hidden = true;
  }
  btn.disabled = status === 'restricted' || status === 'injecting';
  if (status !== 'loading') input.disabled = false;
}

async function toggleWithRetry(tab: number, attempts = 4): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await api.tabs.sendMessage(tab, { type: 'TOGGLE_PALETTE' } as unknown as never);
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

btn.addEventListener('click', async () => {
  if (status === 'injecting') return;
  setStatus('injecting');
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus('failed', 'No active tab to open the palette on.');
    return;
  }
  try {
    await api.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' } as unknown as never);
    window.close();
  } catch {
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ['host.css'] });
      await toggleWithRetry(tab.id);
      window.close();
    } catch {
      setStatus('failed', 'Could not reach this tab — it is likely restricted. The mini palette above still works.');
    }
  }
});

(async function init(): Promise<void> {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    tabId = (tab?.id as number | undefined) ?? null;
    windowId = (tab?.windowId as number | undefined) ?? null;
    const reason = await restrictionFor((tab?.url as string) || '', fileAccessAllowed);
    if (reason && reason !== 'file') setStatus('restricted', MESSAGES[reason]);
    else setStatus('ready', reason === 'file' ? MESSAGES.file : undefined);
  } catch {
    setStatus('ready');
  }
  input.focus();
  palette.renderStatus();
  await palette.refresh('');
})();
