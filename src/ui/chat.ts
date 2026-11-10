import type { CrisisCategory, Intent } from "../core/types";
import type { AgeState } from "../core/age";
import type { BankTopic, CardNext } from "../core/bank";
import { DialogSession, SOFT_CAP, type DialogModel, type TurnReply, type CapNotice } from "../core/dialog";
import type { IntentMatcher } from "../core/matcher";
import { crisisOrder } from "../core/crisis";
import { BANK, cardsForSession, bankContext } from "../core/bankData";
import { THAI_COPY_STATUS, chatFirstEnabled, debugEnabled, modelCardPickEnabled, pickTimeoutMsFromSearch } from "../config";
import { MODEL_PICK_TIMEOUT_MS, type EngineTag } from "../core/pick-engine";
import { engineAnswerLabel, nextThinkingHintDelay, thinkingHintAt } from "./thinking";
import {
  CHAT_THINKING_ROTATE_MS,
  prefersReducedMotion,
  thinkingLabelFor,
  thinkingPhraseAt,
} from "./chat-thinking";
import type { ChatLang } from "../llm/chat-lang";
import { isCurrentGeneration } from "../llm/generation-token";
import { QUIZ_CHIP, hasRelatedQuiz, quizCopyStatus, startQuiz, type QuizSession } from "../core/quiz";
import { h } from "./dom";
import { emptyChatArt, janeImg } from "./jane";
import { quizPanel } from "./quiz";

/* Multi-turn chat screen (plan §3, §5). Memory only: the transcript lives in this object and is
 * wiped by erase / quick exit. Nothing is logged. Thai copy is reviewed. */

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
  engine?: EngineTag;
  engineLabel?: string | null;
  cardNote?: string | null;
  softCrisis?: { line: string; categories: CrisisCategory[] };
  /** ?debug=1 only: chatGuard reason codes, never raw text. */
  debugGuard?: string;
}

export interface ChatState {
  session: DialogSession;
  messages: ChatMsg[];
  busy: boolean;
  draft: string;
  readOnly: boolean;
  quiz: QuizSession | null;
  modelPick: boolean;
  chatFirst: boolean;
  thinkingHint: string | null;
  /** Chat-first model-generation indicator. Never stored in the transcript. */
  thinking: boolean;
  thinkingToken: number;
  thinkingLang: ChatLang;
  thinkingPhrase: string | null;
  /** ?debug=1: show chatGuard reason codes on card fallbacks. Off by default. */
  debug: boolean;
}

export interface NewChatOpts {
  modelPick?: boolean;
  chatFirst?: boolean;
  warmupRemainingMs?: () => number | null;
  pickTimeoutMs?: number;
  search?: string;
}

export interface ChatHooks {
  rerender(): void;
  /** Patch the busy hint in place. Must not recreate the textarea. */
  updateThinkingHint?(text: string): void;
  /** Patch the chat-first thinking phrase in place. Must not recreate the textarea. */
  updateThinkingPhrase?(text: string): void;
  /** Crisis override: the app shows the crisis screen (rules only, no model). */
  crisis(categories: CrisisCategory[]): void;
  /** Referral offer accepted (PR5 wires this to the service cards). Banner is the chat's active crisis strip. */
  referral?(intents: Intent[], banner?: CrisisCategory[]): void;
  /** App-level generation (NeedGate seq). Bumped on erase, quick exit, SOS, openChat. */
  seq?(): number;
}

export function newChat(ageBand: AgeState, model: DialogModel | null, matcher: IntentMatcher | null = null, opts: NewChatOpts = {}): ChatState {
  const modelPick = opts.modelPick ?? modelCardPickEnabled(opts.search);
  const chatFirst = opts.chatFirst ?? chatFirstEnabled(opts.search);
  const session = new DialogSession(ageBand, {
    cards: cardsForSession(),
    model,
    matcher,
    copyStatus: THAI_COPY_STATUS,
    rewordCtx: bankContext(),
    modelPick,
    chatFirst,
    warmupRemainingMs: opts.warmupRemainingMs,
    pickTimeoutMs: opts.pickTimeoutMs ?? (modelPick ? pickTimeoutMsFromSearch(opts.search, MODEL_PICK_TIMEOUT_MS) : undefined),
  });
  const chat: ChatState = {
    session, messages: [], busy: false, draft: "", readOnly: false, quiz: null, modelPick, chatFirst,
    thinkingHint: null, thinking: false, thinkingToken: 0, thinkingLang: "th", thinkingPhrase: null,
    debug: debugEnabled(opts.search),
  };
  push(chat, chatMsgFromReply(session.start(), modelPick, chatFirst));
  return chat;
}

