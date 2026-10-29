import "./styles.css";
import { PRODUCT_NAME, PRODUCT_NAME_EN, MIN_AGE, THAI_COPY_STATUS, MATCHER, modelCardPickEnabled } from "./config";
import { matcherEnabled, readMatcherFlag, type IntentMatcher } from "./core/matcher";
import markSvg from "./assets/mark.svg?raw";
import type { CrisisCategory, Intent, IntentResult } from "./core/types";
import { type AgePick } from "./core/age";
import { draftSummaryForAge } from "./core/summary-age";
import { detectCrisis, crisisOrder as pinnedCrisisOrder } from "./core/crisis";
import { crisisOrder, crisisCallNowLine } from "./core/crisis-order";
import { suggestServices, CRISIS_LINES, DATA_VERSION, INTENT_LABEL_TH, SUPPORT_LINE_TH, serviceHoursLabel, canPrepareMessage, type Suggestion } from "./core/referral";
import { hoursLabel, hoursCitation } from "./core/openNow";
import { finalizeSummary, stripPII } from "./core/summary";
import { classifyWithFallback, polishWithFallback, type LLMAdapter } from "./llm/adapter";
import { preloadModel, modelPillCopy, getWarmupRemainingMs, type ModelStatus } from "./llm/runtime";
import { toDialogModel } from "./llm/dialogModel";
import { shouldApplyAsyncResult, newNeedGate, beginNeed, bumpNeed, needBusy, endNeed } from "./core/dialog";
import { h } from "./ui/dom";
import { applyThinkingHint } from "./ui/thinking";
import { applyChatThinkingPhrase } from "./ui/chat-thinking";
import { newChat, chatView, beginQuiz, type ChatState } from "./ui/chat";
import { ART_CREDIT, janeImg, preloadJaneArt, welcomeStars } from "./ui/jane";
import { QUIZ_MENU, pickQuizItems, quizCopyStatus } from "./core/quiz";

/* ------------------------------------------------------------------------------------------
 * Privacy rules enforced here:
 *  - Chat/referral state lives in this one in-memory object. Nothing user-identifying is written
 *    to localStorage, sessionStorage, IndexedDB, cookies or Cache Storage. The only sessionStorage
 *    write is a single non-personal flag (`jane.webgpu.failed=1`) when WebGPU dies, so a reload
 *    skips the broken GPU and tries WASM. No console logging of user text.
 *  - No fetch/XHR anywhere in the app. Source URLs are shown as text, not links.
 * ---------------------------------------------------------------------------------------- */

type Screen = "start" | "underage" | "describe" | "suggest" | "summary" | "handoff" | "crisis" | "neutral" | "chat";

interface State {
  screen: Screen;
  ageBand: AgePick;
  needText: string;
  result: IntentResult | null;
  suggestions: Suggestion[];
  selected: Suggestion | null;
  summary: string;
  crisisCategories: CrisisCategory[];
  crisisFrom: Screen;
  /** Crisis words seen in a benign context: flow continues, crisis strip stays on top. */
  crisisBanner: CrisisCategory[];
  /** Multi-turn chat (v2), memory only; erase and quick exit drop it with the rest of the state. */
  chat: ChatState | null;
  /** Where the referral cards were opened from: the one-shot describe screen or the chat. */
  referralFrom: "describe" | "chat";
}

const fresh = (): State => ({
  screen: "start", ageBand: "unspecified", needText: "", result: null, suggestions: [],
  selected: null, summary: "", crisisCategories: [], crisisFrom: "describe", crisisBanner: [], chat: null, referralFrom: "describe",
});

let state: State = fresh();
/** In-browser model (optional). Loads in the background; the flow uses rules until it is ready. */
let model: LLMAdapter | null = null;
/** Embedding matcher: null unless the desktop-dev flag is on. Never set on phones. */
let matcher: IntentMatcher | null = null;
let modelStatus: ModelStatus = { state: "loading", runtime: "rules", label: "", progress: 0 };
let polishNote = false; // summary line was reworded by the model
const need = newNeedGate(); // classify generation; busy is owned by the in-flight seq only

const app = document.getElementById("app")!;
document.title = `${PRODUCT_NAME} · ${PRODUCT_NAME_EN} (เดโม)`;

