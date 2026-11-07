// background.ts — MV3 service worker (Chrome) / event page (Firefox).
import { api } from './platform.js';
import { handlers } from './actions/handlers.js';
import type { Message } from './messaging.js';

interface BgMessage extends Record<string, unknown> {
  type: string;
  query?: string;
  action?: string;
  payload?: Record<string, unknown>;
  url?: string;
  tabId?: number;
}

type MessageHandler = (msg: BgMessage, sender: chrome.runtime.MessageSender) => Promise<unknown>;

const MESSAGE_HANDLERS: Record<string, MessageHandler> = {
  INIT_DATA: async (msg) => {
    const q = String(msg.query || '').slice(0, 100);
    const [tabs, recentHistory, bookmarks, recentlyClosed] = await Promise.all([
      api.tabs.query({}),
      api.history.search({ text: q || '', maxResults: q ? 20 : 8, startTime: Date.now() - 30 * 864e5 }),
      queryBookmarks(q),
      api.sessions.getRecentlyClosed({ maxResults: 5 }).catch(() => [] as unknown[]),
    ]);
    return { tabs, recentHistory, bookmarks, recentlyClosed };
  },
  SEARCH_HISTORY: async (msg) => {
    const results = await api.history.search({ text: String(msg.query || ''), maxResults: 12 });
    return { results };
  },
  EXEC: async (msg, sender) => {
    await execAction(msg.action as string, (msg.payload as Record<string, unknown>) ?? {}, sender);
    return { ok: true };
  },
  NEW_TAB: async (msg) => {
    if (!msg.url || typeof msg.url !== 'string') return { ok: false, error: 'invalid url' };
    await api.tabs.create({ url: msg.url, active: true });
    return { ok: true };
  },
  OPEN_URL: async (msg, sender) => {
    if (!msg.url || typeof msg.url !== 'string') return { ok: false, error: 'invalid url' };
    const targetId = msg.tabId ?? sender.tab?.id;
    if (targetId) await api.tabs.update(targetId, { url: msg.url });
    else await api.tabs.create({ url: msg.url });
    return { ok: true };
  },
};

api.commands?.onCommand.addListener(async (command: string) => {
  if (command !== 'open-palette') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await api.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' } as unknown as Message);
  } catch {
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ['host.css'] });
      await api.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' } as unknown as Message);
    } catch {
      console.warn('[CommandK] cannot reach tab:', tab.url);
    }
  }
});

api.runtime.onMessage.addListener(
  (msg: BgMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    const handler = MESSAGE_HANDLERS[msg.type];
    if (!handler) {
      sendResponse({ ok: false, error: `unknown message: ${msg.type}` });
      return false;
    }
    void (async () => {
      try {
        sendResponse(await handler(msg, sender));
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  },
);

async function queryBookmarks(q: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  try {
    if (!q) {
      const tree = await api.bookmarks.getTree();
      return flattenBookmarks(tree).slice(0, 30);
    }
    return await api.bookmarks.search(String(q).slice(0, 50));
  } catch {
    return [];
  }
}

function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  out: chrome.bookmarks.BookmarkTreeNode[] = [],
): chrome.bookmarks.BookmarkTreeNode[] {
  for (const n of nodes) {
    if (n.url) out.push(n);
    if (n.children) flattenBookmarks(n.children, out);
    if (out.length > 60) break;
  }
  return out;
}

async function execAction(
  action: string,
  p: Record<string, unknown> = {},
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const handler = handlers[action];
  if (!handler) throw new Error(`unknown action: ${action}`);
  await handler(p, sender);
}
