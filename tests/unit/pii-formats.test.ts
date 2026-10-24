import { describe, it, expect } from "vitest";
// @ts-ignore shared implementation
import { stripPII as stripFromPatterns, findPhoneSpans, findPII, toArabic } from "../../scripts/bank/pii-patterns.mjs";
import { stripPII, draftSummary, finalizeSummary } from "../../src/core/summary";
import { SERVICES } from "../../src/core/referral";

const s1663 = SERVICES.find((s) => s.id === "hotline_1663")!;
const TOKEN = "[ลบข้อมูลส่วนตัว]";

/** SYNTHETIC only. Made-up numbers and example.com — never a real person's data. */
const SYN = {
  compact: "0812345678",
  hyphen: "081-234-5678",
  spaced: "081 234 5678",
  dottedPairs: "08.12.34.56.78",
  dottedGroups: "081.234.5678",
  spacedHyphen: "081 - 234 - 5678",
  mixed: "08.12-34.56-78",
  plus66: "+66 81 234 5678",
  plus66compact: "+66812345678",
  plus66trunk: "+66 (0)81 234 5678",
  bracketed: "(081) 234-5678",
  thai: "๐๘๑-๒๓๔-๕๖๗๘",
  fake: "099-999-9999",
  hourLikeSuffix: "08.12-23.45-67",
  hourLikePrefix: "08-12.30-13.45",
  hourLikeSuffix2: "09.15-22.30-11",
  hourLikePrefix2: "09-11.30-12.45",
  emailTime: "name12.34@example.com",
  handleTime: "@user9:30",
  lineTime: "jane_08.15",
  urlTime: "https://example.com/a/12.30",
  urlPhone: "https://example.com/call/081-234-5678",
};

function toThaiDigits(s: string) {
  return s.replace(/[0-9]/g, (d) => String.fromCharCode(0x0e50 + Number(d)));
}

function expectRedacted(input: string, leaked: string) {
  const a = stripPII(input);
  const b = stripFromPatterns(input);
  expect(a, "summary stripPII").toBe(b);
  expect(a, leaked).not.toContain(leaked);
  expect(a).toContain(TOKEN);
}

function expectPhoneDigitsGone(input: string) {
  const a = stripPII(input);
  expect(a, "summary stripPII").toBe(stripFromPatterns(input));
  expect(a).toContain(TOKEN);
  const digits = toArabic(input).replace(/\D/g, "");
  expect(toArabic(a).replace(/\D/g, ""), input).not.toContain(digits);
  expect(a, input).not.toContain(input.replace(/^โทร |\sนะ$/g, "").trim());
}

describe("shared stripPII", () => {
  it("is the same implementation on the handoff path and in pii-patterns", () => {
    const samples = [
      `โทร ${SYN.hyphen}`,
      `อีเมล ${SYN.emailTime}`,
      "เวลา 08.30-16.30 น.",
    ];
    for (const s of samples) expect(stripPII(s)).toBe(stripFromPatterns(s));
  });
});

describe("phones (synthetic)", () => {
  const cases: [string, string][] = [
    ["compact", SYN.compact],
    ["hyphenated", SYN.hyphen],
    ["spaced", SYN.spaced],
    ["dotted pairs", SYN.dottedPairs],
    ["dotted groups", SYN.dottedGroups],
    ["spaced hyphens", SYN.spacedHyphen],
    ["mixed dotted and hyphen", SYN.mixed],
    ["+66 with spaces", SYN.plus66],
    ["+66 compact", SYN.plus66compact],
    ["+66 with (0)", SYN.plus66trunk],
    ["bracketed area code", SYN.bracketed],
    ["Thai digits", SYN.thai],
    ["obviously fake hyphen", SYN.fake],
    ["hour-like suffix 08.12-23.45-67", SYN.hourLikeSuffix],
    ["hour-like prefix 08-12.30-13.45", SYN.hourLikePrefix],
    ["hour-like suffix 09.15-22.30-11", SYN.hourLikeSuffix2],
    ["hour-like prefix 09-11.30-12.45", SYN.hourLikePrefix2],
  ];
  it.each(cases)("stripPII redacts %s", (_label, phone) => {
    expectRedacted(`โทร ${phone} นะ`, phone);
    expect(findPhoneSpans(`โทร ${phone}`).join(""), phone).toContain(phone);
    expect(Object.keys(findPII(`โทร ${phone}`)), phone).toContain("phone");
  });

  const spaceSplit: [string, string][] = [
    ["space after range", "08.12-23.45 67"],
    ["spaces around hyphen", "08.12 - 23.45 67"],
    ["prefix leftover", "081 2.30-13.45"],
    ["split trunk", "0 8.12-23.45 67"],
    ["prefix then range", "08 12.30-13.45"],
    ["en dash", "08.12–23.45 67"],
  ];
  it.each(spaceSplit)("stripPII redacts space-split %s (Arabic digits)", (_label, phone) => {
    expectPhoneDigitsGone(`โทร ${phone} นะ`);
    expect(Object.keys(findPII(`โทร ${phone}`)), phone).toContain("phone");
  });
  it.each(spaceSplit)("stripPII redacts space-split %s (Thai digits)", (_label, phone) => {
    const thai = toThaiDigits(phone);
    expectPhoneDigitsGone(`โทร ${thai} นะ`);
    expect(Object.keys(findPII(`โทร ${thai}`)), thai).toContain("phone");
  });
});

