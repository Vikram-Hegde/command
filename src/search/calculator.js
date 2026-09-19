// @ts-check
/* search/calculator.js — safe math evaluator (no eval), supports + - * / ^, parens, %, unary. */

/** @param {string} q */
export const isMath = (q) => /^[0-9+\-*/().%^\s]+$/.test(q.trim()) && /\d/.test(q) && /[+\-*/%^]/.test(q);

/**
 * @param {string} q
 * @returns {number | null}
 */
export function evalMath(q) {
  const stripped = q.replace(/\s+/g, '');
  if (!stripped || stripped.length > 60) return null;
  const tokens = [];
  let pos = 0;
  while (pos < stripped.length) {
    const num = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(stripped.slice(pos));
    if (num) {
      tokens.push({ t: 'n', v: parseFloat(num[0]) });
      pos += num[0].length;
      continue;
    }
    const ch = stripped[pos];
    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ t: ch });
      pos++;
      continue;
    }
    return null;
  }
  let i = 0;
  const peek = () => tokens[i];
  function parseExpr() {
    let v = parseTerm();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[i++].t;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = tokens[i++].t;
      const r = parseFactor();
      if (op === '*') v *= r;
      else {
        if (r === 0) throw new Error('div0');
        v /= r;
      }
    }
    return v;
  }
  function parseFactor() {
    if (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[i++].t;
      const v = parseFactor();
      return op === '-' ? -v : v;
    }
    let v = parsePrimary();
    while (peek() && peek().t === '%') {
      i++;
      v /= 100;
    }
    if (peek() && peek().t === '^') {
      i++;
      v = Math.pow(v, parseFactor());
    }
    return v;
  }
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('end');
    if (tk.t === 'n') {
      i++;
      return tk.v;
    }
    if (tk.t === '(') {
      i++;
      const v = parseExpr();
      if (!peek() || peek().t !== ')') throw new Error('paren');
      i++;
      return v;
    }
    throw new Error('token');
  }
  try {
    const v = parseExpr();
    if (i !== tokens.length) return null;
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.round(v * 1e8) / 1e8;
  } catch {
    return null;
  }
}