/** The brand mark (constant, project-drawn SVG; never user content). */
function mark(cls: string): HTMLElement {
  const el = h("span", { class: `mark ${cls}`, "aria-hidden": "true", "data-testid": `mark-${cls}` });
  el.innerHTML = markSvg;
  return el;
}

function go(next: Partial<State>) {
  state = { ...state, ...next };
  render();
  window.scrollTo(0, 0);
}

function dropInflightChat() {
  bumpNeed(need);
  if (state.chat) {
    state.chat.session.abort();
    state.chat.busy = false;
    state.chat.thinking = false;
    state.chat.thinkingPhrase = null;
    state.chat.thinkingToken = 0;
    state.chat.thinkingHint = null;
  }
}

function eraseAll(to: Screen = "start") {
  dropInflightChat();
  state = { ...fresh(), screen: to };
  render();
}

function quickExit() {
  // Wipe memory, drop history entry text, show a neutral page. No navigation, no request.
  dropInflightChat();
  state = { ...fresh(), screen: "neutral" };
  try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ }
  document.title = "บันทึก";
  // Discreet: the tab icon goes neutral too.
  document.querySelectorAll('link[rel="icon"]').forEach((l) => l.setAttribute("href", "data:,"));
  render();
}

/* ------------------------------------------ layout ------------------------------------------ */
function header() {
  if (state.screen === "neutral") return null;
  return h("header", { class: "bar" },
    h("div", { class: "brand", "data-testid": "brand" }, mark("small"), PRODUCT_NAME, h("span", { class: "en-name" }, PRODUCT_NAME_EN), h("span", { class: "tag" }, "เดโม")),
    h("div", { class: "bar-actions" },
      state.screen !== "start" && state.screen !== "crisis" &&
        h("button", { class: "btn-sos", "data-testid": "sos", onclick: () => { dropInflightChat(); go({ screen: "crisis", crisisCategories: [], crisisFrom: state.screen }); } }, "ขอความช่วยเหลือด่วน"),
      state.screen === "chat" && state.chat && !state.chat.readOnly && !state.chat.busy && !state.chat.quiz && pickQuizItems(state.ageBand, null, undefined, undefined, quizCopyStatus()).length > 0 &&
        h("button", { class: "btn-ghost", "data-testid": "quiz-menu", onclick: () => beginQuiz(state.chat!, null, chatHooks) }, QUIZ_MENU),
      state.screen !== "start" && h("button", { class: "btn-ghost", "data-testid": "erase", onclick: () => eraseAll("start") }, "ลบแชท"),
      h("button", { class: "btn-exit", "data-testid": "quick-exit", "aria-label": "ออกทันที ✕", onclick: quickExit }, "ออกทันที ✕"),
    ),
    modelPill());
}

function modelPill() {
  const m = modelStatus;
  const { text, title } = modelPillCopy(m, { modelPick: modelCardPickEnabled() });
  return h("div", { class: `model-pill ${m.state}`, "data-testid": "model-status", "data-state": m.state, "data-runtime": m.runtime, title }, text);
}

function footer() {
  if (state.screen === "neutral") return null;
  return h("footer", { class: "foot" },
    h("p", { class: "nmad", "data-testid": "not-medical-advice" }, "ข้อมูลทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ · General information, not medical advice"),
    THAI_COPY_STATUS === "draft" && h("p", { class: "draft", "data-testid": "draft-flag" }, "ข้อความภาษาไทยเป็นฉบับร่าง รอผู้เชี่ยวชาญตรวจ · Thai copy is DRAFT, pending review"),
    h("p", { class: "art-credit", "data-testid": "art-credit" }, ART_CREDIT),
    h("p", { class: "meta" }, `ข้อมูลบริการตรวจสอบเมื่อ ${DATA_VERSION} ข้อมูลทุกอย่างประมวลผลในเครื่องนี้ ไม่มีการบันทึก`),
  );
}

