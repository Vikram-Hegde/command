// @ts-check
/* settings.js — persisted user preferences. */
import { api } from './platform.js';

/** @param {string} def */
export async function getEngine(def = 'google') {
  try {
    const r = await api.storage.local.get(['engine']);
    return r.engine || def;
  } catch {
    return def;
  }
}

/** @param {string} engine */
export function setEngine(engine) {
  return api.storage.local.set({ engine }).catch(() => {});
}
