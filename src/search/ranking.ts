/* search/ranking.ts — ranking strategy and item building. */
import { caps as platformCaps, type Caps } from '../platform.js';
import { ENGINES } from '../engines.js';
import { ACTIONS } from '../actions/registry.js';
import { match } from './fuzzy.js';
import { evalMath, isMath } from './calculator.js';
import { isUrl, normUrl } from './url.js';
import { scopedItems } from '../modes.js';
import type { DataCache, ResultItem } from '../shared.js';

const GROUP_ORDER: Record<string, number> = {
  Calculator: 0,
  'Go To': 1,
  Search: 2,
  'Current / Open Tabs': 3,
  'Open Tabs': 4,
  Actions: 5,
  Bookmarks: 6,
  History: 7,
  'Recently Closed': 8,
};

const RANK = {
  calc: (it: ResultItem): number => (it.kind === 'calc' ? 0 : it.kind === 'url' ? 1 : it.kind === 'search' ? 3 : 2),
};

export interface BuildOpts {
  engine?: string;
  includePageOnly?: boolean;
  tabLimit?: number;
  tabMatchLimit?: number;
  caps?: Caps;
}

export function buildItems(
  q: string,
  scope: string,
  data: DataCache,
  { engine = 'google', includePageOnly = true, tabLimit = 6, tabMatchLimit = 8, caps = platformCaps }: BuildOpts = {},
): ResultItem[] {
  const out: ResultItem[] = [];
  const ql = (q || '').trim().toLowerCase();
  const tabs = (data.tabs as unknown as chrome.tabs.Tab[]) || [];
  const bookmarks = (data.bookmarks as unknown as chrome.bookmarks.BookmarkTreeNode[]) || [];
  const history = (data.history as unknown as chrome.history.HistoryItem[]) || [];
  const closed = (data.closed as unknown as { tab?: chrome.tabs.Tab }[]) || [];

  const tabItems: ResultItem[] = tabs
    .map((t) => ({
      kind: 'tab' as const,
      group: t.active ? 'Current / Open Tabs' : 'Open Tabs',
      title: t.title || t.url || '',
      subtitle: t.url,
      icon: 'globe',
      url: t.url,
      directIcon: (t as unknown as { favIconUrl?: string }).favIconUrl,
      tabId: t.id,
      windowId: t.windowId,
      active: t.active,
      score: ql ? match(ql, t.title, t.url) : t.active ? 999 : 50 - (t.index ?? 0) * 0.1,
    }))
    .filter((t) => t.score > -Infinity);
  out.push(...tabItems.sort((a, b) => b.score - a.score).slice(0, ql ? tabMatchLimit : tabLimit));

  for (const a of ACTIONS) {
    if (a.pageOnly && !includePageOnly) continue;
    if (a.requires && !((caps as unknown as Record<string, unknown>)[a.requires] as boolean)) continue;
    const s = ql ? match(ql, a.title, a.kw) : 5;
    if (s > -Infinity && (!ql || s > 0))
      out.push({
        kind: 'action',
        group: 'Actions',
        title: a.title,
        subtitle: a.hint,
        icon: a.icon,
        actionId: a.id,
        def: a,
        score: s + 20,
      });
  }
  for (const b of (bookmarks as { url?: string; title?: string }[]).slice(0, 30)) {
    if (!b.url) continue;
    const s = ql ? match(ql, b.title, b.url) : 1;
    if (s > -Infinity && (!ql || s > 0))
      out.push({
        kind: 'bookmark',
        group: 'Bookmarks',
        title: b.title || b.url!,
        subtitle: b.url,
        icon: 'bookmark-simple',
        url: b.url,
        score: s + 10,
      });
  }
  for (const h of (history as { url?: string; title?: string }[]).slice(0, 20)) {
    if (!h.url || h.url.startsWith('chrome://')) continue;
    const s = ql ? match(ql, h.title, h.url) : 0.5;
    if (s > -Infinity && (!ql || s > 0))
      out.push({
        kind: 'history',
        group: 'History',
        title: h.title || h.url!,
        subtitle: h.url,
        icon: 'clock',
        url: h.url,
        score: s,
      });
  }
  for (const c of closed) {
    const t = c.tab as { url?: string; title?: string } | undefined;
    if (!t?.url) continue;
    const s = ql ? match(ql, t.title, t.url) : 0;
    if (!ql || s > 0)
      out.push({
        kind: 'history',
        group: 'Recently Closed',
        title: '↩ ' + (t.title || t.url),
        subtitle: t.url,
        icon: 'clock',
        url: t.url,
        score: s + 2,
      });
  }

  if (q && isMath(q)) {
    const v = evalMath(q);
    if (v !== null)
      out.unshift({
        kind: 'calc',
        group: 'Calculator',
        title: `${q.trim()} = ${v}`,
        subtitle: 'Enter to copy result',
        icon: 'calculator',
        value: String(v),
        score: 1e6,
      });
  }
  if (ql) {
    if (isUrl(ql))
      out.unshift({
        kind: 'url',
        group: 'Go To',
        title: normUrl(ql),
        subtitle: 'Open URL',
        icon: 'globe',
        url: normUrl(ql),
        score: 1e5,
      });
    const engineFn = (ENGINES as Record<string, (q: string) => string>)[engine] || ENGINES.google;
    out.unshift({
      kind: 'search',
      group: 'Search',
      title: `Search ${engine} for “${q.trim()}”`,
      subtitle: 'Enter to search',
      icon: 'magnifying-glass',
      url: engineFn(q.trim()),
      score: 1e5 - 1,
    });
  }

  const sorted = out.sort((a, b) => {
    if (RANK.calc(a) !== RANK.calc(b)) return RANK.calc(a) - RANK.calc(b);
    return (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9) || b.score - a.score;
  });
  return scopedItems(sorted, scope);
}