/* ------------------------------------------ screens ------------------------------------------ */
function startScreen() {
  const band = (b: AgePick, label: string) =>
    h("button", { class: "btn-choice", "data-testid": `age-${b}`, onclick: () => { bumpNeed(need); go({ ageBand: b, screen: "describe" }); } }, label);
  return h("main", { class: "screen start", "data-testid": "screen-start" },
    h("div", { class: "hero" }, janeImg("header"), welcomeStars(),
      h("h1", {}, `สวัสดี เราคือ ${PRODUCT_NAME}`, h("span", { class: "en-name" }, PRODUCT_NAME_EN))),
    h("p", { class: "lead" }, "ผู้ช่วยหาที่ปรึกษาเรื่องเพศและอนามัยเจริญพันธุ์ ที่เป็นมิตรกับวัยรุ่น"),
    h("ul", { class: "promises" },
      h("li", { "data-testid": "promise-medical" }, h("strong", {}, "ไม่ใช่คำแนะนำทางการแพทย์ "),
        `${PRODUCT_NAME} เป็น AI ไม่ใช่คนหรือแพทย์ ให้ข้อมูลทั่วไปและช่วยพาคุณไปคุยกับเจ้าหน้าที่ตัวจริง`),
      h("li", { "data-testid": "promise-privacy" }, h("strong", {}, "เป็นความลับ "),
        "ทุกอย่างทำงานในเบราว์เซอร์เครื่องนี้ ไม่มีอะไรถูกส่งออกไป ไม่มีการเก็บบันทึกแชท ปิดหน้านี้หรือกด “ลบแชท” แล้วข้อความหายทันที"),
      h("li", { "data-testid": "promise-age" }, h("strong", {}, `สำหรับอายุ ${MIN_AGE} ปีขึ้นไป `),
        "เราถามแค่ช่วงอายุ ไม่ถามวันเกิด ชื่อ หรือที่อยู่"),
    ),
    h("p", { class: "q", "data-testid": "age-question" }, "คุณอายุเท่าไร (เลือกช่วง ไม่อยากบอกก็ได้)"),
    h("p", { class: "note", "data-testid": "age-adult-note" }, "บางคำตอบมีไว้สำหรับอายุ 18 ปีขึ้นไปเท่านั้น"),
    h("div", { class: "choices" },
      band("15-17", `${MIN_AGE}–17 ปี`), band("18-24", "18–24 ปี"), band("25+", "25 ปีขึ้นไป"), band("unspecified", "ไม่อยากบอก"),
    ),
    h("button", { class: "link", "data-testid": "age-under", onclick: () => go({ screen: "underage" }) }, `อายุต่ำกว่า ${MIN_AGE} ปี`),
    h("p", { class: "en" }, `${PRODUCT_NAME_EN}: an AI, not a doctor. Runs on this device only; nothing is sent or logged. Demo for ages ${MIN_AGE}+.`),
  );
}

function underageScreen() {
  return h("main", { class: "screen", "data-testid": "screen-underage" },
    h("h1", {}, "ขอบคุณที่บอกพี่เจน"),
    h("p", {}, `เดโมนี้ทำสำหรับอายุ ${MIN_AGE} ปีขึ้นไป แต่คุณยังขอความช่วยเหลือได้เสมอ:`),
    callList(["1323", "1300"]),
    h("p", {}, `เรื่องท้องหรือเอชไอวี โทร 1663 ปรึกษาฟรี (ข้อมูล กรมประชาสัมพันธ์) ${serviceHoursLabel("hotline_1663")} (ข้อมูล สปสช.)`),
    h("a", { class: "btn-call", href: "tel:1663" }, "โทร 1663"),
    h("button", { class: "btn-ghost", onclick: () => eraseAll("start") }, "กลับหน้าแรก"),
  );
}

function describeScreen() {
  const ta = h("textarea", {
    id: "need", "data-testid": "need-input", rows: 5, maxlength: 600, autocomplete: "off", spellcheck: "false",
    placeholder: "เล่าสั้น ๆ ว่ากังวลเรื่องอะไร เช่น “ประจำเดือนมาช้า กลัวท้อง ไม่กล้าบอกใคร”", value: state.needText,
  }) as HTMLTextAreaElement;
  ta.addEventListener("input", () => { state.needText = ta.value; });
  const submit = async () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    await handleNeed(text);
  };
  return h("main", { class: "screen", "data-testid": "screen-describe" },
    h("h1", {}, "อยากคุยเรื่องอะไร"),
    h("p", { class: "lead" }, "พิมพ์ภาษาไทยได้เลย ไม่ต้องบอกชื่อ เบอร์โทร หรือข้อมูลส่วนตัว"),
    h("label", { for: "need", class: "sr" }, "เรื่องที่อยากปรึกษา"), ta,
    h("button", { class: "btn-primary", "data-testid": "need-submit", onclick: submit, disabled: needBusy(need) }, needBusy(need) ? "กำลังคิด…" : "หาที่ปรึกษา"),
    h("button", { class: "btn-ghost", "data-testid": "open-chat", onclick: openChat, disabled: needBusy(need) }, "หรือคุยกับพี่เจนแบบแชท (Beta)"),
  );
}

