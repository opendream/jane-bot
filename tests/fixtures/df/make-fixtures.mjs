// Generates the SYNTHETIC Dialogflow-format fixtures used by tests/unit/import-df.test.ts.
// Every string here was written for the tests: no real export text, no real user text.
//   node tests/fixtures/df/make-fixtures.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));

const text = (speech, platform) => ({ type: "0", ...(platform ? { platform } : {}), title: "", textToSpeech: "", lang: "th", speech, condition: "" });
const qr = (replies, platform = "facebook") => ({ type: "2", platform, title: "เลือก", replies, textToSpeech: "", lang: "th", condition: "" });
const img = (url) => ({ type: "3", platform: "facebook", imageUrl: url, title: "", textToSpeech: "", lang: "th", condition: "" });
const card = (title, buttons, imageUrl) => ({ type: "1", platform: "facebook", title, subtitle: "การ์ดทดสอบ", ...(imageUrl ? { imageUrl } : {}), buttons, textToSpeech: "", lang: "th", condition: "" });
const intent = (name, messages, extra = {}) => ({ id: `id-${name}`, name, auto: true, contexts: [], responses: [{ resetContexts: false, action: "", affectedContexts: [], parameters: [], messages, speech: [] }], priority: 500000, webhookUsed: false, webhookForSlotFilling: false, fallbackIntent: false, events: [], conditionalResponses: [], condition: "", conditionalFollowupEvents: [], ...extra });
const says = (phrases) => phrases.map((p, i) => ({ id: `u${i}`, data: [{ text: p, userDefined: false }], isTemplate: false, count: 0, lang: "th", updated: 0 }));

const SHARED = intent("test.shared.000", [text(["ข้อความทดสอบที่เหมือนกันทั้งสองชุด"])]);
const bot = {
  "Default Welcome Intent": [intent("Default Welcome Intent", [text(["สวัสดีจากชุด bot (ทดสอบ)"])], { events: [{ name: "WELCOME" }] }), ["สวัสดี", "หวัดดี"]],
  "Default Fallback Intent": [intent("Default Fallback Intent", [text(["ไม่เข้าใจ (ทดสอบ bot)"])], { fallbackIntent: true }), []],
  "test.shared.000": [SHARED, ["คำถามทดสอบร่วม"]],
  "test.ec.000": [intent("test.ec.000", [
    text(["ทดสอบยาคุมฉุกเฉิน ภายใน 72 ชั่วโมง ดูต่อที่ https://tinyurl.com/test-x และ https://rsathai.org/test"], "facebook"),
    qr(["ใช่", "ไม่ใช่"]), img("https://media.giphy.com/media/test/giphy.gif"),
    card("การ์ดทดสอบ", [{ text: "เปิดเพจ", postback: "https://www.facebook.com/test.page" }, { text: "ถาม", postback: "" }], "https://scontent.xx.fbcdn.net/v/test.jpg"),
    text(["ทดสอบ LINE"], "line"),
  ]), ["ลืมกินยา", "ถุงแตก ทดสอบ"]],
  "test.ec.000 - yes": [intent("test.ec.000 - yes", [text(["ตอบใช่ (ทดสอบ)"])], { parentId: "id-test.ec.000", contexts: ["test-ec-followup"] }), ["ใช่"]],
  "test.ec.000 - no": [intent("test.ec.000 - no", [text(["ตอบไม่ใช่ (ทดสอบ)"])], { parentId: "id-test.ec.000", contexts: ["test-ec-followup"] }), ["ไม่ใช่"]],
  "test.pii.000": [intent("test.pii.000", [text(["ติดต่อทดสอบ 081-234-5678 หรือ ชื่อสมมติ ที่โรงเรียนทดสอบวิทยา"])]), ["หนูชื่อทดลองค่ะ", "คำถามซ้ำ"]],
  "test.dup.000": [intent("test.dup.000", [text(["ทดสอบคำถามซ้ำ"])]), ["คำถาม ซ้ำ"]],
};
const jane = {
  "Default Welcome Intent": [intent("Default Welcome Intent", [text(["สวัสดีจากชุด jane (ทดสอบ)"])], { events: [{ name: "WELCOME" }] }), ["สวัสดี", "ดีจ้า"]],
  "Default Fallback Intent": [intent("Default Fallback Intent", [text(["ไม่เข้าใจ (ทดสอบ jane)"])], { fallbackIntent: true }), []],
  "test.shared.000": [SHARED, ["คำถามทดสอบร่วม"]],
  "test.janeonly.000": [intent("test.janeonly.000", [text(["ตรวจเอชไอวีได้ ทดสอบ โทร 1663"])]), ["อยากตรวจ ทดสอบ"]],
};

function write(dir, set) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "intents"), { recursive: true });
  fs.writeFileSync(path.join(dir, "agent.json"), JSON.stringify({ description: "SYNTHETIC test fixture", language: "th", displayName: "fixture" }, null, 2));
  for (const [name, [j, ph]] of Object.entries(set)) {
    fs.writeFileSync(path.join(dir, "intents", `${name}.json`), JSON.stringify(j, null, 2));
    if (ph.length) fs.writeFileSync(path.join(dir, "intents", `${name}_usersays_th.json`), JSON.stringify(says(ph), null, 2));
  }
}
write(path.join(here, "bot"), bot);
write(path.join(here, "jane"), jane);
console.log("fixtures written");
