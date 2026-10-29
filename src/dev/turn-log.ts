/**
 * Opt-in turn log for the dev-test build only. Off by default. In memory.
 * Nothing is sent anywhere. Production never imports this file.
 */
import { stripPII } from "../core/summary";
import { promptIdForText } from "./synthetic";
import type { TurnReply } from "../core/dialog";

export const LOG_KEY = "jane.devtest.log";

export interface LogRow {
  time: string;
  arm: string;
  sha: string;
  runtime: string;
  coldLoadMs: number | null;
  engine?: string;
  reason?: string;
  cardId?: string;
  via?: string;
  ms: number;
  promptId?: string;
  text?: string;
  crisis?: boolean;
}

export interface LogMeta {
  arm: string;
  sha: string;
  runtime: string;
  coldLoadMs: number | null;
}

export interface TurnLogState {
  enabled: boolean;
  includeTyped: boolean;
  rows: LogRow[];
}

export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const mem: TurnLogState = { enabled: false, includeTyped: false, rows: [] };
let store: Store | null = null;

function ls(): Store | null {
  if (store) return store;
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}

export function setLogStore(s: Store | null): void {
  store = s;
}

export function logState(): TurnLogState {
  return mem;
}

export function isLogEnabled(): boolean {
  return mem.enabled;
}

export function setLogEnabled(on: boolean): void {
  mem.enabled = on;
  if (!on) persist();
  else persist();
}

export function setIncludeTyped(on: boolean): void {
  mem.includeTyped = on;
  persist();
}

export function restoreLog(): void {
  const raw = ls()?.getItem(LOG_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<TurnLogState>;
    mem.enabled = !!parsed.enabled;
    mem.includeTyped = !!parsed.includeTyped;
    mem.rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch { /* ignore */ }
}

function persist(): void {
  const s = ls();
  if (!s) return;
  if (!mem.enabled && mem.rows.length === 0) {
    s.removeItem(LOG_KEY);
    return;
  }
  try { s.setItem(LOG_KEY, JSON.stringify({ enabled: mem.enabled, includeTyped: mem.includeTyped, rows: mem.rows })); } catch { /* quota */ }
}

export function recordTurn(input: string, reply: TurnReply, ms: number, meta: LogMeta): void {
  if (!mem.enabled) return;
  const crisis = reply.kind === "crisis";
  const row: LogRow = {
    time: new Date().toISOString(),
    arm: meta.arm,
    sha: meta.sha,
    runtime: meta.runtime,
    coldLoadMs: meta.coldLoadMs,
    ms,
    ...(crisis ? { crisis: true } : {}),
  };
  if (reply.kind === "card") {
    row.engine = reply.engine;
    row.reason = reply.engineReason;
    row.cardId = reply.card.id;
    row.via = reply.via;
  } else if (reply.kind === "crisis") {
    row.engine = reply.engine ?? "rules-crisis";
  } else if (reply.kind === "referral") {
    row.engine = "rules-chip";
    row.via = "human-ask";
  }
  if (!crisis) {
    const id = promptIdForText(input);
    if (id) row.promptId = id;
    else if (mem.includeTyped) row.text = stripPII(input);
  }
  mem.rows.push(row);
  persist();
}

export function clearLog(): void {
  mem.rows = [];
  persist();
}

export function clearLogMemory(): void {
  mem.rows = [];
  // Keep the opt-in flags; wipe rows only (erase chat / quick exit).
}

export function exportLogBlob(): Blob {
  const body = JSON.stringify({ exported: new Date().toISOString(), rows: mem.rows }, null, 2);
  return new Blob([body], { type: "application/json" });
}

/** Download on-device. No fetch / XHR / beacon. */
export function downloadLog(): void {
  const blob = exportLogBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jane-devtest-log-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
