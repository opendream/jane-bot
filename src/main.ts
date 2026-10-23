import "./styles.css";
import { PRODUCT_NAME, PRODUCT_NAME_EN, MIN_AGE, THAI_COPY_STATUS } from "./config";
import markSvg from "./assets/mark.svg?raw";
import type { AgeBand, CrisisCategory, Intent, IntentResult } from "./core/types";
import { detectCrisis, crisisOrder, showCrisisOfficerLine } from "./core/crisis";
import { suggestServices, CRISIS_LINES, DATA_VERSION, INTENT_LABEL_TH, SUPPORT_LINE_TH, serviceHoursLabel, type Suggestion } from "./core/referral";
import { hoursLabel, hoursCitation } from "./core/openNow";
import { draftSummary, finalizeSummary, stripPII } from "./core/summary";
import { classifyWithFallback, polishWithFallback, type LLMAdapter } from "./llm/adapter";
import { startModel, type ModelStatus } from "./llm/runtime";
import { toDialogModel } from "./llm/dialogModel";
import { h } from "./ui/dom";
import { newChat, chatView, type ChatState } from "./ui/chat";

/* ------------------------------------------------------------------------------------------
 * Privacy rules enforced here:
 *  - All state lives in this one in-memory object. Nothing is written to localStorage,
 *    sessionStorage, IndexedDB, cookies or Cache Storage. No console logging of user text.
 *  - No fetch/XHR anywhere in the app. Source URLs are shown as text, not links.
 * ---------------------------------------------------------------------------------------- */

type Screen = "start" | "underage" | "describe" | "suggest" | "summary" | "handoff" | "crisis" | "neutral" | "chat";

interface State {
  screen: Screen;
  ageBand: AgeBand;
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
let modelStatus: ModelStatus = { state: "loading", runtime: "rules", label: "", progress: 0 };
let busy = false; // waiting for the model on a classify call
let polishNote = false; // summary line was reworded by the model

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

function eraseAll(to: Screen = "start") {
  state = { ...fresh(), screen: to };
  render();
}

function quickExit() {
  // Wipe memory, drop history entry text, show a neutral page. No navigation, no request.
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
        h("button", { class: "btn-sos", "data-testid": "sos", onclick: () => go({ screen: "crisis", crisisCategories: [], crisisFrom: state.screen }) }, "ช่วยด่วน"),
      state.screen !== "start" && h("button", { class: "btn-ghost", "data-testid": "erase", onclick: () => eraseAll("start") }, "ลบแชท"),
      h("button", { class: "btn-exit", "data-testid": "quick-exit", "aria-label": "ออกด่วน (quick exit)", onclick: quickExit }, "ออกด่วน ✕"),
    ),
    modelPill());
}

function modelPill() {
  const m = modelStatus;
  let text: string, title: string;
  if (m.state === "ready") {
    text = `🔒 โมเดลในเครื่อง: ${m.label} · ออฟไลน์`;
    title = `On-device model: ${m.label} (${m.runtime === "webgpu" ? "WebGPU" : "WASM, CPU"}) / offline`;
  } else if (m.state === "loading" && m.runtime !== "rules") {
    text = `⏳ กำลังโหลดโมเดล ${m.label} ${Math.round(m.progress * 100)}% · ใช้งานได้ตามปกติระหว่างนี้`;
    title = `Loading on-device model ${m.label}; the referral flow works meanwhile (rules)`;
  } else if (m.state === "loading") {
    text = "⏳ กำลังตรวจหาโมเดลในเครื่อง · ใช้งานได้ตามปกติ"; title = "Checking for an on-device model";
  } else {
    text = "🔒 ใช้กฎพื้นฐาน (ไม่มีโมเดล) · ออฟไลน์"; title = "Rules only, no model / offline";
  }
  return h("div", { class: `model-pill ${m.state}`, "data-testid": "model-status", "data-state": m.state, "data-runtime": m.runtime, title }, text);
}