function push(chat: ChatState, m: ChatMsg | null) {
  if (!m) return;
  chat.messages.push(m);
  if (chat.messages.length > TRANSCRIPT_MAX) chat.messages.splice(0, chat.messages.length - TRANSCRIPT_MAX);
}

/** Map a dialog reply onto a Jane bubble. AMBIGUOUS replies with a soft line always render, even with empty text and no card. */
export function chatMsgFromReply(r: TurnReply, modelPick = false, chatFirst = false): ChatMsg | null {
  if (r.kind === "card") {
    return { from: "jane", text: r.text, cardId: r.card.id, placeholder: !!r.card.placeholder, reworded: r.reworded, original: r.card.answer_th,
      banner: r.banner, chips: r.chips, offer: r.offer, offerIntents: r.offerIntents, cap: r.capNotice,
      engine: r.engine, engineLabel: engineAnswerLabel(r.engine, modelPick), cardNote: r.cardNote,
      softCrisis: r.softCrisis, debugGuard: r.chatGuardReasons?.length ? r.chatGuardReasons.join(",") : undefined };
  }
  if (r.kind === "chat") {
    if (!r.text && !r.card && !r.softCrisis) return null;
    return { from: "jane", text: r.text, banner: r.banner, chips: r.card ? [] : r.chips, cap: r.capNotice, softCrisis: r.softCrisis };
  }
  if (r.kind === "idle") {
    if (!r.softCrisis) return null;
    return { from: "jane", text: "", cap: r.capNotice, softCrisis: r.softCrisis };
  }
  if (r.kind === "referral") {
    return {
      from: "jane",
      text: "ได้เลยค่ะ เราช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ให้นะคะ",
      banner: r.banner,
      offer: "strong",
      offerIntents: r.intents,
      cap: r.capNotice,
      note: "referral",
      softCrisis: r.softCrisis,
    };
  }
  if (r.kind === "readonly") {
    return {
      from: "jane",
      text: "แชทนี้ยาวมากแล้ว ตอนนี้ส่งข้อความเพิ่มไม่ได้ คุยกับเจ้าหน้าที่ตัวจริง หรือกดลบแชทเพื่อเริ่มใหม่ได้",
      note: "readonly",
      offer: "strong",
      offerIntents: ["other"],
      softCrisis: r.softCrisis,
    };
  }
  return null;
}

function fromChatCard(r: Extract<TurnReply, { kind: "chat" }>, modelPick = false, chatFirst = false): ChatMsg | null {
  if (!r.card || r.cardText == null) return null;
  return {
    from: "jane", text: r.cardText, cardId: r.card.id, placeholder: !!r.card.placeholder, reworded: false, original: r.card.answer_th,
    banner: r.banner, chips: r.chips, offer: r.offer, offerIntents: r.offerIntents, cap: r.capNotice,
    engine: r.engine, engineLabel: engineAnswerLabel(r.engine, modelPick), cardNote: r.cardNote,
  };
}

export function lastCardTopic(chat: ChatState): BankTopic | null {
  const id = [...chat.messages].reverse().find((m) => m.from === "jane" && m.cardId)?.cardId;
  return BANK.find((c) => c.id === id)?.topic ?? null;
}

export function beginQuiz(chat: ChatState, topic: BankTopic | null, hooks: ChatHooks): void {
  if (chat.readOnly || chat.busy) return;
  const age = chat.session.state.ageBand;
  chat.quiz = startQuiz(age, topic, undefined, undefined, quizCopyStatus());
  hooks.rerender();
}

/** Ignore clicks from a panel that sendToChat already closed. */
export function applyQuizUpdate(chat: ChatState, next: QuizSession | null, hooks: ChatHooks): void {
  if (!chat.quiz) return;
  chat.quiz = next;
  hooks.rerender();
}

