import type { CardNext } from "./bank";
import { CHAT_HISTORY_TURNS } from "../config";
import type { ChatLang } from "../llm/chat-lang";
import { normalize } from "./text";

/**
 * Pure chat-first state machine (plan §2). No I/O, no model.
 * Dialog calls planTurn() after crisis/guard/human, then apply* to update memory-only state.
 */

export const SHOW_CARD_NOW = "ขอข้อมูลเลย";
/** DRAFT. Keng review required before this string is treated as product copy. Same behaviour as ขอข้อมูลเลย. */
export const SHOW_CARD_NOW_EN = "Just show me the info";
export const SHOW_CARD_NOW_EN_STATUS = "draft" as const;
export const SHOW_CARD_NOW_ID = "chat.show_now";

export type ChatPhase = "chat" | "after";
export type ChatClose = "always" | "if-pick" | "never";
export type ChatPlanReason =
  | "crisis"
  | "banner"
  | "guard"
  | "human"
  | "chip"
  | "show-now"
  | "locked"
  | "post-crisis"
  | "chat";

export interface ChatFlowState {
  phase: ChatPhase;
  /** User turns in the current CHAT topic (0 when AFTER). */
  topicTurns: number;
  /** After any crisis override, the rest of the session never calls the model. */
  rulesOnly: boolean;
  /** chatGuard / not-ready / timeout fails in this topic. A second fail closes with the card. */
  rejectCount: number;
  /** PII-stripped, clipped user lines of this topic (bounded window). Crisis lines are never stored. */
  topicUserLines: string[];
  /** Last guarded Jane chat lines (same window as topicUserLines). */
  janeReplies: string[];
}

export interface ChatPlan {
  reason: ChatPlanReason;
  callChat: boolean;
  callPick: boolean;
  close: ChatClose;
  topicTurn: number;
}

export interface PlanTurnInput {
  flow: ChatFlowState;
  crisis: "override" | "banner" | "none";
  guard: boolean;
  human: boolean;
  chip: boolean;
  showNow: boolean;
  locked: boolean;
  rulesConfident: boolean;
  directQuestion: boolean;
}

export function newChatFlow(): ChatFlowState {
  return { phase: "after", topicTurns: 0, rulesOnly: false, rejectCount: 0, topicUserLines: [], janeReplies: [] };
}

export function showCardNowChip(lang: ChatLang = "th"): CardNext {
  return { label_th: lang === "en" ? SHOW_CARD_NOW_EN : SHOW_CARD_NOW, card_id: SHOW_CARD_NOW_ID };
}

export function isShowCardNow(input: string): boolean {
  const said = normalize(input).replace(/\s+/g, "");
  return said === normalize(SHOW_CARD_NOW).replace(/\s+/g, "")
    || said === normalize(SHOW_CARD_NOW_EN).replace(/\s+/g, "");
}

/** Thai / English question shape: a mark, or a common question ending. */
export function isDirectFactualQuestion(text: string): boolean {
  const t = text.trim();
  if (/[?？]/.test(t)) return true;
  return /(ไหม|มั้ย|หรือเปล่า|หรือไม่|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|เมื่อไหร่|ตอนไหน|ที่ไหน|คืออะไร)\s*$/u.test(t);
}

export function planTurn(input: PlanTurnInput): ChatPlan {
  const { flow } = input;
  const idle: Pick<ChatPlan, "callChat" | "callPick"> = { callChat: false, callPick: false };
  if (input.crisis === "override") {
    return { reason: "crisis", ...idle, close: "never", topicTurn: flow.topicTurns };
  }
  if (flow.rulesOnly) {
    return { reason: "post-crisis", ...idle, close: "always", topicTurn: flow.topicTurns };
  }
  if (input.crisis === "banner") {
    return { reason: "banner", ...idle, close: "always", topicTurn: flow.topicTurns };
  }
  if (input.guard) {
    return { reason: "guard", ...idle, close: "always", topicTurn: flow.topicTurns };
  }
  if (input.human) {
    return { reason: "human", ...idle, close: "never", topicTurn: flow.topicTurns };
  }
  if (input.chip) {
    return { reason: "chip", ...idle, close: "always", topicTurn: flow.topicTurns };
  }
  if (input.showNow) {
    return { reason: "show-now", ...idle, close: "always", topicTurn: flow.topicTurns };
  }
  if (input.locked) {
    return { reason: "locked", ...idle, close: "always", topicTurn: flow.topicTurns };
  }

  const topicTurn = flow.phase === "chat" ? flow.topicTurns + 1 : 1;
  return { reason: "chat", callChat: true, callPick: false, close: "never", topicTurn };
}

export function applyCrisis(flow: ChatFlowState): ChatFlowState {
  return { ...newChatFlow(), rulesOnly: true };
}

export function applyClosedCard(_flow: ChatFlowState): ChatFlowState {
  return { ..._flow, phase: "after", topicTurns: 0, rejectCount: 0, topicUserLines: [], janeReplies: [] };
}

export function applyChatTurn(flow: ChatFlowState, userLine: string, janeReply: string, rejected: boolean): ChatFlowState {
  const continuing = flow.phase === "chat";
  return {
    ...flow,
    phase: "chat",
    topicTurns: continuing ? flow.topicTurns + 1 : 1,
    rejectCount: rejected ? flow.rejectCount + 1 : flow.rejectCount,
    topicUserLines: [...(continuing ? flow.topicUserLines : []), userLine].slice(-CHAT_HISTORY_TURNS),
    janeReplies: [...(continuing ? flow.janeReplies : []), janeReply].slice(-CHAT_HISTORY_TURNS),
  };
}

/** Prior user+Jane turns for the model (bounded window). Current user is passed separately. */
export function chatHistory(flow: ChatFlowState): { role: "user" | "assistant"; content: string }[] {
  const n = Math.min(flow.topicUserLines.length, flow.janeReplies.length);
  const start = Math.max(0, n - CHAT_HISTORY_TURNS);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (let i = start; i < n; i++) {
    out.push({ role: "user", content: flow.topicUserLines[i]! });
    out.push({ role: "assistant", content: flow.janeReplies[i]! });
  }
  return out;
}

export function shouldCloseAfterReject(flow: ChatFlowState, rejected: boolean): boolean {
  return rejected && flow.rejectCount + 1 >= 2;
}

/** Topic text for retrieve / pick: last 3 stripped lines, each already clipped by the caller. */
export function topicText(lines: readonly string[], current: string): string {
  return [...lines, current].slice(-3).join(" ");
}