describe("emails, handles, LINE ids, URLs with time-like tokens", () => {
  it("redacts an email that contains a d.dd token", () => {
    expectRedacted(`อีเมล ${SYN.emailTime}`, SYN.emailTime);
    expect(stripPII(`อีเมล ${SYN.emailTime}`)).not.toContain("12.34");
    expect(stripPII(`อีเมล ${SYN.emailTime}`)).not.toContain("example.com");
  });
  it("redacts a handle that contains a d:dd token", () => {
    expectRedacted(`แอดมา ${SYN.handleTime}`, SYN.handleTime);
    expect(stripPII(`แอดมา ${SYN.handleTime}`)).not.toContain("user9:30");
  });
  it("redacts a LINE id that contains a dotted time-like token", () => {
    expectRedacted(`line id ${SYN.lineTime}`, SYN.lineTime);
    expect(stripPII(`line id ${SYN.lineTime}`)).not.toContain("08.15");
  });
  it("redacts a URL that contains a dotted time-like token", () => {
    expectRedacted(SYN.urlTime, "example.com");
    expect(stripPII(SYN.urlTime)).not.toContain("12.30");
    expect(stripPII(SYN.urlTime)).not.toContain("https://");
  });
});

describe("overlapping matches", () => {
  it("redacts a phone that sits inside a URL as one blanked region", () => {
    const out = stripPII(`ดู ${SYN.urlPhone}`);
    expect(out).not.toContain("081-234-5678");
    expect(out).not.toContain("example.com");
    expect(out).toContain(TOKEN);
    expect(out.match(new RegExp(TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
  });
});

describe("negatives that must survive unchanged", () => {
  const keep = [
    "คลินิกเปิด 08.30-16.30 น.",
    "มาถึง 9:00 น.",
    "เวลา 09:00 - 21:00 น.",
    "ตรวจ 2026-10-22",
    "นัด 22/10/2026",
    "ประจำเดือนมาช้า 2 อาทิตย์ อายุ 17 ปี",
    "ค่าตรวจ 350 บาท",
    "โทร 1663 ได้",
    "1663 09.00 - 21.00",
    "โทร 1300 9.00 - 16.00 น.",
    "ปี 2569 08.30-16.30",
    "card fixture.start.000",
    "card ec.000",
  ];
  it.each(keep)("%s", (s) => {
    expect(stripPII(s)).toBe(s);
    expect(findPII(s).phone ?? []).toEqual([]);
  });
});

// Known limitation accepted by Keng 24 Oct 2026: over-redaction, no leak
describe("known hours false positives (over-redaction accepted)", () => {
  const over = [
    "09.00-21.00 30 นาที",
    "08.30-16.30 17 ปี",
    "เปิด 06.00-18.00 1 ครั้ง",
    "05.00-12.00 7 วัน",
  ];
  it.each(over)("%s redacts the hours (over-redaction, no leak)", (s) => {
    const out = stripPII(s);
    expect(out).toContain(TOKEN);
    expect(out).not.toBe(s);
    expect(out).not.toMatch(/\d{1,2}[.:]\d{2}/);
  });
  it("เวลา 08.00-17.00 02 123 4567 over-redacts hours; the landline is still gone", () => {
    const s = "เวลา 08.00-17.00 02 123 4567";
    const out = stripPII(s);
    expect(out).toContain(TOKEN);
    expect(out).not.toContain("08.00-17.00");
    expect(out).not.toContain("02 123 4567");
  });
});

describe("formats findPII misses and stripPII must fully redact (synthetic)", () => {
  const cases: [string, string[]][] = [
    ["ไอจี somchai_99", ["somchai_99"]],
    ["ig: some.user", ["some.user"]],
    ["ชื่อเล่นว่า ส้มโอ", ["ส้มโอ"]],
    ["รร.สมมติวิทยา", ["สมมติวิทยา"]],
    ["อยู่ ต.บางสมมติ อ.เมือง", ["บางสมมติ"]],
    ["+1 415 555 0134", ["415 555", "555 0134", "415", "0134"]],
    ["AA1234567", ["AA1234567", "AA"]],
    ["ดูต่อที่ https://example.com/secret", ["example.com", "https://"]],
    ["เลขบัญชี 123-4-56789-0", ["123-4-56789-0", "123-4-", "56789-0", "123", "56789"]],
  ];
  it.each(cases)("fully redacts %s", (input, leaks) => {
    const out = stripPII(input);
    expect(out).toContain(TOKEN);
    for (const leak of leaks) expect(out, leak).not.toContain(leak);
  });
});

describe("staff handoff summary", () => {
  it("draftSummary and finalizeSummary contain none of the format-suite values", () => {
    const leaked = [
      SYN.dottedPairs, SYN.mixed, SYN.plus66trunk, SYN.bracketed, SYN.thai,
      SYN.hourLikeSuffix, SYN.hourLikePrefix,
      SYN.emailTime, SYN.handleTime, SYN.lineTime, "12.30", "081-234-5678",
    ];
    const needText = [
      "กลัวท้อง",
      `โทร ${SYN.dottedPairs} ${SYN.mixed} ${SYN.plus66trunk} ${SYN.bracketed} ${SYN.thai} ${SYN.hourLikeSuffix} ${SYN.hourLikePrefix}`,
      `อีเมล ${SYN.emailTime} แอด ${SYN.handleTime} line id ${SYN.lineTime}`,
      SYN.urlTime,
    ].join(" ");
    const summary = draftSummary({ service: s1663, needText, intent: "pregnancy", ageBand: "15-17" });
    for (const v of leaked) expect(summary, v).not.toContain(v);
    const finalized = finalizeSummary(summary + `\nติดต่อ ${SYN.hyphen}`);
    expect(finalized).not.toContain(SYN.hyphen);
    expect(summary).toContain("กลัวท้อง");
  });
});
