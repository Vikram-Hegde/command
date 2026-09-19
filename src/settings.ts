/* settings.ts — persisted user preferences. */
import { api } from './platform.js';

export async function getEngine(def = 'google'): Promise<string> {
  try {
    const r = await api.storage.local.get(['engine']);
    return ((r as Record<string, unknown>).engine as string) || def;
  } catch {
    return def;
  }
}

export function setEngine(engine: string): Promise<void> {
  return api.storage.local.set({ engine }).catch(() => {});
}
