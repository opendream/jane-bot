import type { AgeBand, CrisisCategory, Intent } from "../core/types";
import type { CardNext } from "../core/bank";
import { DialogSession, SOFT_CAP, type DialogModel, type TurnReply, type CapNotice } from "../core/dialog";
import { crisisOrder } from "../core/crisis";
import { BANK } from "../core/bankData";
import { THAI_COPY_STATUS } from "../config";
import { h } from "./dom";

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

export interface ChatState { session: DialogSession; messages: ChatMsg[]; busy: boolean; draft: string; readOnly: boolean }

export interface ChatHooks {
  rerender(): void;
  /** Crisis override: the app shows the crisis screen (rules only, no model). */
  crisis(categories: CrisisCategory[]): void;
  /** Referral offer accepted (PR5 wires this to the service cards). */
  referral?(intents: Intent[]): void;
}

export function newChat(ageBand: AgeBand, model: DialogModel | null): ChatState {
  const session = new DialogSession(ageBand, { cards: BANK, model, copyStatus: THAI_COPY_STATUS });
  const chat: ChatState = { session, messages: [], busy: false, draft: "", readOnly: false };
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

/** Send one message. Crisis is decided inside runTurn() before anything else. */
export async function sendToChat(chat: ChatState, text: string, hooks: ChatHooks): Promise<void> {
  const t = text.trim();
  if (!t || chat.readOnly) return;
  chat.draft = "";
  push(chat, { from: "user", text: t });
  chat.busy = true; hooks.rerender();
  const reply = await chat.session.send(t);
  chat.busy = false;
  if (!reply) return; // superseded by a newer message
  if (reply.kind === "crisis") { hooks.crisis(reply.categories); return; }
  if (reply.kind === "readonly" || (reply.kind === "card" && reply.capNotice === "hard")) chat.readOnly = true;
  push(chat, fromReply(reply));
  hooks.rerender();
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
    last && !chat.readOnly && m.chips?.length ? h("div", { class: "chips" }, ...m.chips.map((c, k) =>
      h("button", { class: "chip", "data-testid": `chat-chip-${k}`, onclick: () => sendToChat(chat, c.label_th, hooks) }, c.label_th))) : null,
    last && m.offer && m.offer !== "none" && hooks.referral ? h("button", { class: m.offer === "strong" ? "btn-primary" : "btn-ghost", "data-testid": "chat-offer",
      onclick: () => hooks.referral!(m.offerIntents ?? ["other"]) }, "ให้พี่ช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ไหม") : null,
  );
}

export function chatView(chat: ChatState, hooks: ChatHooks): HTMLElement {
  const ta = h("textarea", { "data-testid": "chat-input", rows: 2, maxlength: 600, autocomplete: "off", spellcheck: "false",
    placeholder: "พิมพ์ได้เลย ไม่ต้องบอกชื่อ เบอร์ หรือโรงเรียน", value: chat.draft, disabled: chat.readOnly }) as HTMLTextAreaElement;
  ta.addEventListener("input", () => { chat.draft = ta.value; });
  const submit = (e?: Event) => { e?.preventDefault(); void sendToChat(chat, ta.value, hooks); };
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !(e as KeyboardEvent).isComposing) submit(e); });
  const n = chat.messages.length;
  return h("main", { class: "screen chat", "data-testid": "screen-chat" },
    h("div", { class: "chat-log", "data-testid": "chat-log", "aria-live": "polite" }, ...chat.messages.map((m, i) => bubble(m, i, i === n - 1, chat, hooks))),
    chat.busy && h("p", { class: "note", "data-testid": "chat-busy" }, "พี่เจนกำลังพิมพ์…"),
    h("form", { class: "chat-form", onsubmit: submit },
      h("label", { class: "sr", for: "chat-input" }, "ข้อความถึงพี่เจน"), ta,
      h("button", { class: "btn-primary", type: "submit", "data-testid": "chat-send", disabled: chat.readOnly }, "ส่ง")),
  );
}