/* --------------------------------------- chat (v2) --------------------------------------- */
function openChat() {
  dropInflightChat();
  if (!state.chat) {
    state.chat = newChat(state.ageBand, toDialogModel(model), matcher, {
      warmupRemainingMs: getWarmupRemainingMs,
    });
  }
  go({ screen: "chat" });
}

const chatHooks = {
  rerender: () => { if (state.screen === "chat") render(); },
  updateThinkingHint: (text: string) => { applyThinkingHint(app, text); },
  updateThinkingPhrase: (text: string) => { applyChatThinkingPhrase(app, text); },
  // Crisis rules decided this before any model step; show the existing crisis screen.
  crisis: (categories: CrisisCategory[]) => { bumpNeed(need); go({ screen: "crisis", crisisCategories: categories, crisisFrom: "chat" }); },
  // In-chat referral (plan v2 §5): the same service cards, summary, approval and DEMO handoff as the one-shot flow.
  referral: (intents: Intent[], banner?: CrisisCategory[]) => openReferralFromChat(intents, banner),
  seq: () => need.seq,
};

/** Sticky strip from the current reply, else the session's crisisFired categories (same as later chat turns). */
function chatCrisisBanner(passed?: CrisisCategory[]): CrisisCategory[] {
  if (passed?.length) return passed;
  const d = state.chat?.session.state;
  return d?.crisisFired ? d.crisisCategories : [];
}

/** Her last chat message (PII-stripped) is the summary's need line; the chat itself stays in memory to return to. */
function openReferralFromChat(intents: Intent[], banner?: CrisisCategory[]) {
  const lastUser = [...(state.chat?.messages ?? [])].reverse().find((m) => m.from === "user");
  const list = (intents.length ? intents : ["other"]) as Intent[];
  const result: IntentResult = { intents: list, scores: {}, source: "rules" };
  go({ needText: lastUser ? stripPII(lastUser.text) : "", result, suggestions: suggestServices(list, new Date()), screen: "suggest", referralFrom: "chat", crisisBanner: chatCrisisBanner(banner) });
}
const backToChat = () => state.referralFrom === "chat" && !!state.chat;
/** SOS from chat-opened cards/summary must land back in the same chat, not on describe. */
function crisisContinueScreen(): Screen {
  if (state.crisisFrom === "start") return "start";
  if ((state.crisisFrom === "chat" || backToChat()) && state.chat) return "chat";
  return "describe";
}

function chatScreen() {
  return chatView(state.chat!, chatHooks);
}

async function handleNeed(text: string) {
  // Safety first: rule-based crisis check, before and independent of any model. Never gated on busy.
  const c = detectCrisis(text);
  if (c.crisis) { bumpNeed(need); go({ needText: "", screen: "crisis", crisisCategories: c.categories, crisisFrom: "describe" }); return; }
  const my = beginNeed(need);
  render();
  try {
    const delayMs = Number(new URLSearchParams(location.search).get("classifyDelayMs") || 0);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const result = await classifyWithFallback(text, model);
    if (!shouldApplyAsyncResult(my, need.seq, state.screen)) return;
    const suggestions = suggestServices(result.intents, new Date());
    go({ needText: text, result, suggestions, screen: "suggest", referralFrom: "describe", crisisBanner: c.level === "banner" ? c.categories : [] });
  } finally {
    const owns = need.seq === my;
    endNeed(need, my);
    if (owns) render();
  }
}

function statusBadge(s: Suggestion) {
  const cls = s.status.state === "open" ? "open" : s.status.state === "closed" ? "closed" : "unknown";
  return h("span", { class: `badge ${cls}`, "data-testid": `status-${s.service.id}`, "data-state": s.status.state }, s.status.label_th);
}

