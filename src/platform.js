// @ts-check
/* platform.js — the only module that knows about browser differences.
   It exposes capability flags plus a few adapters; every other module depends
   on those, never on the browser. */

/**
 * @typedef {Object} Caps
 * @property {boolean} faviconCache   Chrome's /_favicon/ cache is available.
 * @property {boolean} canDiscard     tabs.discard() exists.
 * @property {boolean} canGroup       tabs.group()/ungroup() exist.
 * @property {boolean} dataUrlDownloads downloads.download() accepts data: URLs.
 * @property {boolean} captureNeedsRepaint The overlay must repaint before capture.
 */

/**
 * Derive capabilities from a manifest. Exported so tests can check each target
 * without reloading the module.
 * @param {{ permissions?: string[], browser_specific_settings?: unknown }} manifest
 * @returns {Caps}
 */
export function detectCaps(manifest) {
  const isFirefox = !!manifest.browser_specific_settings;
  return {
    faviconCache: (manifest.permissions || []).includes('favicon'),
    canDiscard: !isFirefox,
    canGroup: !isFirefox,
    dataUrlDownloads: !isFirefox,
    captureNeedsRepaint: !isFirefox,
  };
}

/** @type {any} Firefox exposes promise-based `browser`; Chrome only `chrome`. */
export const api = globalThis.browser ?? globalThis.chrome;

/** @type {Caps} */
export const caps = detectCaps(api.runtime.getManifest());

/** Internal pages per engine: chrome://… vs about:… @type {Record<string,string>} */
const CHROME_PAGES = {
  settings: 'chrome://settings',
  extensions: 'chrome://extensions',
  history: 'chrome://history',
  downloads: 'chrome://downloads',
  bookmarks: 'chrome://bookmarks',
  newtab: 'chrome://newtab',
  passwords: 'chrome://password-manager/passwords',
  clearData: 'chrome://settings/clearBrowserData',
  appearance: 'chrome://settings/appearance',
};
const FIREFOX_PAGES = {
  settings: 'about:preferences',
  extensions: 'about:addons',
  history: 'about:history',
  downloads: 'about:downloads',
  bookmarks: 'about:bookmarks',
  newtab: 'about:newtab',
  passwords: 'about:logins',
  clearData: 'about:preferences#privacy',
  appearance: 'about:preferences#appearance',
};

/**
 * @param {{ browser_specific_settings?: unknown }} manifest
 * @returns {Record<string, string>}
 */
export function pagesFor(manifest) {
  return manifest.browser_specific_settings ? FIREFOX_PAGES : CHROME_PAGES;
}

const pages = pagesFor(api.runtime.getManifest());

/** @param {string} id @returns {string} */
export const page = (id) => pages[id] || pages.newtab;
export const newTab = pages.newtab;

/** Let the page repaint (overlay closing) before a screenshot is captured. */
export async function beforeCapture() {
  if (!caps.captureNeedsRepaint || typeof requestAnimationFrame !== 'function') return;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/**
 * Save an image data URL. Firefox rejects data: URLs in downloads.download(),
 * so it gets a blob: URL; Chrome's service worker can't create object URLs and
 * accepts data: anyway.
 * @param {string} dataUrl
 * @param {string} filename
 */
export async function saveImage(dataUrl, filename) {
  if (caps.dataUrlDownloads) {
    return api.downloads.download({ url: dataUrl, filename, saveAs: false });
  }
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const id = await api.downloads.download({ url, filename, saveAs: false });
  const onChanged = (delta) => {
    const state = delta.state?.current;
    if (delta.id === id && (state === 'complete' || state === 'interrupted')) {
      URL.revokeObjectURL(url);
      api.downloads.onChanged.removeListener(onChanged);
    }
  };
  api.downloads.onChanged.addListener(onChanged);
  return id;
}
