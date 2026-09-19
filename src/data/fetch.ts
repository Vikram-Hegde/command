/* data/fetch.ts — background data fetching with sequence guard. */
import { api } from '../platform.js';
import type { DataCache } from '../shared.js';

let seq = 0;

export function nextSeq(): number {
  return ++seq;
}

export async function fetchData(q: string): Promise<DataCache | null> {
  try {
    const d = (await api.runtime.sendMessage({ type: 'INIT_DATA', query: q })) as Record<string, unknown>;
    const data: DataCache = {
      tabs: (d.tabs as unknown[]) || [],
      bookmarks: (d.bookmarks as unknown[]) || [],
      history: (d.recentHistory as unknown[]) || [],
      closed: (d.recentlyClosed as unknown[]) || [],
    };
    if (q) {
      try {
        const h = (await api.runtime.sendMessage({ type: 'SEARCH_HISTORY', query: q })) as Record<string, unknown>;
        data.history = (h.results as unknown[]) || data.history;
      } catch {}
    }
    return data;
  } catch {
    return null;
  }
}
