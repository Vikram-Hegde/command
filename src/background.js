// @ts-check
// background.js — MV3 service worker (Chrome) / event page (Firefox).
// Owns browser data (all tabs, history, bookmarks, sessions) and executes
// actions on behalf of the overlay and popup.
import { api, page, newTab, saveImage } from './platform.js';

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
    switch (msg.type) {
      case 'INIT_DATA': {
        const q = (msg.query || '').slice(0, 100);
        const [tabs, recentHistory, bookmarks, recentlyClosed] = await Promise.all([
          api.tabs.query({}),
          api.history.search({ text: q || '', maxResults: q ? 20 : 8, startTime: Date.now() - 30 * 864e5 }),
          queryBookmarks(q),
          api.sessions.getRecentlyClosed({ maxResults: 5 }).catch(() => []),
        ]);
        sendResponse({ tabs, recentHistory, bookmarks, recentlyClosed });
        break;
      }
      case 'SEARCH_HISTORY': {
        const r = await api.history.search({ text: msg.query || '', maxResults: 12 });
        sendResponse({ results: r });
        break;
      }
      case 'EXEC': {
        await execAction(msg.action, msg.payload, sender);
        sendResponse({ ok: true });
        break;
      }
      case 'NEW_TAB': {
        await api.tabs.create({ url: msg.url, active: true });
        sendResponse({ ok: true });
        break;
      }
      case 'OPEN_URL': {
        const tab = sender.tab;
        const targetId = msg.tabId ?? tab?.id;
        if (msg.background)
          await api.tabs.create({ url: msg.url, active: false, index: tab ? tab.index + 1 : undefined });
        else if (targetId) await api.tabs.update(targetId, { url: msg.url });
        else await api.tabs.create({ url: msg.url });
        sendResponse({ ok: true });
        break;
      }
    }
  })();
  return true; // async
});

async function queryBookmarks(q) {
  try {
    if (!q) {
      const tree = await api.bookmarks.getTree();
      return flattenBookmarks(tree).slice(0, 30);
    }
    return await api.bookmarks.search(q.slice(0, 50));
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
  const tab = sender.tab;
  const tabId = p.tabId ?? tab?.id;
  switch (action) {
    case 'switch-tab':
      await api.tabs.update(p.tabId, { active: true });
      await api.windows.update(p.windowId, { focused: true });
      break;
    case 'close-tab':
      await api.tabs.remove(p.tabId ?? tabId);
      break;
    case 'close-others': {
      const all = await api.tabs.query({ windowId: p.windowId ?? tab?.windowId });
      await api.tabs.remove(all.filter((t) => t.id !== (p.keepId ?? tabId)).map((t) => t.id));
      break;
    }
    case 'close-right': {
      const all = await api.tabs.query({ windowId: p.windowId ?? tab?.windowId });
      const idx = all.find((t) => t.id === tabId)?.index ?? 0;
      await api.tabs.remove(all.filter((t) => t.index > idx).map((t) => t.id));
      break;
    }
    case 'close-duplicates': {
      const all = await api.tabs.query({});
      const seen = new Set();
      const dupes = [];
      for (const t of all) {
        if (!t.url) continue;
        if (seen.has(t.url)) dupes.push(t.id);
        else seen.add(t.url);
      }
      if (dupes.length) await api.tabs.remove(dupes);
      break;
    }
    case 'duplicate':
      await api.tabs.duplicate(tabId);
      break;
    case 'pin-toggle': {
      const t = await api.tabs.get(tabId);
      await api.tabs.update(tabId, { pinned: !t.pinned });
      break;
    }
    case 'mute-toggle': {
      const t = await api.tabs.get(tabId);
      await api.tabs.update(tabId, { muted: !t.mutedInfo?.muted });
      break;
    }
    case 'reload':
      await api.tabs.reload(tabId);
      break;
    case 'hard-reload':
      await api.tabs.reload(tabId, { bypassCache: true });
      break;
    case 'go-back':
      await api.tabs.goBack(tabId).catch(() => {});
      break;
    case 'go-forward':
      await api.tabs.goForward(tabId).catch(() => {});
      break;
    case 'new-tab':
      await api.tabs.create({ url: p.url || newTab });
      break;
    case 'new-window':
      await api.windows.create({ url: p.url, incognito: !!p.incognito });
      break;
    case 'reopen-closed': {
      const closed = await api.sessions.getRecentlyClosed({ maxResults: 1 });
      if (closed?.[0]?.tab) await api.sessions.restore(closed[0].tab.sessionId);
      else if (closed?.[0]?.window) await api.sessions.restore(closed[0].window.sessionId);
      break;
    }
    case 'move-to-new-window':
      await api.windows.create({ tabId });
      break;
    case 'group-tab': {
      if (!api.tabs.group) break; // Firefox has no tab groups
      const t = await api.tabs.get(tabId);
      if (t.groupId > 0) await api.tabs.ungroup(tabId);
      else await api.tabs.group({ tabIds: tabId });
      break;
    }
    case 'zoom': {
      const delta = p.delta || 0;
      if (!delta) await api.tabs.setZoom(tabId, 1);
      else {
        const current = await api.tabs.getZoom(tabId);
        await api.tabs.setZoom(tabId, Math.max(0.25, Math.min(5, +(current + delta).toFixed(2))));
      }
      break;
    }
    case 'chrome-page':
      await api.tabs.create({ url: page(p.page) });
      break;
    case 'bookmark-tab': {
      const t = await api.tabs.get(tabId);
      await api.bookmarks.create({ title: t.title, url: t.url });
      break;
    }
    case 'screenshot': {
      const winId = p.windowId ?? (await api.windows.getCurrent()).id;
      const dataUrl = await api.tabs.captureVisibleTab(winId, { format: 'png' });
      await saveImage(dataUrl, `commandk-${Date.now()}.png`);
      break;
    }
    case 'discard':
      if (api.tabs.discard) await api.tabs.discard(tabId);
      break;
  }
}
