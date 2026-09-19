/* messaging.ts — typed message definitions and helpers. */

import { api } from './platform.js';

export type InitDataMsg = { type: 'INIT_DATA'; query: string };
export type SearchHistoryMsg = { type: 'SEARCH_HISTORY'; query: string };
export type ExecMsg = { type: 'EXEC'; action: string; payload: Record<string, unknown> };
export type NewTabMsg = { type: 'NEW_TAB'; url: string };
export type OpenUrlMsg = { type: 'OPEN_URL'; url: string; tabId?: number; background?: boolean };
export type ToggleMsg = { type: 'TOGGLE_PALETTE' };
export type Message = InitDataMsg | SearchHistoryMsg | ExecMsg | NewTabMsg | OpenUrlMsg | ToggleMsg;

export function send<T = unknown>(msg: Message): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

export function newTab(url: string): Promise<unknown> {
  return send({ type: 'NEW_TAB', url });
}

export function openUrl(url: string, opts: { tabId?: number; background?: boolean } = {}): Promise<unknown> {
  return send({ type: 'OPEN_URL', url, ...opts });
}

export function exec(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
  return send({ type: 'EXEC', action, payload });
}
