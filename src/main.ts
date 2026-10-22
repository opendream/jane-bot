import "./styles.css";
import { PRODUCT_NAME, PRODUCT_NAME_EN, MIN_AGE, THAI_COPY_STATUS } from "./config";
import type { AgeBand, CrisisCategory, Intent, IntentResult } from "./core/types";
import { detectCrisis, crisisOrder } from "./core/crisis";
import { suggestServices, CRISIS_LINES, DATA_VERSION, INTENT_LABEL_TH, SUPPORT_LINE_TH, type Suggestion } from "./core/referral";
import { hoursLabel } from "./core/openNow";
import { draftSummary, finalizeSummary } from "./core/summary";
import { classifyWithFallback, polishWithFallback, NO_MODEL, type LLMAdapter } from "./llm/adapter";

/* ------------------------------------------------------------------------------------------
 * Privacy rules enforced here:
 *  - All state lives in this one in-memory object. Nothing is written to localStorage,
 *    sessionStorage, IndexedDB, cookies or Cache Storage. No console logging of user text.
 *  - No fetch/XHR anywhere in the app. Source URLs are shown as text, not links.
 * ---------------------------------------------------------------------------------------- */

type Screen = "start" | "underage" | "describe" | "suggest" | "summary" | "handoff" | "crisis" | "neutral";

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
}

const fresh = (): State => ({
  screen: "start", ageBand: "unspecified", needText: "", result: null, suggestions: [],
  selected: null, summary: "", crisisCategories: [], crisisFrom: "describe",
});

let state: State = fresh();
const model: LLMAdapter | null = NO_MODEL; // milestone 2: in-browser model plugs in here

const app = document.getElementById("app")!;
document.title = `${PRODUCT_NAME} (เดโม)`;

/* ---------- tiny DOM helper (textContent only, never innerHTML with user text) ---------- */
type Child = Node | string | null | false | undefined;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "value") (el as any).value = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
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
  render();
}

/* ------------------------------------------ layout ------------------------------------------ */
function header() {
  if (state.screen === "neutral") return null;
  return h("header", { class: "bar" },
    h("div", { class: "brand" }, PRODUCT_NAME, h("span", { class: "tag" }, "เดโม")),
    h("div", { class: "bar-actions" },
      state.screen !== "start" && state.screen !== "crisis" &&
        h("button", { class: "btn-sos", "data-testid": "sos", onclick: () => go({ screen: "crisis", crisisCategories: [], crisisFrom: state.screen }) }, "ขอความช่วยเหลือด่วน"),
      state.screen !== "start" && h("button", { class: "btn-ghost", "data-testid": "erase", onclick: () => eraseAll("start") }, "ลบแชท"),
      h("button", { class: "btn-exit", "data-testid": "quick-exit", "aria-label": "ออกด่วน (quick exit)", onclick: quickExit }, "ออกด่วน ✕"),
    ));
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
    h("h1", {}, `สวัสดี เราคือ ${PRODUCT_NAME}`),
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
    h("p", {}, `เดโมนี้ทำสำหรับอายุ ${MIN_AGE} ปีขึ้นไป แต่คุณยังขอความช่วยเหลือได้เสมอ โทรฟรี:`),
    callList(["1323", "1300"]),
    h("p", {}, "เรื่องท้องหรือเอชไอวี โทร 1663 (ทุกวัน 09:00–21:00 น.)"),
    h("a", { class: "btn-call", href: "tel:1663" }, "โทร 1663"),
    h("button", { class: "btn-ghost", onclick: () => eraseAll("start") }, "กลับหน้าแรก"),
  );
}

function describeScreen() {
  const ta = h("textarea", {
    id: "need", "data-testid": "need-input", rows: 5, maxlength: 600, autocomplete: "off", spellcheck: "false",
    placeholder: "เล่าสั้น ๆ ว่ากังวลเรื่องอะไร เช่น “ประจำเดือนมาช้า กลัวท้อง ไม่กล้าบอกใคร”", value: state.needText,
  }) as HTMLTextAreaElement;
  const submit = async () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    await handleNeed(text);
  };
  return h("main", { class: "screen", "data-testid": "screen-describe" },
    h("h1", {}, "อยากคุยเรื่องอะไร"),
    h("p", { class: "lead" }, "พิมพ์ภาษาไทยได้เลย ไม่ต้องบอกชื่อ เบอร์โทร หรือโรงเรียน"),
    h("label", { for: "need", class: "sr" }, "เรื่องที่อยากปรึกษา"), ta,
    h("button", { class: "btn-primary", "data-testid": "need-submit", onclick: submit }, "หาที่ปรึกษา"),
  );
}

async function handleNeed(text: string) {
  // Safety first: rule-based crisis check, before and independent of any model.
  const c = detectCrisis(text);
  if (c.crisis) { go({ needText: "", screen: "crisis", crisisCategories: c.categories, crisisFrom: "describe" }); return; }
  const result = await classifyWithFallback(text, model);
  const suggestions = suggestServices(result.intents, new Date());
  go({ needText: text, result, suggestions, screen: "suggest" });
}

