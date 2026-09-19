// @ts-check
// background.js — MV3 service worker (Chrome) / event page (Firefox).
// Owns browser data (all tabs, history, bookmarks, sessions) and executes
// actions on behalf of the overlay and popup.
import { api } from './platform.js';
import { handlers } from './actions/handlers.js';

const MESSAGE_HANDLERS = {
  INIT_DATA: async (msg, _sender, sendResponse) => {
    const q = String(msg.query || '').slice(0, 100);
    const [tabs, recentHistory, bookmarks, recentlyClosed] = await Promise.all([
      api.tabs.query({}),
      api.history.search({ text: q || '', maxResults: q ? 20 : 8, startTime: Date.now() - 30 * 864e5 }),
      queryBookmarks(q),
      api.sessions.getRecentlyClosed({ maxResults: 5 }).catch(() => []),
    ]);
    sendResponse({ tabs, recentHistory, bookmarks, recentlyClosed });
  },
  SEARCH_HISTORY: async (msg, _sender, sendResponse) => {
    const r = await api.history.search({ text: String(msg.query || ''), maxResults: 12 });
    sendResponse({ results: r });
  },
  EXEC: async (msg, sender, sendResponse) => {
    await execAction(msg.action, msg.payload, sender);
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
    const targetId = msg.tabId ?? tab?.id;
    if (msg.background) await api.tabs.create({ url: msg.url, active: false, index: tab ? tab.index + 1 : undefined });
    else if (targetId) await api.tabs.update(targetId, { url: msg.url });
    else await api.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
  },
};

api.commands?.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await api.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' });
  } catch {
    // No content script in this tab yet (e.g. opened before install/reload):
    // inject, then open. Silent no-op on chrome://, error and store pages,
    // which block all injection.
    try {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await api.scripting.insertCSS({ target: { tabId: tab.id }, files: ['host.css'] });
      await api.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' });
    } catch {
      console.warn('[CommandK] cannot reach tab:', tab.url);
    }
  }
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const handler = MESSAGE_HANDLERS[msg.type];
    if (handler) await handler(msg, sender, sendResponse);
  })();
  return true; // async
});

async function queryBookmarks(q) {
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

function flattenBookmarks(nodes, out = []) {
  for (const n of nodes) {
    if (n.url) out.push(n);
    if (n.children) flattenBookmarks(n.children, out);
    if (out.length > 60) break;
  }
  return out;
}

async function execAction(action, p = {}, sender) {
  const handler = handlers[action];
  if (handler) await handler(p, sender);
}
