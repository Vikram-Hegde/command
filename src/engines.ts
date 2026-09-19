/* engines.ts — search engine registry. */

export type EngineId = 'google' | 'duckduckgo' | 'bing' | 'perplexity';

export const ENGINES: Record<EngineId, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  perplexity: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
};

export const nextEngine = (cur: string): EngineId => {
  const order = Object.keys(ENGINES) as EngineId[];
  return order[(order.indexOf(cur as EngineId) + 1) % order.length];
};
