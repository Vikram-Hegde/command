/* palette/state.ts — shared UI state machine (NORMAL/SEARCH/HELP + mode). */

import type { DataCache, ResultItem } from '../shared.js';

export const UI = {
  SEARCH: 'search',
  NORMAL: 'normal',
} as const;

export type UIState = (typeof UI)[keyof typeof UI];

export interface PaletteState {
  mode: string;
  ui: UIState;
  help: boolean;
  selected: number;
  filtered: ResultItem[];
  engine: string;
  cache: DataCache;
}

export function createState(): PaletteState {
  return {
    mode: 'all',
    ui: UI.SEARCH,
    help: false,
    selected: 0,
    filtered: [],
    engine: 'google',
    cache: { tabs: [], bookmarks: [], history: [], closed: [] },
  };
}

export function clampSelection(state: PaletteState, n: number): void {
  state.selected = Math.max(0, Math.min(n, state.filtered.length - 1));
}
