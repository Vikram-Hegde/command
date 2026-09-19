// background.ts — MV3 service worker (Chrome) / event page (Firefox).
import { api } from './platform.js';
import { handlers } from './actions/handlers.js';
import type { Message } from './messaging.js';

type SendResponse = (response: unknown) => void;

interface BgMessage extends Record<string, unknown> {
  type: string;
  query?: string;
  action?: string;
  payload?: Record<string, unknown>;
  url?: string;
  tabId?: number;
  background?: boolean;
}

const MESSAGE_HANDLERS: Record<
  string,
  (msg: BgMessage, sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => Promise<void>
> = {
  INIT_DATA: async (msg, _sender, sendResponse) => {
    const q = String(msg.query || '').slice(0, 100);
    const [tabs, recentHistory, bookmarks, recentlyClosed] = await Promise.all([
      api.tabs.query({}),
      api.history.search({ text: q || '', maxResults: q ? 20 : 8, startTime: Date.now() - 30 * 864e5 }),
      queryBookmarks(q),
      api.sessions.getRecentlyClosed({ maxResults: 5 }).catch(() => [] as unknown[]),
    ]);
    sendResponse({ tabs, recentHistory, bookmarks, recentlyClosed });
  },
  SEARCH_HISTORY: async (msg, _sender, sendResponse) => {
    const r = await api.history.search({ text: String(msg.query || ''), maxResults: 12 });
    sendResponse({ results: r });
  },
  EXEC: async (msg, sender, sendResponse) => {
    await execAction(msg.action as string, (msg.payload as Record<string, unknown>) ?? {}, sender);
    sendResponse({ ok: true });
  },
  NEW_TAB: async (msg, _sender, sendResponse) => {
    if (!msg.url || typeof msg.url !== 'string') {
      sendResponse({ ok: false });
      return;
    }
    await api.tabs.create({ url: msg.url, active: true });
    sendResponse({ ok: true });
  },
  OPEN_URL: async (msg, sender, sendResponse) => {
    if (!msg.url || typeof msg.url !== 'string') {
      sendResponse({ ok: false });
      return;
    }
    const tab = sender.tab;
    const targetId = (msg.tabId as number | undefined) ?? tab?.id;
    if (msg.background)
      await api.tabs.create({ url: msg.url as string, active: false, index: tab ? tab.index + 1 : undefined });
    else if (targetId) await api.tabs.update(targetId, { url: msg.url as string });
    else await api.tabs.create({ url: msg.url as string });
    sendResponse({ ok: true });
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
  (msg: BgMessage, sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    void (async () => {
      const handler = MESSAGE_HANDLERS[msg.type];
      if (handler) await handler(msg, sender, sendResponse);
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
  if (handler) await handler(p, sender);
}
