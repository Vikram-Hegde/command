/* palette/state.ts — the explicit palette phase machine.
   phase is the only UI mode; scope is orthogonal, and help remembers where it
   came from so closing it always resumes the right mode. */

import type { Scope } from '../modes.js';
import type { DataCache, ResultItem } from '../shared.js';

export const PHASE = {
  SEARCH: 'search',
  NORMAL: 'normal',
  HELP: 'help',
} as const;

export type Phase = (typeof PHASE)[keyof typeof PHASE];
export type PhaseEvent =
  | { type: 'enter' }
  | { type: 'help' }
  | { type: 'dismiss-help' }
  | { type: 'search' }
  | { type: 'normal' }
  | { type: 'scope'; scope: Scope }
  | { type: 'escape' }
  | { type: 'close' };

export type PaletteEffect = 'focus' | 'blur' | 'render' | 'refresh' | 'close';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface PaletteState {
  phase: Phase;
  /** Mode to resume when help closes. */
  resume: 'search' | 'normal';
  scope: Scope;
  selected: number;
  filtered: ResultItem[];
  engine: string;
  cache: DataCache;
  load: LoadState;
}

export function createState(): PaletteState {
  return {
    phase: PHASE.SEARCH,
    resume: PHASE.SEARCH,
    scope: 'all',
    selected: 0,
    filtered: [],
    engine: 'google',
    cache: { tabs: [], bookmarks: [], history: [], closed: [] },
    load: 'idle',
  };
}

export function clampSelection(state: PaletteState, n: number): void {
  state.selected = Math.max(0, Math.min(n, state.filtered.length - 1));
}

/** Mutates the state and returns the side effects the host must run. */
export function transition(state: PaletteState, event: PhaseEvent): PaletteEffect[] {
  const effects: PaletteEffect[] = [];
  switch (event.type) {
    case 'enter':
      state.phase = PHASE.SEARCH;
      state.resume = PHASE.SEARCH;
      state.scope = 'all';
      state.selected = 0;
      state.filtered = [];
      state.load = 'idle';
      effects.push('focus', 'render');
      break;
    case 'help':
      if (state.phase === PHASE.HELP) return transition(state, { type: 'dismiss-help' });
      state.resume = state.phase === PHASE.NORMAL ? PHASE.NORMAL : PHASE.SEARCH;
      state.phase = PHASE.HELP;
      effects.push('blur', 'render');
      break;
    case 'dismiss-help':
      if (state.phase !== PHASE.HELP) break;
      state.phase = state.resume;
      effects.push(state.phase === PHASE.SEARCH ? 'focus' : 'blur', 'render');
      break;
    case 'search':
      if (state.phase === PHASE.SEARCH) break;
      state.phase = PHASE.SEARCH;
      effects.push('focus', 'render');
      break;
    case 'normal':
      if (state.phase === PHASE.NORMAL) break;
      state.phase = PHASE.NORMAL;
      effects.push('blur', 'render');
      break;
    case 'scope':
      state.scope = event.scope;
      if (state.phase !== PHASE.SEARCH) {
        state.phase = PHASE.SEARCH;
        effects.push('focus', 'render');
      }
      effects.push('refresh');
      break;
    case 'escape':
      if (state.phase === PHASE.HELP) return transition(state, { type: 'dismiss-help' });
      if (state.phase === PHASE.SEARCH) {
        state.phase = PHASE.NORMAL;
        effects.push('blur');
        break;
      }
      if (state.scope !== 'all') {
        state.scope = 'all';
        effects.push('refresh');
      } else {
        effects.push('close');
      }
      break;
    case 'close':
      effects.push('close');
      break;
  }
  return effects;
}
