/* platform.js — the only file that knows about browser differences.
   Loaded first in content scripts and the popup, and in the background (Chrome
   service worker via importScripts, Firefox event page via background.scripts).
   Exposes a capability object plus a few adapters, so generic code asks for
   capabilities instead of branching on the browser. */

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  // Firefox is the only engine that accepts browser_specific_settings.
  const isFirefox = !!api.runtime.getManifest().browser_specific_settings;
  const permissions = api.runtime.getManifest().permissions || [];

  // Chrome has chrome:// pages; Firefox has about: pages.
  const pages = isFirefox
    ? {
        settings: 'about:preferences', extensions: 'about:addons', history: 'about:history',
        downloads: 'about:downloads', bookmarks: 'about:bookmarks', newtab: 'about:newtab',
        passwords: 'about:logins', clearData: 'about:preferences#privacy',
        appearance: 'about:preferences#appearance'
      }
    : {
        settings: 'chrome://settings', extensions: 'chrome://extensions', history: 'chrome://history',
        downloads: 'chrome://downloads', bookmarks: 'chrome://bookmarks', newtab: 'chrome://newtab',
        passwords: 'chrome://password-manager/passwords', clearData: 'chrome://settings/clearBrowserData',
        appearance: 'chrome://settings/appearance'
      };

  globalThis.CMDK_PLATFORM = {
    api,
    caps: {
      // Chrome exposes the /_favicon/ cache via the "favicon" permission.
      faviconCache: permissions.includes('favicon'),
      canDiscard: !isFirefox,
      canGroup: !isFirefox,
      // Firefox rejects data: URLs in downloads.download().
      dataUrlDownloads: !isFirefox,
      // Chrome captures the current frame, so the overlay must repaint first.
      captureNeedsRepaint: !isFirefox
    },
    page: id => pages[id] || pages.newtab,
    newTab: pages.newtab,
    // Let the page repaint (overlay closing) before a screenshot is captured.
    async beforeCapture() {
      if (!this.caps.captureNeedsRepaint || typeof requestAnimationFrame !== 'function') return;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
    // Firefox needs a blob: URL; Chrome can take the data: URL directly.
    async saveImage(dataUrl, filename) {
      if (this.caps.dataUrlDownloads) {
        return api.downloads.download({ url: dataUrl, filename, saveAs: false });
      }
      const blob = await (await fetch(dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const id = await api.downloads.download({ url, filename, saveAs: false });
      const onChanged = delta => {
        const state = delta.state?.current;
        if (delta.id === id && (state === 'complete' || state === 'interrupted')) {
          URL.revokeObjectURL(url);
          api.downloads.onChanged.removeListener(onChanged);
        }
      };
      api.downloads.onChanged.addListener(onChanged);
      return id;
    }
  };
})();
