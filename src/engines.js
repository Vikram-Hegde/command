// @ts-check
/* engines.js — search engine registry. */

export const ENGINES = {
  google: (/** @type {string} */ q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (/** @type {string} */ q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  bing: (/** @type {string} */ q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  perplexity: (/** @type {string} */ q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
};

/** @param {string} cur */
export const nextEngine = (cur) => {
  const order = Object.keys(ENGINES);
  return order[(order.indexOf(cur) + 1) % order.length];
};
