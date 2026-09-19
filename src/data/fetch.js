// @ts-check
/* data/fetch.js — background data fetching with sequence guard. */
import { api } from '../platform.js';

let seq = 0;

/** @returns {number} next sequence id */
export function nextSeq() {
  return ++seq;
}

/**
 * Fetch palette data; returns null when background is unreachable.
 * Second history search is merged if query present.
 * @param {string} q
 * @returns {Promise<{tabs:any[],bookmarks:any[],history:any[],closed:any[]}|null>}
 */
export async function fetchData(q) {
  try {
    const d = await api.runtime.sendMessage({ type: 'INIT_DATA', query: q });
    const data = {
      tabs: d.tabs || [],
      bookmarks: d.bookmarks || [],
      history: d.recentHistory || [],
      closed: d.recentlyClosed || [],
    };
    if (q) {
      try {
        const h = await api.runtime.sendMessage({ type: 'SEARCH_HISTORY', query: q });
        data.history = h.results || data.history;
      } catch {}
    }
    return data;
  } catch {
    return null;
  }
}
