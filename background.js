// background.js (MV3 service worker)
// Owns browser data (all tabs, history, bookmarks, sessions) and executes
// actions on behalf of the overlay and popup.

const CHROME_PAGES = {
  settings: 'chrome://settings',
  extensions: 'chrome://extensions',
  history: 'chrome://history',
  downloads: 'chrome://downloads',
  bookmarks: 'chrome://bookmarks',
  newtab: 'chrome://newtab',
  passwords: 'chrome://password-manager/passwords',
  clearData: 'chrome://settings/clearBrowserData',
  appearance: 'chrome://settings/appearance'
};

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'open-palette') return;
  console.log('[CommandK] command received:', command);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' });
  } catch {
    // No content script in this tab yet (e.g. open before install/reload) —
    // inject, then open. Still a silent no-op on chrome://, error and store
    // pages, which hard-block all injection.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['phosphor-icons.js', 'shared.js', 'content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['host.css'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PALETTE' });
    } catch (e) { console.warn('[CommandK] cannot reach tab:', tab.url); }
  }
});

// Allow popup.html button to open palette in current tab
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'INIT_DATA': {
        const q = (msg.query || '').slice(0, 100);
        const [tabs, recentHistory, bookmarks, recentlyClosed] = await Promise.all([
          chrome.tabs.query({}),
          chrome.history.search({ text: q || '', maxResults: q ? 20 : 8, startTime: Date.now() - 30 * 864e5 }),
          queryBookmarks(q),
          chrome.sessions.getRecentlyClosed({ maxResults: 5 }).catch(() => [])
        ]);
        sendResponse({ tabs, recentHistory, bookmarks, recentlyClosed });
        break;
      }
      case 'SEARCH_HISTORY': {
        const r = await chrome.history.search({ text: msg.query || '', maxResults: 12 });
        sendResponse({ results: r });
        break;
      }
      case 'EXEC': {
        await execAction(msg.action, msg.payload, sender);
        sendResponse({ ok: true });
        break;
      }
      case 'NEW_TAB': {
        await chrome.tabs.create({ url: msg.url, active: true });
        sendResponse({ ok: true });
        break;
      }
      case 'OPEN_URL': {
        const tab = sender.tab;
        const targetId = msg.tabId ?? tab?.id;
        if (msg.background) await chrome.tabs.create({ url: msg.url, active: false, index: tab ? tab.index + 1 : undefined });
        else if (targetId) await chrome.tabs.update(targetId, { url: msg.url });
        else await chrome.tabs.create({ url: msg.url });
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
      const tree = await chrome.bookmarks.getTree();
      return flattenBookmarks(tree).slice(0, 30);
    }
    return await chrome.bookmarks.search(q.slice(0, 50));
  } catch { return []; }
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
      await chrome.tabs.update(p.tabId, { active: true });
      await chrome.windows.update(p.windowId, { focused: true });
      break;
    case 'close-tab': await chrome.tabs.remove(p.tabId ?? tabId); break;
    case 'close-others': {
      const all = await chrome.tabs.query({ windowId: p.windowId ?? tab?.windowId });
      await chrome.tabs.remove(all.filter(t => t.id !== (p.keepId ?? tabId)).map(t => t.id));
      break;
    }
    case 'close-right': {
      const all = await chrome.tabs.query({ windowId: p.windowId ?? tab?.windowId });
      const idx = all.find(t => t.id === tabId)?.index ?? 0;
      await chrome.tabs.remove(all.filter(t => t.index > idx).map(t => t.id));
      break;
    }
    case 'close-duplicates': {
      const all = await chrome.tabs.query({});
      const seen = new Set(); const dupes = [];
      for (const t of all) { if (!t.url) continue; if (seen.has(t.url)) dupes.push(t.id); else seen.add(t.url); }
      if (dupes.length) await chrome.tabs.remove(dupes);
      break;
    }
    case 'duplicate': await chrome.tabs.duplicate(tabId); break;
    case 'pin-toggle': {
      const t = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { pinned: !t.pinned });
      break;
    }
    case 'mute-toggle': {
      const t = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { muted: !t.mutedInfo?.muted });
      break;
    }
    case 'reload': await chrome.tabs.reload(tabId); break;
    case 'hard-reload': await chrome.tabs.reload(tabId, { bypassCache: true }); break;
    case 'go-back': await chrome.tabs.goBack(tabId).catch(() => {}); break;
    case 'go-forward': await chrome.tabs.goForward(tabId).catch(() => {}); break;
    case 'new-tab': await chrome.tabs.create({ url: p.url || 'chrome://newtab' }); break;
    case 'new-window': await chrome.windows.create({ url: p.url, incognito: !!p.incognito }); break;
    case 'reopen-closed': {
      const closed = await chrome.sessions.getRecentlyClosed({ maxResults: 1 });
      if (closed?.[0]?.tab) await chrome.sessions.restore(closed[0].tab.sessionId);
      else if (closed?.[0]?.window) await chrome.sessions.restore(closed[0].window.sessionId);
      break;
    }
    case 'move-to-new-window': {
      await chrome.windows.create({ tabId });
      break;
    }
    case 'group-tab': {
      const t = await chrome.tabs.get(tabId);
      if (t.groupId > 0) await chrome.tabs.ungroup(tabId);
      else await chrome.tabs.group({ tabIds: tabId });
      break;
    }
    case 'chrome-page': await chrome.tabs.create({ url: CHROME_PAGES[p.page] || 'chrome://newtab' }); break;
    case 'bookmark-tab': {
      const t = await chrome.tabs.get(tabId);
      await chrome.bookmarks.create({ title: t.title, url: t.url });
      break;
    }
    case 'screenshot': {
      const winId = p.windowId ?? (await chrome.windows.getCurrent()).id;
      const dataUrl = await chrome.tabs.captureVisibleTab(winId, { format: 'png' });
      await chrome.downloads.download({ url: dataUrl, filename: `commandk-${Date.now()}.png`, saveAs: false });
      break;
    }
    case 'discard': await chrome.tabs.discard(tabId); break;
  }
}