function sourceLine(src: { url: string; checked: string }[]) {
  return h("p", { class: "src" }, "ที่มา: ", ...src.slice(0, 1).map((x) => h("span", { class: "url" }, `${x.url} (ตรวจ ${x.checked})`)));
}

/** Hours with their sources; on conflict the narrower window is used and every source is cited. */
function hoursBlock(svc: Suggestion["service"]) {
  const c = hoursCitation(svc);
  return h("div", { class: "hours", "data-testid": `hours-${svc.id}`, "data-conflict": String(c.conflict) },
    h("p", { class: "hours-eff" }, `เวลา: ${c.effective_th}`),
    c.conflict_note_th && h("p", { class: "note" }, c.conflict_note_th),
    h("ul", { class: "hours-src" }, ...c.lines.map((l) => h("li", {}, l))),
  );
}

function channelEl(ch: { type: string; label_th: string; href?: string }) {
  return ch.href
    ? h("a", { class: "btn-call small", href: ch.href }, ch.label_th)
    : h("span", { class: "chan" }, ch.label_th);
}

function crisisStrip(categories: CrisisCategory[]) {
  return h("aside", { class: "crisis-strip", "data-testid": "crisis-banner" },
    h("p", {}, h("strong", {}, "ถ้าเรื่องนี้เกิดกับคุณ หรือคุณไม่ปลอดภัยตอนนี้ "), "โทรฟรี 24 ชั่วโมง:"),
    h("div", { class: "chans" }, ...pinnedCrisisOrder(categories).map((n) => h("a", { class: "btn-call small danger", href: `tel:${n}` }, `โทร ${n}`))),
  );
}

function suggestScreen() {
  const r = state.result!;
  const top = r.intents[0] as Intent;
  return h("main", { class: "screen", "data-testid": "screen-suggest" },
    state.crisisBanner.length > 0 && crisisStrip(state.crisisBanner),
    h("p", { class: "support", "data-testid": "support-line" }, SUPPORT_LINE_TH[top]),
    h("p", { class: "intent", "data-testid": "intent-label", "data-intent": top, "data-source": r.source },
      "เรื่องที่เราเข้าใจ: ", h("strong", {}, r.intents.slice(0, 2).map((i) => INTENT_LABEL_TH[i]).join(" · "))),
    h("h2", {}, "ที่ที่คุยต่อได้กับเจ้าหน้าที่ตัวจริง"),
    ...state.suggestions.map((s, i) =>
      h("section", { class: "card", "data-testid": `service-${s.service.id}`, "data-rank": i },
        h("div", { class: "card-head" }, h("h3", {}, s.service.name_th), statusBadge(s)),
        h("p", {}, s.service.description_th),
        hoursBlock(s.service),
        h("div", { class: "chans" }, ...s.service.channels.map(channelEl)),
        sourceLine(s.service.sources),
        canPrepareMessage(s.service) && h("button", { class: "btn-primary", "data-testid": `pick-${s.service.id}`, onclick: () => pick(s) }, "ให้ช่วยเตรียมข้อความถึงที่นี่"),
      )),
    backToChat()
      ? h("button", { class: "btn-ghost", "data-testid": "retell", "data-to": "chat", onclick: () => go({ screen: "chat" }) }, "กลับไปคุยกับพี่เจนต่อ")
      : h("button", { class: "btn-ghost", "data-testid": "retell", onclick: () => go({ screen: "describe" }) }, "ไม่ใช่เรื่องนี้ / เล่าใหม่"),
  );
}

async function pick(s: Suggestion) {
  if (!canPrepareMessage(s.service)) return;
  const draft = draftSummaryForAge({ service: s.service, needText: state.needText, intent: state.result!.intents[0], ageBand: state.ageBand });
  polishNote = false;
  go({ selected: s, summary: draft, screen: "summary" });
  // Non-blocking: if a model is ready, reword her line in the background; only applied if she hasn't edited yet.
  if (model?.ready()) {
    const polished = await polishWithFallback(draft, model);
    if (state.screen === "summary" && state.summary === draft && polished !== draft) {
      state.summary = polished; polishNote = true; render();
    }
  }
}