function chatDelayMs(): number {
  try { return Number(new URLSearchParams(location.search).get("chatDelayMs") || 0); } catch { return 0; }
}

/** Send one message. Crisis is decided inside runTurn() before anything else, including after the hard cap.
 *  A line typed during the quiz still goes through session.send (crisisFired / sticky strip). Ordinary
 *  (non-crisis) text uses the same busy path as normal chat; only the artificial chatDelayMs is skipped. */
export async function sendToChat(chat: ChatState, text: string, hooks: ChatHooks): Promise<void> {
  const t = text.trim();
  if (!t) return;
  const mine = hooks.seq?.() ?? -1;
  const owns = () => hooks.seq == null || hooks.seq() === mine;
  const fromQuiz = !!chat.quiz;
  if (chat.quiz) chat.quiz = null;
  if (chat.readOnly) {
    chat.draft = "";
    hooks.rerender();
    if (!fromQuiz && chatDelayMs() > 0) await new Promise((r) => setTimeout(r, chatDelayMs()));
    if (!owns()) return;
    const reply = await chat.session.send(t);
    if (!owns()) return;
    if (reply?.kind === "crisis") {
      hooks.crisis(reply.categories);
      return;
    }
    // After the 30-turn lock, AMBIGUOUS still shows the fixed soft line + button.
    // Never generate; never block the crisis card. Ordinary text stays silent.
    const soft = reply && "softCrisis" in reply ? reply.softCrisis : undefined;
    if (reply && soft) {
      push(chat, { from: "user", text: t });
      push(chat, chatMsgFromReply(reply, chat.modelPick, chat.chatFirst));
      hooks.rerender();
    }
    return;
  }
  chat.draft = "";
  push(chat, { from: "user", text: t });
  const userTurnsAtSend = chat.messages.filter((m) => m.from === "user").length;
  chat.busy = true;
  if (chat.chatFirst && chat.thinking) {
    chat.thinking = false;
    chat.thinkingPhrase = null;
    chat.thinkingToken = 0;
  }
  if (chat.modelPick) chat.thinkingHint = thinkingHintAt(0);
  hooks.rerender();
  if (!fromQuiz && chatDelayMs() > 0) await new Promise((r) => setTimeout(r, chatDelayMs()));
  if (!owns()) { chat.busy = false; chat.thinking = false; return; }
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  let rotateTimer: ReturnType<typeof setInterval> | undefined;
  let myGen: number | undefined;
  if (chat.modelPick) {
    const t0 = Date.now();
    const tick = () => {
      if (!owns()) return;
      const elapsed = Date.now() - t0;
      const text = thinkingHintAt(elapsed);
      if (text !== chat.thinkingHint) {
        chat.thinkingHint = text;
        hooks.updateThinkingHint?.(text);
      }
      const wait = nextThinkingHintDelay(elapsed);
      if (wait != null) hintTimer = setTimeout(tick, wait);
    };
    const wait = nextThinkingHintDelay(0);
    if (wait != null) hintTimer = setTimeout(tick, wait);
  }
  const clearThinkingIfMine = () => {
    if (myGen != null && chat.thinkingToken === myGen) {
      chat.thinking = false;
      chat.thinkingPhrase = null;
      chat.thinkingToken = 0;
    }
  };
  let reply: Awaited<ReturnType<DialogSession["send"]>>;
  try {
    reply = await chat.session.send(t, {
      onGenerating: ({ groupId, lang }) => {
        if (!owns()) return;
        myGen = groupId;
        chat.thinking = true;
        chat.thinkingToken = groupId;
        chat.thinkingLang = lang;
        chat.thinkingPhrase = thinkingPhraseAt(lang, 0);
        if (!prefersReducedMotion() && !rotateTimer) {
          let i = 0;
          rotateTimer = setInterval(() => {
            if (chat.thinkingToken !== groupId) return;
            i += 1;
            const phrase = thinkingPhraseAt(lang, i);
            chat.thinkingPhrase = phrase;
            hooks.updateThinkingPhrase?.(phrase);
          }, CHAT_THINKING_ROTATE_MS);
        }
        hooks.rerender();
      },
    });
  } finally {
    if (hintTimer) clearTimeout(hintTimer);
    if (rotateTimer) clearInterval(rotateTimer);
    chat.thinkingHint = null;
  }
  if (!owns()) { chat.busy = false; clearThinkingIfMine(); return; } // erase / quick exit / SOS / openChat bumped the seq: drop, no rerender
  if (!reply) return; // superseded: the newer send owns busy/thinking
  // A late / superseded generate must not land under a newer user turn.
  if (chat.messages.filter((m) => m.from === "user").length !== userTurnsAtSend) return;
  if (reply.groupId != null && !isCurrentGeneration(reply.groupId)) return;
  chat.busy = false;
  clearThinkingIfMine();
  if (reply.kind === "idle") {
    if (reply.capNotice === "hard") { chat.readOnly = true; chat.quiz = null; }
    push(chat, chatMsgFromReply(reply, chat.modelPick, chat.chatFirst));
    hooks.rerender();
    return;
  }
  if (reply.kind === "crisis") { hooks.crisis(reply.categories); return; }
  if (reply.kind === "readonly" || ((reply.kind === "card" || reply.kind === "chat") && reply.capNotice === "hard")) {
    chat.readOnly = true;
    chat.quiz = null;
  }
  if (reply.kind === "chat") {
    push(chat, chatMsgFromReply(reply, chat.modelPick, chat.chatFirst));
    push(chat, fromChatCard(reply, chat.modelPick, chat.chatFirst));
  } else {
    push(chat, chatMsgFromReply(reply, chat.modelPick, chat.chatFirst));
  }
  hooks.rerender();
  if (reply.kind === "referral") hooks.referral?.(reply.intents, reply.banner);
}

