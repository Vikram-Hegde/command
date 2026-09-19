/* search/url.ts — URL detection and normalization. */

export const isUrl = (q: string): boolean =>
  /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(q.trim()) && !q.includes(' ');

export const normUrl = (q: string): string => (/^https?:\/\//i.test(q) ? q : `https://${q}`);
