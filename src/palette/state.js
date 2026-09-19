// @ts-check
/* palette/state.js — shared UI state machine (NORMAL/SEARCH/HELP + mode). */

export const UI = {
  SEARCH: 'search',
  NORMAL: 'normal',
};

/**
 * @typedef {Object} PaletteState
 * @property {string} mode
 * @property {string} ui
 * @property {boolean} help
 * @property {number} selected
 * @property {any[]} filtered
 * @property {string} engine
 * @property {{tabs:any[],bookmarks:any[],history:any[],closed:any[]}} cache
 */

/** @returns {PaletteState} */
export function createState() {
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

/**
 * Clamp selection without rebuilding DOM.
 * @param {PaletteState} state
 * @param {number} n
 */
export function clampSelection(state, n) {
  state.selected = Math.max(0, Math.min(n, state.filtered.length - 1));
}