function summaryScreen() {
  const ta = h("textarea", { "data-testid": "summary-input", rows: 10, spellcheck: "false", value: state.summary }) as HTMLTextAreaElement;
  ta.addEventListener("input", () => { state.summary = ta.value; });
  return h("main", { class: "screen", "data-testid": "screen-summary" },
    h("h1", {}, "ร่างข้อความสั้น ๆ ถึงเจ้าหน้าที่"),
    h("p", { class: "lead" }, "แก้ไขได้ทุกบรรทัด ลบส่วนที่ไม่อยากบอกได้ ชื่อ เบอร์โทร โรงเรียน และที่อยู่จะถูกลบออกอัตโนมัติ"),
    ta,
    polishNote && h("p", { class: "note", "data-testid": "polish-note" }, "เรียบเรียงโดยโมเดลในเครื่อง ตรวจและแก้ได้ ",
      h("button", { class: "link", "data-testid": "polish-undo", onclick: () => { polishNote = false; go({ summary: draftSummaryForAge({ service: state.selected!.service, needText: state.needText, intent: state.result!.intents[0], ageBand: state.ageBand }) }); } }, "ใช้ข้อความเดิม")),
    h("div", { class: "row" },
      h("button", { class: "btn-primary", "data-testid": "approve", onclick: () => approve(ta.value) }, "ฉันยืนยัน"),
      h("button", { class: "btn-ghost", "data-testid": "cancel", onclick: () => go({ summary: "", selected: null, screen: backToChat() ? "chat" : "suggest" }) }, "ยกเลิก"),
    ),
  );
}

function approve(edited: string) {
  // Crisis override applies to anything she types, including edits to the summary.
  const c = detectCrisis(edited);
  if (c.crisis) { go({ summary: "", screen: "crisis", crisisCategories: c.categories, crisisFrom: backToChat() ? "chat" : "describe" }); return; }
  go({ summary: finalizeSummary(edited), screen: "handoff" });
}

function handoffScreen() {
  const s = state.selected!;
  return h("main", { class: "screen", "data-testid": "screen-handoff" },
    h("div", { class: "demo-banner", "data-testid": "demo-banner" },
      h("strong", {}, "DEMO — ยังไม่ได้ส่งอะไรเลย"), h("span", {}, "DEMO — nothing was sent")),
    h("p", {}, `นี่คือข้อความที่เจ้าหน้าที่ ${s.service.name_th} จะได้รับ ถ้าบริการนี้เชื่อมต่อจริงในอนาคต`),
    h("pre", { class: "handoff", "data-testid": "handoff-text" }, state.summary),
    h("h2", {}, "ติดต่อเองได้ตอนนี้"),
    h("p", {}, statusBadge(s), " ", `เวลา: ${hoursLabel(s.service.hours)}`),
    h("div", { class: "chans" }, ...s.service.channels.map(channelEl)),
    h("p", { class: "en" }, "This is a simulated warm handoff. No message, call or data left this device."),
    h("button", { class: "btn-ghost", "data-testid": "erase-restart", onclick: () => eraseAll("start") }, "ลบแชทนี้และเริ่มใหม่"),
  );
}

function callList(order: string[]) {
  const byNum = new Map(CRISIS_LINES.map((c) => [c.number, c]));
  return h("ul", { class: "calls" }, ...order.map((n) => byNum.get(n)).filter(Boolean).map((c) =>
    h("li", { "data-testid": `crisis-${c!.number}` },
      h("a", { class: "btn-call big", href: c!.href }, `โทร ${c!.number}`),
      h("div", {}, h("strong", {}, c!.name_th), h("span", {}, ` ${c!.hours_th} · ${c!.when_th}`)),
    )));
}