function footer() {
  if (state.screen === "neutral") return null;
  return h("footer", { class: "foot" },
    h("p", { class: "nmad", "data-testid": "not-medical-advice" }, "ข้อมูลทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ · General information, not medical advice"),
    THAI_COPY_STATUS === "draft" && h("p", { class: "draft", "data-testid": "draft-flag" }, "ข้อความภาษาไทยเป็นฉบับร่าง รอผู้เชี่ยวชาญตรวจ · Thai copy is DRAFT, pending review"),
    h("p", { class: "meta" }, `ข้อมูลบริการตรวจสอบเมื่อ ${DATA_VERSION} · ทุกอย่างทำงานในเครื่องนี้ ไม่มีการบันทึก`),
  );
}

/* ------------------------------------------ screens ------------------------------------------ */
function startScreen() {
  const band = (b: AgeBand, label: string) =>
    h("button", { class: "btn-choice", "data-testid": `age-${b}`, onclick: () => go({ ageBand: b, screen: "describe" }) }, label);
  return h("main", { class: "screen start", "data-testid": "screen-start" },
    h("div", { class: "hero" }, mark("hero"),
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
    h("p", { class: "q" }, "คุณอายุเท่าไร (เลือกช่วง)"),
    h("div", { class: "choices" },
      band("15-17", `${MIN_AGE}–17 ปี`), band("18-24", "18–24 ปี"), band("25+", "25 ปีขึ้นไป"), band("unspecified", "ไม่อยากบอก"),
    ),
    h("button", { class: "link", "data-testid": "age-under", onclick: () => go({ screen: "underage" }) }, `อายุต่ำกว่า ${MIN_AGE} ปี`),
    h("p", { class: "en" }, `${PRODUCT_NAME_EN}: an AI, not a doctor. Runs on this device only; nothing is sent or logged. Demo for ages ${MIN_AGE}+.`),
  );
}

function underageScreen() {
  return h("main", { class: "screen", "data-testid": "screen-underage" },
    h("h1", {}, "ขอบคุณที่บอกเรา"),
    h("p", {}, `เดโมนี้ทำสำหรับอายุ ${MIN_AGE} ปีขึ้นไป แต่คุณยังขอความช่วยเหลือได้เสมอ:`),
    callList(["1323", "1300"]),
    h("p", {}, `เรื่องท้องหรือเอชไอวี โทร 1663 ปรึกษาฟรี ${serviceHoursLabel("hotline_1663")} รวมวันหยุด (ข้อมูล สปสช.)`),
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
    h("p", { class: "lead" }, "พิมพ์ภาษาไทยได้เลย ไม่ต้องบอกชื่อ เบอร์โทร หรือโรงเรียน"),
    h("label", { for: "need", class: "sr" }, "เรื่องที่อยากปรึกษา"), ta,
    h("button", { class: "btn-primary", "data-testid": "need-submit", onclick: submit, disabled: busy }, busy ? "กำลังคิด…" : "หาที่ปรึกษา"),
    h("button", { class: "btn-ghost", "data-testid": "open-chat", onclick: openChat }, "หรือคุยกับพี่เจนแบบแชท (ทดลอง)"),
  );
}

/* --------------------------------------- chat (v2) --------------------------------------- */
function openChat() {
  if (!state.chat) state.chat = newChat(state.ageBand, toDialogModel(model));
  go({ screen: "chat" });
}

const chatHooks = {
  rerender: () => { if (state.screen === "chat") render(); },
  // Crisis rules decided this before any model step; show the existing crisis screen.
  crisis: (categories: CrisisCategory[]) => go({ screen: "crisis", crisisCategories: categories, crisisFrom: "chat" }),
  // In-chat referral (plan v2 §5): the same service cards, summary, approval and DEMO handoff as the one-shot flow.
  referral: (intents: Intent[]) => openReferralFromChat(intents),
};

/** Her last chat message (PII-stripped) is the summary's need line; the chat itself stays in memory to return to. */
function openReferralFromChat(intents: Intent[]) {
  const lastUser = [...(state.chat?.messages ?? [])].reverse().find((m) => m.from === "user");
  const list = (intents.length ? intents : ["other"]) as Intent[];
  const result: IntentResult = { intents: list, scores: {}, source: "rules" };
  go({ needText: lastUser ? stripPII(lastUser.text) : "", result, suggestions: suggestServices(list, new Date()), screen: "suggest", referralFrom: "chat", crisisBanner: [] });
}
const backToChat = () => state.referralFrom === "chat" && !!state.chat;

function chatScreen() {
  return chatView(state.chat!, chatHooks);
}

async function handleNeed(text: string) {
  // Safety first: rule-based crisis check, before and independent of any model.
  const c = detectCrisis(text);
  if (c.crisis) { go({ needText: "", screen: "crisis", crisisCategories: c.categories, crisisFrom: "describe" }); return; }
  busy = true; render();
  const result = await classifyWithFallback(text, model).finally(() => { busy = false; });
  const suggestions = suggestServices(result.intents, new Date());
  go({ needText: text, result, suggestions, screen: "suggest", referralFrom: "describe", crisisBanner: c.level === "banner" ? c.categories : [] });
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
    h("div", { class: "chans" }, ...crisisOrder(categories).map((n) => h("a", { class: "btn-call small danger", href: `tel:${n}` }, `โทร ${n}`))),
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
        s.service.verification !== "verified" && h("p", { class: "warn" }, "⚠ เวลาให้บริการยังยืนยันไม่ได้ทั้งหมด"),
        sourceLine(s.service.sources),
        h("button", { class: "btn-primary", "data-testid": `pick-${s.service.id}`, onclick: () => pick(s) }, "ให้ช่วยเตรียมข้อความถึงที่นี่"),
      )),
    backToChat()
      ? h("button", { class: "btn-ghost", "data-testid": "retell", "data-to": "chat", onclick: () => go({ screen: "chat" }) }, "กลับไปคุยกับพี่เจนต่อ")
      : h("button", { class: "btn-ghost", "data-testid": "retell", onclick: () => go({ screen: "describe" }) }, "ไม่ใช่เรื่องนี้ / เล่าใหม่"),
  );
}

