import { describe, it, expect } from "vitest";
// @ts-ignore shared implementation
import { stripPII as stripFromPatterns, findPhoneSpans, findPII } from "../../scripts/bank/pii-patterns.mjs";
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

function expectRedacted(input: string, leaked: string) {
  const a = stripPII(input);
  const b = stripFromPatterns(input);
  expect(a, "summary stripPII").toBe(b);
  expect(a, leaked).not.toContain(leaked);
  expect(a).toContain(TOKEN);
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
    "09.00-21.00 30 นาที",
    "08.30-16.30 17 ปี",
    "เปิด 06.00-18.00 1 ครั้ง",
    "05.00-12.00 7 วัน",
    "card fixture.start.000",
    "card ec.000",
  ];
  it.each(keep)("%s", (s) => {
    expect(stripPII(s)).toBe(s);
    expect(findPII(s).phone ?? []).toEqual([]);
  });
  it("keeps hours when a landline follows, and still redacts the phone", () => {
    const s = "เวลา 08.00-17.00 02 123 4567";
    const out = stripPII(s);
    expect(out).toContain("08.00-17.00");
    expect(out).not.toContain("02 123 4567");
    expect(out).toContain(TOKEN);
    expect(findPhoneSpans(s).join("")).toContain("02 123 4567");
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
