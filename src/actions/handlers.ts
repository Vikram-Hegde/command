/* actions/handlers.ts — background execution map (no switch). */
import { api, page, newTab, saveImage } from '../platform.js';

export type Handler = (payload: Record<string, unknown>, sender: chrome.runtime.MessageSender) => Promise<void>;

export const handlers: Record<string, Handler> = {
  'switch-tab': async (p) => {
    await api.tabs.update(p.tabId as number, { active: true });
    await api.windows.update(p.windowId as number, { focused: true });
  },
  'close-tab': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null) await api.tabs.remove(tabId);
  },
  'close-others': async (p, sender) => {
    const keepId = (p.keepId as number | undefined) ?? (p.tabId as number | undefined) ?? sender.tab?.id;
    const windowId = (p.windowId as number | undefined) ?? sender.tab?.windowId;
    const all = await api.tabs.query(windowId ? { windowId } : {});
    await api.tabs.remove(all.filter((t) => t.id !== keepId).map((t) => t.id!) as number[]);
  },
  'close-right': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    const windowId = (p.windowId as number | undefined) ?? sender.tab?.windowId;
    const all = await api.tabs.query(windowId ? { windowId } : {});
    const idx = all.find((t) => t.id === tabId)?.index ?? 0;
    await api.tabs.remove(all.filter((t) => (t.index ?? 0) > idx).map((t) => t.id!) as number[]);
  },
  'close-duplicates': async () => {
    const all = await api.tabs.query({});
    const seen = new Set<string>();
    const dupes: number[] = [];
    for (const t of all) {
      if (!t.url) continue;
      if (seen.has(t.url)) dupes.push(t.id!);
      else seen.add(t.url);
    }
    if (dupes.length) await api.tabs.remove(dupes);
  },
  duplicate: async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null) await api.tabs.duplicate(tabId);
  },
  'pin-toggle': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId == null) return;
    const t = await api.tabs.get(tabId);
    await api.tabs.update(tabId, { pinned: !t.pinned });
  },
  'mute-toggle': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId == null) return;
    const t = await api.tabs.get(tabId);
    await api.tabs.update(tabId, { muted: !t.mutedInfo?.muted });
  },
  reload: async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null) await api.tabs.reload(tabId);
  },
  'hard-reload': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null) await api.tabs.reload(tabId, { bypassCache: true });
  },
  'go-back': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null)
      await (api.tabs as unknown as { goBack: (id: number) => Promise<void> }).goBack(tabId).catch(() => {});
  },
  'go-forward': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null)
      await (api.tabs as unknown as { goForward: (id: number) => Promise<void> }).goForward(tabId).catch(() => {});
  },
  'new-tab': async (p) => {
    await api.tabs.create({ url: (p.url as string | undefined) || newTab });
  },
  'new-window': async (p) => {
    await api.windows.create({ url: p.url as string | undefined, incognito: !!p.incognito });
  },
  'reopen-closed': async () => {
    const closed = (await api.sessions.getRecentlyClosed({ maxResults: 1 })) as unknown as {
      tab?: { sessionId: string };
      window?: { sessionId: string };
    }[];
    if (closed?.[0]?.tab) await api.sessions.restore(closed[0].tab.sessionId);
    else if (closed?.[0]?.window) await api.sessions.restore(closed[0].window.sessionId);
  },
  'move-to-new-window': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null) await api.windows.create({ tabId });
  },
  'group-tab': async (p, sender) => {
    if (!(api.tabs as unknown as { group?: unknown }).group) return;
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId == null) return;
    const t = (await api.tabs.get(tabId)) as unknown as { groupId: number };
    if (t.groupId > 0) await (api.tabs as unknown as { ungroup: (id: number) => Promise<void> }).ungroup(tabId);
    else await (api.tabs as unknown as { group: (opts: { tabIds: number }) => Promise<void> }).group({ tabIds: tabId });
  },
  zoom: async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId == null) return;
    const delta = (p.delta as number | undefined) || 0;
    if (!delta) await api.tabs.setZoom(tabId, 1);
    else {
      const current = await api.tabs.getZoom(tabId);
      await api.tabs.setZoom(tabId, Math.max(0.25, Math.min(5, +(current + delta).toFixed(2))));
    }
  },
  'chrome-page': async (p) => {
    await api.tabs.create({ url: page(p.page as string) });
  },
  'bookmark-tab': async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId == null) return;
    const t = await api.tabs.get(tabId);
    await api.bookmarks.create({ title: t.title, url: t.url });
  },
  screenshot: async (p) => {
    const winId = (p.windowId as number | undefined) ?? (await api.windows.getCurrent()).id;
    const dataUrl = await api.tabs.captureVisibleTab(winId!, { format: 'png' });
    await saveImage(dataUrl, `commandk-${Date.now()}.png`);
  },
  discard: async (p, sender) => {
    const tabId = (p.tabId as number | undefined) ?? sender.tab?.id;
    if (tabId != null && (api.tabs as unknown as { discard?: (id: number) => Promise<void> }).discard)
      await (api.tabs as unknown as { discard: (id: number) => Promise<void> }).discard(tabId);
  },
};
