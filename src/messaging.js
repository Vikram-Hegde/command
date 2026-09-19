// @ts-check
/* messaging.js — typed message definitions and helpers. */

/**
 * @typedef {{ type:'INIT_DATA', query:string }} InitDataMsg
 * @typedef {{ type:'SEARCH_HISTORY', query:string }} SearchHistoryMsg
 * @typedef {{ type:'EXEC', action:string, payload:Record<string,any> }} ExecMsg
 * @typedef {{ type:'NEW_TAB', url:string }} NewTabMsg
 * @typedef {{ type:'OPEN_URL', url:string, tabId?:number, background?:boolean }} OpenUrlMsg
 * @typedef {{ type:'TOGGLE_PALETTE' }} ToggleMsg
 * @typedef {InitDataMsg|SearchHistoryMsg|ExecMsg|NewTabMsg|OpenUrlMsg|ToggleMsg} Message
 */

import { api } from './platform.js';

/**
 * Send a runtime message and return the response.
 * @template T
 * @param {Message} msg
 * @returns {Promise<T>}
 */
export function send(msg) {
  return api.runtime.sendMessage(msg);
}

/** @param {string} url */
export function newTab(url) {
  return send({ type: 'NEW_TAB', url });
}

/**
 * @param {string} url
 * @param {{ tabId?:number, background?:boolean }} [opts]
 */
export function openUrl(url, opts = {}) {
  return send({ type: 'OPEN_URL', url, ...opts });
}

/**
 * @param {string} action
 * @param {Record<string,any>} [payload]
 */
export function exec(action, payload = {}) {
  return send({ type: 'EXEC', action, payload });
}