function strip(categories: CrisisCategory[]) {
  return h("aside", { class: "crisis-strip", "data-testid": "crisis-banner" },
    h("p", {}, h("strong", {}, "ถ้าเรื่องนี้เกิดกับคุณ หรือคุณไม่ปลอดภัยตอนนี้ "), "โทรฟรี 24 ชั่วโมง:"),
    h("div", { class: "chans" }, ...crisisOrder(categories).map((n) => h("a", { class: "btn-call small danger", href: `tel:${n}` }, `โทร ${n}`))));
}

function lastJaneIndex(messages: ChatMsg[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.from === "jane") return i;
  return -1;
}

function bubble(m: ChatMsg, i: number, last: boolean, chat: ChatState, hooks: ChatHooks) {
  if (m.from === "user") return h("div", { class: "msg user", "data-testid": "chat-msg", "data-from": "user" }, h("p", {}, m.text));
  const shown = m.reworded && m.showOriginal ? m.original! : m.text;
  return h("div", { class: "msg jane", "data-testid": "chat-msg", "data-from": "jane", "data-card": m.cardId ?? "", "data-reworded": String(!!m.reworded) },
    janeImg("avatar96"),
    h("div", { class: "msg-body" },
      m.banner?.length ? strip(m.banner) : null,
      m.engineLabel ? h("p", { class: "engine-label", "data-testid": "engine-label" }, m.engineLabel) : null,
      m.cardNote ? h("p", { class: "note", "data-testid": "card-lang-note" }, m.cardNote) : null,
      chat.debug && m.debugGuard ? h("p", { class: "note", "data-testid": "chat-guard-debug" }, `guard: ${m.debugGuard}`) : null,
      h("p", { "data-testid": "chat-text" }, shown),
      m.softCrisis ? h("button", {
        class: "btn-ghost",
        type: "button",
        "data-testid": "chat-crisis-soft-open",
        onclick: () => hooks.crisis(m.softCrisis!.categories),
      }, h("span", { "data-testid": "chat-crisis-soft-line" }, m.softCrisis.line)) : null,
      m.reworded && h("p", { class: "note", "data-testid": "reword-note" }, "เรียบเรียงโดยโมเดลในเครื่อง ",
        h("button", { class: "link", "data-testid": "show-original", onclick: () => { m.showOriginal = !m.showOriginal; hooks.rerender(); } }, m.showOriginal ? "ดูฉบับเรียบเรียง" : "ดูข้อความต้นฉบับ")),
      m.cap === "soft" && h("p", { class: "note", "data-testid": "cap-soft" }, `คุยกันมา ${SOFT_CAP} ข้อความแล้ว ลองคุยกับเจ้าหน้าที่ตัวจริง หรือกดลบแชทเพื่อเริ่มใหม่ก็ได้นะ`),
      !chat.readOnly && !chat.quiz && m.chips?.length && (last || (chat.chatFirst && i === lastJaneIndex(chat.messages) && (chat.thinking || chat.busy))) ? h("div", { class: "chips" }, ...m.chips.map((c, k) =>
        h("button", { class: "chip", "data-testid": `chat-chip-${k}`, onclick: () => sendToChat(chat, c.label_th, hooks) }, c.label_th))) : null,
      last && !chat.readOnly && !chat.busy && !chat.quiz && m.cardId && hasRelatedQuiz(BANK.find((c) => c.id === m.cardId)?.topic, chat.session.state.ageBand, undefined, quizCopyStatus())
        ? h("button", { class: "chip", "data-testid": "quiz-start", type: "button", onclick: () => beginQuiz(chat, BANK.find((c) => c.id === m.cardId)?.topic ?? null, hooks) }, QUIZ_CHIP) : null,
      last && m.offer && m.offer !== "none" && hooks.referral && !chat.quiz ? h("button", { class: m.offer === "strong" ? "btn-primary" : "btn-ghost", "data-testid": "chat-offer",
        onclick: () => hooks.referral!(m.offerIntents ?? ["other"], m.banner) }, "ให้เราช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ไหมคะ") : null,
    ),
  );
}

