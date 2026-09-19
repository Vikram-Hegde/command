// @ts-check
/* search/fuzzy.js — subsequence match; earlier starts, word boundaries and runs score higher. */

export function fuzzyScore(q, text) {
  q = q.toLowerCase();
  text = (text || '').toLowerCase();
  if (!q) return 1;
  let qi = 0;
  let score = 0;
  let consec = 0;
  let lastIdx = -2;
  for (let i = 0; i < text.length && qi < q.length; i++) {
    if (text[i] === q[qi]) {
      let s = 1;
      if (i === 0) s += 6;
      else if (/[\s\-_/.:]/.test(text[i - 1])) s += 4;
      if (i === lastIdx + 1) {
        consec++;
        s += 2 + consec;
      } else consec = 0;
      score += s;
      lastIdx = i;
      qi++;
    }
  }
  return qi === q.length ? score - text.length * 0.01 : -Infinity;
}

/** @param {string} q @param {...string} fields */
export const match = (q, ...fields) => Math.max(...fields.map((f) => fuzzyScore(q, f)));