async function pick(s: Suggestion) {
  const draft = draftSummary({ service: s.service, needText: state.needText, intent: state.result!.intents[0], ageBand: state.ageBand });
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
      h("button", { class: "link", "data-testid": "polish-undo", onclick: () => { polishNote = false; go({ summary: draftSummary({ service: state.selected!.service, needText: state.needText, intent: state.result!.intents[0], ageBand: state.ageBand }) }); } }, "ใช้ข้อความเดิม")),
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
    showCrisisOfficerLine(state.crisisCategories) && h("p", { "data-testid": "crisis-female-officer" }, "ถ้าจะแจ้งความเรื่องถูกล่วงละเมิดทางเพศ ผู้เสียหายที่เป็นผู้หญิงขอให้พนักงานสอบสวนหญิงเป็นผู้สอบปากคำได้"),
    h("p", {}, `ถ้ากำลังอยู่ในอันตรายตอนนี้ โทร 191 หรือ 1669 ทันที เรื่องท้องหรือเอชไอวี โทร 1663 ปรึกษาฟรี ${serviceHoursLabel("hotline_1663")} รวมวันหยุด`),
    h("p", { class: "src" }, "ที่มา: กรมสุขภาพจิต, กระทรวง พม., GCC Call Center ภาครัฐ, ศูนย์รับแจ้งเหตุ 191, สปสช. (1663), กระทรวงสาธารณสุข (ศูนย์พึ่งได้), สำนักงานตำรวจแห่งชาติ (สิทธิผู้เสียหาย) (ตรวจ 2026-10-23)"),
    h("button", { class: "btn-ghost", "data-testid": "crisis-continue", onclick: () => go({ screen: state.crisisFrom === "start" ? "start" : state.crisisFrom === "chat" && state.chat ? "chat" : "describe" }) },
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
}

render();
// Status updates only swap the small indicator, so typing is never interrupted.
startModel((st) => {
  modelStatus = st;
  const old = app.querySelector('[data-testid="model-status"]');
  if (old) old.replaceWith(modelPill());
}).then((a) => { model = a; state.chat?.session.setModel(toDialogModel(a)); });
