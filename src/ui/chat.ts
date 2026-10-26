import type { CrisisCategory, Intent } from "../core/types";
import type { AgeState } from "../core/age";
import type { BankTopic, CardNext } from "../core/bank";
import { DialogSession, SOFT_CAP, type DialogModel, type TurnReply, type CapNotice } from "../core/dialog";
import { crisisOrder, detectCrisis } from "../core/crisis";
import { BANK, cardsForSession, bankContext } from "../core/bankData";
import { THAI_COPY_STATUS } from "../config";
import { QUIZ_CHIP, hasRelatedQuiz, startQuiz, type QuizSession } from "../core/quiz";
import { h } from "./dom";
import { quizPanel } from "./quiz";

/* Multi-turn chat screen (plan §3, §5). Memory only: the transcript lives in this object and is
 * wiped by erase / quick exit. Nothing is logged. All Thai copy is DRAFT. */

/** The UI keeps the last 20 messages (plan §3, device limits). */
export const TRANSCRIPT_MAX = 20;

export interface ChatMsg {
  from: "user" | "jane";
  text: string;
  cardId?: string;
  placeholder?: boolean;
  reworded?: boolean;
  original?: string;
  showOriginal?: boolean;
  banner?: CrisisCategory[];
  chips?: CardNext[];
  offer?: "none" | "soft" | "strong";
  offerIntents?: Intent[];
  cap?: CapNotice;
  note?: "referral" | "readonly";
}

export interface ChatState { session: DialogSession; messages: ChatMsg[]; busy: boolean; draft: string; readOnly: boolean; quiz: QuizSession | null }

export interface ChatHooks {
  rerender(): void;
  /** Crisis override: the app shows the crisis screen (rules only, no model). */
  crisis(categories: CrisisCategory[]): void;
  /** Referral offer accepted (PR5 wires this to the service cards). Banner is the chat's active crisis strip. */
  referral?(intents: Intent[], banner?: CrisisCategory[]): void;
  /** App-level generation (NeedGate seq). Bumped on erase, quick exit, SOS, openChat. */
  seq?(): number;
}

export function newChat(ageBand: AgeState, model: DialogModel | null): ChatState {
  const session = new DialogSession(ageBand, { cards: cardsForSession(), model, copyStatus: THAI_COPY_STATUS, rewordCtx: bankContext() });
  const chat: ChatState = { session, messages: [], busy: false, draft: "", readOnly: false, quiz: null };
  push(chat, fromReply(session.start()));
  return chat;
}

function push(chat: ChatState, m: ChatMsg | null) {
  if (!m) return;
  chat.messages.push(m);
  if (chat.messages.length > TRANSCRIPT_MAX) chat.messages.splice(0, chat.messages.length - TRANSCRIPT_MAX);
}

function fromReply(r: TurnReply): ChatMsg | null {
  if (r.kind === "card") {
    return { from: "jane", text: r.text, cardId: r.card.id, placeholder: !!r.card.placeholder, reworded: r.reworded, original: r.card.answer_th,
      banner: r.banner, chips: r.chips, offer: r.offer, offerIntents: r.offerIntents, cap: r.capNotice };
  }
  if (r.kind === "referral") return { from: "jane", text: "ได้เลย พี่ช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ให้นะ", banner: r.banner, offer: "strong", offerIntents: r.intents, cap: r.capNotice, note: "referral" };
  if (r.kind === "readonly") return { from: "jane", text: "แชทนี้ยาวมากแล้ว ตอนนี้ส่งข้อความเพิ่มไม่ได้ คุยกับเจ้าหน้าที่ตัวจริง หรือกดลบแชทเพื่อเริ่มใหม่ได้", note: "readonly", offer: "strong", offerIntents: ["other"] };
  return null;
}

export function lastCardTopic(chat: ChatState): BankTopic | null {
  const id = [...chat.messages].reverse().find((m) => m.from === "jane" && m.cardId)?.cardId;
  return BANK.find((c) => c.id === id)?.topic ?? null;
}

export function beginQuiz(chat: ChatState, topic: BankTopic | null, hooks: ChatHooks): void {
  const age = chat.session.state.ageBand;
  chat.quiz = startQuiz(age, topic);
  hooks.rerender();
}

function chatDelayMs(): number {
  try { return Number(new URLSearchParams(location.search).get("chatDelayMs") || 0); } catch { return 0; }
}

/** Send one message. Crisis is decided inside runTurn() before anything else, including after the hard cap.
 *  A crisis line typed during the quiz skips the delay and never reaches generation. */
export async function sendToChat(chat: ChatState, text: string, hooks: ChatHooks): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const mine = hooks.seq?.() ?? -1;
  const owns = () => hooks.seq == null || hooks.seq() === mine;
  if (chat.quiz) {
    const crisis = detectCrisis(t);
    chat.quiz = null;
    if (crisis.crisis) {
      chat.draft = "";
      push(chat, { from: "user", text: t });
      if (!owns()) return;
      hooks.crisis(crisis.categories);
      return;
    }
  }
  if (chat.readOnly) {
    if (chatDelayMs() > 0) await new Promise((r) => setTimeout(r, chatDelayMs()));
    if (!owns()) return;
    const reply = await chat.session.send(t);
    if (!owns()) return;
    if (reply?.kind === "crisis") hooks.crisis(reply.categories);
    return;
  }
  chat.draft = "";
  push(chat, { from: "user", text: t });
  chat.busy = true; hooks.rerender();
  if (chatDelayMs() > 0) await new Promise((r) => setTimeout(r, chatDelayMs()));
  if (!owns()) { chat.busy = false; return; }
  const reply = await chat.session.send(t);
  if (!owns()) { chat.busy = false; return; } // erase / quick exit / SOS / openChat bumped the seq: drop, no rerender
  chat.busy = false;
  if (!reply) return; // superseded by a newer message
  if (reply.kind === "crisis") { hooks.crisis(reply.categories); return; }
  if (reply.kind === "readonly" || (reply.kind === "card" && reply.capNotice === "hard")) chat.readOnly = true;
  push(chat, fromReply(reply));
  hooks.rerender();
  if (reply.kind === "referral") hooks.referral?.(reply.intents, reply.banner);
}

