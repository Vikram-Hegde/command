// @ts-check
/* actions/handlers.js — background execution map (no switch). */
import { api, page, newTab, saveImage } from '../platform.js';

/**
 * @typedef {(payload:Record<string,any>, sender:chrome.runtime.MessageSender)=>Promise<void>} Handler
 * @type {Record<string, Handler>}
 */
export const handlers = {
  'switch-tab': async (p) => {
    await api.tabs.update(p.tabId, { active: true });
    await api.windows.update(p.windowId, { focused: true });
  },
  'close-tab': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.tabs.remove(tabId);
  },
  'close-others': async (p, sender) => {
    const keepId = p.keepId ?? p.tabId ?? sender.tab?.id;
    const windowId = p.windowId ?? sender.tab?.windowId;
    const all = await api.tabs.query(windowId ? { windowId } : {});
    await api.tabs.remove(all.filter((t) => t.id !== keepId).map((t) => t.id));
  },
  'close-right': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    const windowId = p.windowId ?? sender.tab?.windowId;
    const all = await api.tabs.query(windowId ? { windowId } : {});
    const idx = all.find((t) => t.id === tabId)?.index ?? 0;
    await api.tabs.remove(all.filter((t) => t.index > idx).map((t) => t.id));
  },
  'close-duplicates': async () => {
    const all = await api.tabs.query({});
    const seen = new Set();
    const dupes = [];
    for (const t of all) {
      if (!t.url) continue;
      if (seen.has(t.url)) dupes.push(t.id);
      else seen.add(t.url);
    }
    if (dupes.length) await api.tabs.remove(dupes);
  },
  duplicate: async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.tabs.duplicate(tabId);
  },
  'pin-toggle': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    const t = await api.tabs.get(tabId);
    await api.tabs.update(tabId, { pinned: !t.pinned });
  },
  'mute-toggle': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    const t = await api.tabs.get(tabId);
    await api.tabs.update(tabId, { muted: !t.mutedInfo?.muted });
  },
  reload: async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.tabs.reload(tabId);
  },
  'hard-reload': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.tabs.reload(tabId, { bypassCache: true });
  },
  'go-back': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.tabs.goBack(tabId).catch(() => {});
  },
  'go-forward': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.tabs.goForward(tabId).catch(() => {});
  },
  'new-tab': async (p) => {
    await api.tabs.create({ url: p.url || newTab });
  },
  'new-window': async (p) => {
    await api.windows.create({ url: p.url, incognito: !!p.incognito });
  },
  'reopen-closed': async () => {
    const closed = await api.sessions.getRecentlyClosed({ maxResults: 1 });
    if (closed?.[0]?.tab) await api.sessions.restore(closed[0].tab.sessionId);
    else if (closed?.[0]?.window) await api.sessions.restore(closed[0].window.sessionId);
  },
  'move-to-new-window': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    await api.windows.create({ tabId });
  },
  'group-tab': async (p, sender) => {
    if (!api.tabs.group) return;
    const tabId = p.tabId ?? sender.tab?.id;
    const t = await api.tabs.get(tabId);
    if (t.groupId > 0) await api.tabs.ungroup(tabId);
    else await api.tabs.group({ tabIds: tabId });
  },
  zoom: async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    const delta = p.delta || 0;
    if (!delta) await api.tabs.setZoom(tabId, 1);
    else {
      const current = await api.tabs.getZoom(tabId);
      await api.tabs.setZoom(tabId, Math.max(0.25, Math.min(5, +(current + delta).toFixed(2))));
    }
  },
  'chrome-page': async (p) => {
    await api.tabs.create({ url: page(p.page) });
  },
  'bookmark-tab': async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    const t = await api.tabs.get(tabId);
    await api.bookmarks.create({ title: t.title, url: t.url });
  },
  screenshot: async (p) => {
    const winId = p.windowId ?? (await api.windows.getCurrent()).id;
    const dataUrl = await api.tabs.captureVisibleTab(winId, { format: 'png' });
    await saveImage(dataUrl, `commandk-${Date.now()}.png`);
  },
  discard: async (p, sender) => {
    const tabId = p.tabId ?? sender.tab?.id;
    if (api.tabs.discard) await api.tabs.discard(tabId);
  },
};