function crisisScreen() {
  const order = crisisOrder(state.crisisCategories);
  return h("main", { class: "screen crisis", "data-testid": "screen-crisis" },
    h("h1", {}, "ตอนนี้ความปลอดภัยของคุณสำคัญที่สุด"),
    h("p", { class: "lead" }, "คุณไม่ได้อยู่คนเดียว มีคนพร้อมช่วยตอนนี้ กดที่เบอร์เพื่อโทรได้ทันที"),
    callList(order),
    state.crisisCategories.includes("sexual_violence") && h("p", {}, "ถ้าถูกล่วงละเมิดทางเพศ ไปที่ศูนย์พึ่งได้ (OSCC) ในโรงพยาบาลรัฐได้ ดูแลด้านการแพทย์ ให้คำปรึกษา และช่วยด้านสังคมและกฎหมาย"),
    h("p", {}, "ถ้ากำลังอยู่ในอันตรายตอนนี้ ", h("span", { "data-testid": "crisis-call-now" }, crisisCallNowLine(state.crisisCategories)), ` เรื่องท้องหรือเอชไอวี โทร 1663 ปรึกษาฟรี (ข้อมูล กรมประชาสัมพันธ์) ${serviceHoursLabel("hotline_1663")} (ข้อมูล สปสช.)`),
    h("p", { class: "src" }, "ที่มา: กรมสุขภาพจิต, กระทรวง พม., GCC Call Center ภาครัฐ, ศูนย์รับแจ้งเหตุ 191, สปสช. (1663), กรมประชาสัมพันธ์ (1663), กระทรวงสาธารณสุข (ศูนย์พึ่งได้) (ตรวจ 2026-10-23)"),
    h("button", { class: "btn-ghost", "data-testid": "crisis-continue", onclick: () => { bumpNeed(need); go({ screen: crisisContinueScreen() }); } },
      "ฉันปลอดภัยแล้ว กลับไปต่อ"),
  );
}

function neutralScreen() {
  return h("main", { class: "neutral", "data-testid": "screen-neutral" },
    h("h1", {}, "บันทึก"),
    h("p", {}, "รายการซื้อของ: ไข่ไก่ นมจืด ขนมปัง ผักบุ้ง"),
    h("p", {}, "การบ้านคณิตศาสตร์ หน้า 42 ข้อ 1–10"),
  );
}

const SCREENS: Record<Screen, () => HTMLElement> = {
  start: startScreen, underage: underageScreen, describe: describeScreen, suggest: suggestScreen,
  summary: summaryScreen, handoff: handoffScreen, crisis: crisisScreen, neutral: neutralScreen, chat: chatScreen,
};

function render() {
  const main = SCREENS[state.screen]();
  app.replaceChildren(...[header(), main, footer()].filter(Boolean) as Node[]);
  app.dataset.screen = state.screen;
  revealQuizArt();
}

/** Keep quiz art below the sticky header. Answering a question scrolls the option into view,
 *  then the success/thinking image mounts at the top of the panel — under the ~125px bar.
 *  Never run on the crisis screen: art must not cover or delay those helplines. */
function revealQuizArt() {
  if (state.screen === "crisis") return;
  const el = app.querySelector("[data-testid=quiz-success], [data-testid=quiz-thinking]") as HTMLElement | null;
  if (!el) return;
  const bar = app.querySelector("header.bar") as HTMLElement | null;
  const pad = (bar?.getBoundingClientRect().height ?? 0) + 8;
  const top = el.getBoundingClientRect().top;
  if (top < pad) window.scrollBy(0, top - pad);
}

render();
preloadJaneArt();
const applyAdapter = (a: LLMAdapter | null) => {
  model = a;
  state.chat?.session.setModel(toDialogModel(a));
};
const applyMatcher = (m: IntentMatcher | null) => {
  matcher = m;
  state.chat?.session.setMatcher(m);
};
async function resolveMatcher(): Promise<IntentMatcher | null> {
  if (!import.meta.env.DEV) return null;
  const search = typeof location !== "undefined" ? location.search : "";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (!matcherEnabled(readMatcherFlag(MATCHER, search), ua)) return null;
  const { loadMatcher } = await import("./matcher/load");
  return loadMatcher({ search });
}
// Status updates only swap the small indicator, so typing is never interrupted.
// Same trigger as v2/answer-bank-chat: start after first paint. Flag-on adds
// preloadOnce (no retry). MODEL_CARD_PICK only gates pick UI, not this load.
preloadModel((st) => {
  modelStatus = st;
  const old = app.querySelector('[data-testid="model-status"]');
  if (old) old.replaceWith(modelPill());
}, { onAdapter: applyAdapter }).then(applyAdapter);
void resolveMatcher().then(applyMatcher);