function strip(categories: CrisisCategory[]) {
  return h("aside", { class: "crisis-strip", "data-testid": "crisis-banner" },
    h("p", {}, h("strong", {}, "ถ้าเรื่องนี้เกิดกับคุณ หรือคุณไม่ปลอดภัยตอนนี้ "), "โทรฟรี 24 ชั่วโมง:"),
    h("div", { class: "chans" }, ...crisisOrder(categories).map((n) => h("a", { class: "btn-call small danger", href: `tel:${n}` }, `โทร ${n}`))));
}

function bubble(m: ChatMsg, i: number, last: boolean, chat: ChatState, hooks: ChatHooks) {
  if (m.from === "user") return h("div", { class: "msg user", "data-testid": "chat-msg", "data-from": "user" }, h("p", {}, m.text));
  const shown = m.reworded && m.showOriginal ? m.original! : m.text;
  return h("div", { class: "msg jane", "data-testid": "chat-msg", "data-from": "jane", "data-card": m.cardId ?? "", "data-reworded": String(!!m.reworded) },
    m.banner?.length ? strip(m.banner) : null,
    m.placeholder && h("span", { class: "tag placeholder", "data-testid": "placeholder-tag" }, "PLACEHOLDER · เนื้อหาตัวอย่าง ยังไม่ใช่ข้อมูลจริง"),
    h("p", { "data-testid": "chat-text" }, shown),
    m.reworded && h("p", { class: "note", "data-testid": "reword-note" }, "เรียบเรียงโดยโมเดลในเครื่อง ",
      h("button", { class: "link", "data-testid": "show-original", onclick: () => { m.showOriginal = !m.showOriginal; hooks.rerender(); } }, m.showOriginal ? "ดูฉบับเรียบเรียง" : "ดูข้อความต้นฉบับ")),
    m.cap === "soft" && h("p", { class: "note", "data-testid": "cap-soft" }, `คุยกันมา ${SOFT_CAP} ข้อความแล้ว ลองคุยกับเจ้าหน้าที่ตัวจริง หรือกดลบแชทเพื่อเริ่มใหม่ก็ได้นะ`),
    last && !chat.readOnly && !chat.quiz && m.chips?.length ? h("div", { class: "chips" }, ...m.chips.map((c, k) =>
      h("button", { class: "chip", "data-testid": `chat-chip-${k}`, onclick: () => sendToChat(chat, c.label_th, hooks) }, c.label_th))) : null,
    last && !chat.quiz && m.cardId && hasRelatedQuiz(BANK.find((c) => c.id === m.cardId)?.topic, chat.session.state.ageBand, undefined, THAI_COPY_STATUS)
      ? h("button", { class: "chip", "data-testid": "quiz-start", type: "button", onclick: () => beginQuiz(chat, BANK.find((c) => c.id === m.cardId)?.topic ?? null, hooks) }, QUIZ_CHIP) : null,
    last && m.offer && m.offer !== "none" && hooks.referral && !chat.quiz ? h("button", { class: m.offer === "strong" ? "btn-primary" : "btn-ghost", "data-testid": "chat-offer",
      onclick: () => hooks.referral!(m.offerIntents ?? ["other"], m.banner) }, "ให้พี่ช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ไหม") : null,
  );
}

export function chatView(chat: ChatState, hooks: ChatHooks): HTMLElement {
  const ta = h("textarea", { "data-testid": "chat-input", rows: 2, maxlength: 600, autocomplete: "off", spellcheck: "false",
    placeholder: "พิมพ์ได้เลย ไม่ต้องบอกชื่อ เบอร์ หรือโรงเรียน", value: chat.draft }) as HTMLTextAreaElement;
  ta.addEventListener("input", () => { chat.draft = ta.value; });
  const submit = (e?: Event) => { e?.preventDefault(); void sendToChat(chat, ta.value, hooks); };
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !(e as KeyboardEvent).isComposing) submit(e); });
  const n = chat.messages.length;
  return h("main", { class: "screen chat", "data-testid": "screen-chat" },
    h("div", { class: "chat-log", "data-testid": "chat-log", "aria-live": "polite" }, ...chat.messages.map((m, i) => bubble(m, i, i === n - 1 && !chat.quiz, chat, hooks))),
    chat.quiz && quizPanel(chat.quiz, { update: (next) => { chat.quiz = next; hooks.rerender(); } }),
    chat.busy && h("p", { class: "note", "data-testid": "chat-busy" }, "พี่เจนกำลังพิมพ์…"),
    chat.readOnly && h("p", { class: "note", "data-testid": "cap-hard" }, "แชทนี้ยาวมากแล้ว ตอนนี้ส่งข้อความเพิ่มไม่ได้ คุยกับเจ้าหน้าที่ตัวจริง หรือกดลบแชทเพื่อเริ่มใหม่ได้"),
    h("form", { class: "chat-form", onsubmit: submit },
      h("label", { class: "sr", for: "chat-input" }, "ข้อความถึงพี่เจน"), ta,
      h("button", { class: "btn-primary", type: "submit", "data-testid": "chat-send" }, "ส่ง")),
  );
}
