// @ts-check
/* search/url.js — URL detection and normalization. */

/** @param {string} q */
export const isUrl = (q) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(q.trim()) && !q.includes(' ');

/** @param {string} q */
export const normUrl = (q) => (/^https?:\/\//i.test(q) ? q : `https://${q}`);
