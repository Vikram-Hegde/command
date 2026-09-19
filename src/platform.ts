/* platform.ts — the only module that knows about browser differences.
   It exposes capability flags plus a few adapters; every other module depends
   on those, never on the browser. */

export interface Caps {
  faviconCache: boolean;
  canDiscard: boolean;
  canGroup: boolean;
  dataUrlDownloads: boolean;
  captureNeedsRepaint: boolean;
}

export interface Manifest {
  permissions?: string[];
  browser_specific_settings?: unknown;
}

export function detectCaps(manifest: Manifest): Caps {
  const isFirefox = !!manifest.browser_specific_settings;
  return {
    faviconCache: (manifest.permissions || []).includes('favicon'),
    canDiscard: !isFirefox,
    canGroup: !isFirefox,
    dataUrlDownloads: !isFirefox,
    captureNeedsRepaint: !isFirefox,
  };
}

/** Firefox exposes promise-based `browser`; Chrome only `chrome`. */
export function getApi(): typeof chrome {
  return (
    (globalThis as unknown as { browser?: typeof chrome }).browser ??
    (globalThis as unknown as { chrome: typeof chrome }).chrome
  );
}
/** @type {any} */
export const api: typeof chrome = getApi();

export function getCaps(manifest?: Manifest): Caps {
  try {
    const m = manifest || (getApi().runtime.getManifest() as Manifest);
    return detectCaps(m);
  } catch {
    return {
      faviconCache: false,
      canDiscard: false,
      canGroup: false,
      dataUrlDownloads: false,
      captureNeedsRepaint: false,
    };
  }
}

export const caps: Caps = getCaps();

const CHROME_PAGES: Record<string, string> = {
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
const FIREFOX_PAGES: Record<string, string> = {
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

export function pagesFor(manifest: Manifest): Record<string, string> {
  return manifest.browser_specific_settings ? FIREFOX_PAGES : CHROME_PAGES;
}

function getPages(): Record<string, string> {
  try {
    return pagesFor(getApi().runtime.getManifest() as Manifest);
  } catch {
    return CHROME_PAGES;
  }
}
const pages = getPages();

export const page = (id: string): string => getPages()[id] || getPages().newtab;
export const newTab: string = pages.newtab;
export function getPage(id: string): string {
  return page(id);
}

export async function beforeCapture(): Promise<void> {
  if (!getCaps().captureNeedsRepaint || typeof requestAnimationFrame !== 'function') return;
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function saveImage(dataUrl: string, filename: string): Promise<number | undefined> {
  if (getCaps().dataUrlDownloads) {
    return getApi().downloads.download({ url: dataUrl, filename, saveAs: false });
  }
  const blob = await (await fetch(dataUrl)).blob();
  const url = URL.createObjectURL(blob);
  const dlApi = getApi().downloads;
  const id = (await dlApi.download({ url, filename, saveAs: false })) as unknown as number;
  const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
    const state = delta.state?.current;
    if (delta.id === id && (state === 'complete' || state === 'interrupted')) {
      URL.revokeObjectURL(url);
      dlApi.onChanged.removeListener(onChanged as never);
    }
  };
  dlApi.onChanged.addListener(onChanged as never);
  return id;
}
