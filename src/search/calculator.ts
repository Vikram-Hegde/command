/* search/calculator.ts — safe math evaluator (no eval), supports + - * / ^, parens, %, unary. */

export const isMath = (q: string): boolean =>
  /^[0-9+\-*/().%^\s]+$/.test(q.trim()) && /\d/.test(q) && /[+\-*/%^]/.test(q);

type Token = { t: string; v?: number };

export function evalMath(q: string): number | null {
  const stripped = q.replace(/\s+/g, '');
  if (!stripped || stripped.length > 60) return null;
  const tokens: Token[] = [];
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
  const peek = (): Token | undefined => tokens[i];
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() && (peek()!.t === '+' || peek()!.t === '-')) {
      const op = tokens[i++].t;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() && (peek()!.t === '*' || peek()!.t === '/')) {
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
  function parseFactor(): number {
    if (peek() && (peek()!.t === '+' || peek()!.t === '-')) {
      const op = tokens[i++].t;
      const v = parseFactor();
      return op === '-' ? -v : v;
    }
    let v = parsePrimary();
    while (peek() && peek()!.t === '%') {
      i++;
      v /= 100;
    }
    if (peek() && peek()!.t === '^') {
      i++;
      v = Math.pow(v, parseFactor());
    }
    return v;
  }
  function parsePrimary(): number {
    const tk = peek();
    if (!tk) throw new Error('end');
    if (tk.t === 'n') {
      i++;
      return tk.v!;
    }
    if (tk.t === '(') {
      i++;
      const v = parseExpr();
      if (!peek() || peek()!.t !== ')') throw new Error('paren');
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
