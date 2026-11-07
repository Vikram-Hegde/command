/* popup/reachability.ts — pure tab classification for the popup's mini palette. */

export type Restriction = 'settings' | 'extension' | 'store' | 'file';

export function classifyRestriction(url: string): Restriction | null {
  if (/^(chrome|chrome-error|about|edge|brave|opera|vivaldi):/.test(url)) return 'settings';
  if (/^(chrome|edge|moz|safari)-extension:/.test(url)) return 'extension';
  if (/chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url)) return 'store';
  return null;
}

export async function restrictionFor(
  url: string,
  fileAccessAllowed: () => Promise<boolean> = async () => false,
): Promise<Restriction | null> {
  const base = classifyRestriction(url);
  if (base) return base;
  if (url.startsWith('file://') && !(await fileAccessAllowed())) return 'file';
  return null;
}