function statusBadge(s: Suggestion) {
  const cls = s.status.state === "open" ? "open" : s.status.state === "closed" ? "closed" : "unknown";
  return h("span", { class: `badge ${cls}`, "data-testid": `status-${s.service.id}`, "data-state": s.status.state }, s.status.label_th);
}

function sourceLine(src: { url: string; checked: string }[]) {
  return h("p", { class: "src" }, "ที่มา: ", ...src.slice(0, 1).map((x) => h("span", { class: "url" }, `${x.url} (ตรวจ ${x.checked})`)));
}

function channelEl(ch: { type: string; label_th: string; href?: string }) {
  return ch.href
    ? h("a", { class: "btn-call small", href: ch.href }, ch.label_th)
    : h("span", { class: "chan" }, ch.label_th);
}

function suggestScreen() {
  const r = state.result!;
  const top = r.intents[0] as Intent;
  return h("main", { class: "screen", "data-testid": "screen-suggest" },
    h("p", { class: "support", "data-testid": "support-line" }, SUPPORT_LINE_TH[top]),
    h("p", { class: "intent", "data-testid": "intent-label", "data-intent": top },
      "เรื่องที่เราเข้าใจ: ", h("strong", {}, r.intents.slice(0, 2).map((i) => INTENT_LABEL_TH[i]).join(" · "))),
    h("h2", {}, "ที่ที่คุยต่อได้กับเจ้าหน้าที่ตัวจริง"),
    ...state.suggestions.map((s, i) =>
      h("section", { class: "card", "data-testid": `service-${s.service.id}`, "data-rank": i },
        h("div", { class: "card-head" }, h("h3", {}, s.service.name_th), statusBadge(s)),
        h("p", {}, s.service.description_th),
        h("p", { class: "hours" }, `เวลา: ${hoursLabel(s.service.hours)}`),
        h("div", { class: "chans" }, ...s.service.channels.map(channelEl)),
        s.service.verification !== "verified" && h("p", { class: "warn" }, "⚠ เวลาให้บริการยังยืนยันไม่ได้ทั้งหมด"),
        sourceLine(s.service.sources),
        h("button", { class: "btn-primary", "data-testid": `pick-${s.service.id}`, onclick: () => pick(s) }, "ให้ช่วยเตรียมข้อความถึงที่นี่"),
      )),
    h("button", { class: "btn-ghost", "data-testid": "retell", onclick: () => go({ screen: "describe" }) }, "ไม่ใช่เรื่องนี้ / เล่าใหม่"),
  );
}

async function pick(s: Suggestion) {
  const draft = draftSummary({ service: s.service, needText: state.needText, intent: state.result!.intents[0], ageBand: state.ageBand });
  const summary = await polishWithFallback(draft, model);
  go({ selected: s, summary, screen: "summary" });
}

function summaryScreen() {
  const ta = h("textarea", { "data-testid": "summary-input", rows: 8, spellcheck: "false", value: state.summary }) as HTMLTextAreaElement;
  ta.addEventListener("input", () => { state.summary = ta.value; });
  return h("main", { class: "screen", "data-testid": "screen-summary" },
    h("h1", {}, "ร่างข้อความสั้น ๆ ถึงเจ้าหน้าที่"),
    h("p", { class: "lead" }, "แก้ไขได้ทุกบรรทัด ลบส่วนที่ไม่อยากบอกได้ ชื่อ เบอร์โทร โรงเรียน และที่อยู่จะถูกลบออกอัตโนมัติ"),
    ta,
    h("div", { class: "row" },
      h("button", { class: "btn-primary", "data-testid": "approve", onclick: () => approve(ta.value) }, "ฉันยืนยัน"),
      h("button", { class: "btn-ghost", "data-testid": "cancel", onclick: () => go({ summary: "", selected: null, screen: "suggest" }) }, "ยกเลิก"),
    ),
  );
}

function approve(edited: string) {
  // Crisis override applies to anything she types, including edits to the summary.
  const c = detectCrisis(edited);
  if (c.crisis) { go({ summary: "", screen: "crisis", crisisCategories: c.categories, crisisFrom: "describe" }); return; }
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
    h("p", { class: "lead" }, "คุณไม่ได้อยู่คนเดียว มีคนพร้อมช่วยตอนนี้ โทรฟรี กดที่เบอร์เพื่อโทรได้ทันที"),
    callList(order),
    h("p", {}, "ถ้ากำลังอยู่ในอันตรายตอนนี้ โทร 191 หรือ 1669 ทันที เรื่องท้องหรือเอชไอวีโทร 1663 (09:00–21:00 น.)"),
    h("p", { class: "src" }, "ที่มา: กรมสุขภาพจิต, กระทรวง พม., GCC Call Center ภาครัฐ, ศูนย์รับแจ้งเหตุ 191 (ตรวจ 2026-10-22)"),
    h("button", { class: "btn-ghost", "data-testid": "crisis-continue", onclick: () => go({ screen: state.crisisFrom === "start" ? "start" : "describe" }) },
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
  summary: summaryScreen, handoff: handoffScreen, crisis: crisisScreen, neutral: neutralScreen,
};

function render() {
  const main = SCREENS[state.screen]();
  app.replaceChildren(...[header(), main, footer()].filter(Boolean) as Node[]);
  app.dataset.screen = state.screen;
}

render();