export function chatView(chat: ChatState, hooks: ChatHooks): HTMLElement {
  const ta = h("textarea", { "data-testid": "chat-input", rows: 2, maxlength: 600, autocomplete: "off", spellcheck: "false",
    placeholder: "พิมพ์ได้เลย ไม่ต้องบอกชื่อ เบอร์ หรือโรงเรียน", value: chat.draft }) as HTMLTextAreaElement;
  ta.addEventListener("input", () => { chat.draft = ta.value; });
  const submit = (e?: Event) => { e?.preventDefault(); void sendToChat(chat, ta.value, hooks); };
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !(e as KeyboardEvent).isComposing) submit(e); });
  const n = chat.messages.length;
  const empty = !chat.quiz && !chat.messages.some((m) => m.from === "user");
  return h("main", { class: "screen chat", "data-testid": "screen-chat" },
    h("div", { class: "chat-log", "data-testid": "chat-log", "aria-live": "polite" },
      empty ? emptyChatArt() : null,
      ...chat.messages.map((m, i) => bubble(m, i, i === n - 1 && !chat.quiz, chat, hooks))),
    chat.quiz && quizPanel(chat.quiz, { update: (next) => applyQuizUpdate(chat, next, hooks) }),
    chat.chatFirst && chat.thinking ? h("div", {
      class: "chat-thinking",
      "data-testid": "chat-thinking",
    },
      h("span", { class: "sr", "data-testid": "chat-thinking-label", "aria-live": "polite" }, thinkingLabelFor(chat.thinkingLang)),
      h("span", {
        class: prefersReducedMotion() ? "chat-thinking-phrase" : "chat-thinking-phrase chat-thinking-bob",
        "data-testid": "chat-thinking-phrase",
        "aria-hidden": "true",
      }, chat.thinkingPhrase ?? thinkingPhraseAt(chat.thinkingLang, 0)),
    ) : null,
    !chat.chatFirst && chat.busy && h("p", { class: "note", "data-testid": "chat-busy" }, chat.modelPick ? (chat.thinkingHint ?? thinkingHintAt(0)) : "เจนกำลังพิมพ์…"),
    chat.readOnly && h("p", { class: "note", "data-testid": "cap-hard" }, "แชทนี้ยาวมากแล้ว ตอนนี้ส่งข้อความเพิ่มไม่ได้ คุยกับเจ้าหน้าที่ตัวจริง หรือกดลบแชทเพื่อเริ่มใหม่ได้"),
    h("form", { class: "chat-form", onsubmit: submit },
      h("label", { class: "sr", for: "chat-input" }, "ข้อความถึงเจน"), ta,
      h("button", { class: "btn-primary", type: "submit", "data-testid": "chat-send" }, "ส่ง")),
  );
}
