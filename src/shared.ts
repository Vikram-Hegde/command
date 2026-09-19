/* shared.ts — facade that re-exports modularized helpers. */

import type { Action } from './actions/registry.js';
import type { Caps } from './platform.js';

export interface ResultItem {
  kind: 'tab' | 'action' | 'bookmark' | 'history' | 'calc' | 'url' | 'search';
  group: string;
  title: string;
  subtitle?: string;
  icon?: string;
  url?: string;
  directIcon?: string;
  tabId?: number;
  windowId?: number;
  active?: boolean;
  actionId?: string;
  value?: string;
  def?: Action;
  score: number;
}

export interface DataCache {
  tabs: unknown[];
  bookmarks: unknown[];
  history: unknown[];
  closed: unknown[];
}

export type { Caps };

// engines
export { ENGINES, nextEngine } from './engines.js';
export type { EngineId } from './engines.js';
// data
export { fetchData } from './data/fetch.js';
// search
export { match, fuzzyScore } from './search/fuzzy.js';
export { isMath, evalMath } from './search/calculator.js';
export { isUrl, normUrl } from './search/url.js';
export { buildItems } from './search/ranking.js';
export type { BuildOpts } from './search/ranking.js';
// modes
export { MODES, modeById, modeByKey, scopedItems, helpHtml, commandIntent } from './modes.js';
export type { Mode, Intent } from './modes.js';
// ui
export { escHtml, advanceFav, itemsHtml, emptyHtml } from './ui/render.js';
// actions
export { ACTIONS, actionById } from './actions/registry.js';
export type { Action } from './actions/registry.js';
