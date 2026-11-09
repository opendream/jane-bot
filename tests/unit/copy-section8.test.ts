import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGE_REDIRECT_CARD, AGE_REDIRECT_TEXT } from "../../src/core/age";
import { BANK } from "../../src/core/bankData";
import { SUPPORT_LINE_TH } from "../../src/core/referral";
import { CHAT_THINKING_PHRASES } from "../../src/ui/chat-thinking";

/** Git blob SHA-1 = sha1("blob " + length + "\\0" + bytes), same as `git hash-object`. */
function gitBlobSha(rel: string): string {
  const bytes = readFileSync(rel);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

const BASE = "624423052b268d633521fe86881074a614f06862";

const NEW = {
  th1: "เรากำลังอ่านข้อความของเธออยู่นะ",
  th3: "แป๊บนึงนะ เราอยู่ตรงนี้",
  th5: "เรากำลังดูข้อมูลที่เกี่ยวข้องอยู่",
  th7: "ขอเวลาเราอีกนิดนะ",
  opener: "ได้เลยค่ะ เราช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ให้นะคะ",
  button: "ให้เราช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ไหมคะ",
  age: "เรื่องนี้เราเก็บไว้ตอบสำหรับคนอายุ 18 ปีขึ้นไปนะคะ ไม่ได้แปลว่าคำถามนี้ผิด สงสัยอะไรก็ถามได้เสมอ ถ้าอยากคุยเรื่องนี้กับคนที่เข้าใจวัยรุ่น โทรปรึกษา 1663 ได้ หรือให้เราช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ก็ได้ค่ะ",
  "pregnancy.notthetime.000": "ท้องไม่พร้อมเป็นเรื่องใหญ่ของวัยรุ่นหลายคนเลย\nเจนขอเป็นกำลังใจให้ก่อนเลย\nและถ้ายังเคว้งคว้าง อยากคุยกับคนจริงๆ ก็โทรไปที่สายด่วน 1663 ได้นะ ปรึกษาฟรี ทุกวัน 09:00–21:00 น. รวมวันหยุด\nเค้าจะมีผู้เชี่ยวชาญคอยให้คำปรึกษาโดยที่ไม่ตัดสินเธอ แล้วก็ไม่จำเป็นต้องให้เขารู้ว่าเธอเป็นใครด้วย",
  "sex.activity.consent.000": "กอด จูบ ลูบ คลำ หรือมีเซ็กส์กัน ควรเกิดจากความเต็มใจของทั้งสองคน\nถ้าเธอยังไม่พร้อม ไม่ยินยอม ก็บอกคู่ของเธอไปตรงๆ เลย กลับกัน ถ้าคู่ของเธอบอกว่าไม่พร้อม เธอก็ต้องเคารพการตัดสินใจของเค้าด้วยน้า\nอีกอย่างก็คือ แม้ว่าคนสองคนจะยินยอมมีเซ็กส์กันแล้วครั้งนึง ก็ไม่ได้แปลว่าแต่ละคนจะพร้อมและยินดีมีเซ็กส์ด้วยทุกครั้งนะ เพราะงั้น อย่าลืมถามความสมัครใจของตัวเองและคู่ ว่ายินยอมกับเซ็กส์ครั้งที่กำลังจะเกิดขึ้นมั้ยด้วยล่ะ\nการที่เธอหรือเค้าจะเกิดความรู้สึกว่าไม่อยากมีอะไรกัน ณ โมเมนต์นั้นๆ มันไม่ใช่เรื่องผิดเลยนะ ลองคุยกันตรงๆ ดู",
  "harassment.002": "อันดับแรก ตั้งสติก่อน และทำให้เขารู้ว่าเธอรู้ตัว และเธอไม่ยินยอม พยายามออกมาจากจุดนั้น และขอความช่วยเหลือจากคนรอบข้าง\nถ้ามันยังเกิดขึ้นอีก เจนแนะนำให้เล่าให้คนที่ไว้ใจฟัง หรือโทรสายด่วน 1300 ศูนย์ช่วยเหลือสังคม กระทรวง พม. (โทรฟรี 24 ชั่วโมง ทุกวัน) เพื่อขอคำปรึกษาและความช่วยเหลือ\nถ้าตกอยู่ในอันตรายตอนนี้ โทรแจ้งเหตุด่วนเหตุร้าย ตำรวจ 191 ได้ทันที\nถ้าตัดสินใจแจ้งความเรื่องถูกล่วงละเมิดทางเพศ ผู้เสียหายที่เป็นผู้หญิงขอให้พนักงานสอบสวนหญิงเป็นผู้สอบปากคำได้",
  "disease.syphilis.001": "บางคนอาจมีแผลที่ขอบยกนูนแข็ง บ้างก็มีผื่นตามผิวหนังและเยื่อบุ แต่บางคนติดเชื้อแล้วแต่ไม่มีอาการหลายปีก็มี ดังนั้น หากสงสัยว่าอาจติดเชื้อ ควรไปตรวจดูนะ",
  "relationship.violence.001": "ถ้าเลือกจะคบต่อ ก็ควรต้องป้องกันตัวเองไว้ด้วย จะได้ไม่ต้องเจ็บตัวซ้ำซ้อนหรือเป็นอะไรขึ้นมา\nอย่างแรกเลย ควรสื่อสารเรื่องนี้ให้คนใกล้ตัวรับรู้เอาไว้\nรวมถึงเตรียมเบอร์ติดต่อไว้โทรเมื่อเกิดกรณีฉุกเฉิน บางทีโซเชียลมีเดียก็อาจช่วยเธอได้เหมือนกัน ซึ่งก็ต้องพยายามอย่าให้คู่กรณีเข้าถึงช่องทางสื่อสารส่วนตัวของเธอได้\nและถ้าเป็นไปได้ การแจ้งความหรือลงบันทึกประจำวันไว้ก็ทำให้ปลอดภัยขึ้นอีกระดับหนึ่ง\nหรือไม่ก็ลองโทรสายด่วน 1300 ศูนย์ช่วยเหลือสังคม กระทรวง พม. (โทรฟรี 24 ชั่วโมง ทุกวัน) ปรึกษาเรื่องความรุนแรงในครอบครัวและขอความช่วยเหลือได้นะ\nถ้าบาดเจ็บหรือถูกล่วงละเมิดทางเพศ ไปที่ศูนย์พึ่งได้ (OSCC) ในโรงพยาบาลรัฐได้",
} as const;

const OLD = {
  opener: "ได้เลย พี่ช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ให้นะ",
  button: "ให้พี่ช่วยหาที่ปรึกษาที่เปิดอยู่ตอนนี้ไหม",
} as const;

const CARD_FILES = {
  "pregnancy.notthetime.000": "src/data/bank/pregnancy.json",
  "sex.activity.consent.000": "src/data/bank/relationship-consent.json",
  "harassment.002": "src/data/bank/relationship-consent.json",
  "disease.syphilis.001": "src/data/bank/sti-hiv.json",
  "relationship.violence.001": "src/data/bank/violence.json",
} as const;

const TWELVE: readonly string[] = [
  NEW.th1,
  NEW.th3,
  NEW.th5,
  NEW.th7,
  NEW.opener,
  NEW.button,
  NEW.age,
  NEW["pregnancy.notthetime.000"],
  NEW["sex.activity.consent.000"],
  NEW["harassment.002"],
  NEW["disease.syphilis.001"],
  NEW["relationship.violence.001"],
];

const PINNED = {
  "src/core/crisis.ts": "411f1531a32fe4b0353fc59975b2cdfec0a6c713",
  "src/core/crisis-order.ts": "ffd4cdecbc97bcfe6704c290924ce6797d990e71",
  "src/core/chat-crisis.ts": "eecb183b2b3bc8efb4fe2ae7e63b8535fa87c240",
  "src/core/guard.ts": "19fff7350b90616b1b1d908a91f4c664bfb369bc",
  "src/core/summary.ts": "ea53da49f5861a079b05c3d55592dee973a686b6",
  "src/core/referral.ts": "13d0f704f6b17400d0d8b8a4f18a8080009b2c18",
  "src/data/services.json": "938926e104ed945fd3471570f19a77f963f59c64",
  "scripts/bank/pii-patterns.mjs": "174de25dac4c1b933c4b5df74afb5d26d5ebba1a",
  "scripts/bank/pii-name-allowlist.mjs": "451e425689167763af00918021f9f5d68a00af39",
  "tests/unit/pii-formats.test.ts": "9038609cc1234d699d16f2186d50480bf7341a91",
} as const;

const SAFETY_FILES = [
  ...Object.keys(PINNED),
  "tests/unit/pins.test.ts",
] as const;

const SUPPORT_BASE = [
  "ความกังวลแบบนี้เกิดขึ้นได้ คุณไม่ได้อยู่คนเดียว มีเจ้าหน้าที่ที่คุยเรื่องนี้ได้โดยไม่ตัดสิน",
  "ยาคุมฉุกเฉินได้ผลดีที่สุดเมื่อใช้เร็วที่สุดหลังมีเพศสัมพันธ์ ลองคุยกับเจ้าหน้าที่หรือเภสัชกรเพื่อขอคำแนะนำ",
  "การคุมกำเนิดมีหลายวิธี เจ้าหน้าที่ช่วยคุณเลือกวิธีที่เหมาะกับตัวเองได้",
  "การตรวจเป็นเรื่องปกติและเป็นความลับ เจ้าหน้าที่ช่วยบอกได้ว่าควรตรวจอะไรและที่ไหน",
  "คุณมีสิทธิ์ปฏิเสธเสมอ ไม่ว่าจะเป็นใคร การคุยกับคนที่เข้าใจอาจช่วยได้",
  "ขอบคุณที่เล่าให้ฟัง ความรู้สึกของคุณสำคัญ การได้คุยกับคนที่รับฟังอาจช่วยได้",
  "สิ่งที่เกิดขึ้นไม่ใช่ความผิดของคุณ มีหน่วยงานที่ช่วยได้และเก็บเป็นความลับ",
  "ขอบคุณที่เล่าให้ฟัง นี่คือที่ที่คุยต่อได้กับเจ้าหน้าที่ตัวจริง",
] as const;

type BankFile = { cards?: { id: string; answer_th: string; key_facts: string[] }[] };

function cardFromFile(file: string, id: string) {
  const json = JSON.parse(readFileSync(file, "utf8")) as BankFile;
  const card = json.cards?.find((c) => c.id === id);
  expect(card, id).toBeTruthy();
  return card!;
}

describe("copy section 8 เรา/เธอ voice (Keng 31 Oct 2026)", () => {
  it("new strings present exactly", () => {
    expect(CHAT_THINKING_PHRASES.th[1]).toBe(NEW.th1);
    expect(CHAT_THINKING_PHRASES.th[3]).toBe(NEW.th3);
    expect(CHAT_THINKING_PHRASES.th[5]).toBe(NEW.th5);
    expect(CHAT_THINKING_PHRASES.th[7]).toBe(NEW.th7);
    expect(CHAT_THINKING_PHRASES.th[0]).toBe("เจนกำลังคิดอยู่นะ");
    expect(CHAT_THINKING_PHRASES.th[2]).toBe("กำลังเรียบเรียงคำพูดอยู่");
    expect(CHAT_THINKING_PHRASES.th[4]).toBe("ค่อย ๆ คุยกันไปนะ");
    expect(CHAT_THINKING_PHRASES.th[6]).toBe("ไม่ต้องรีบนะ พิมพ์เพิ่มได้เลย");

    const chatSrc = readFileSync("src/ui/chat.ts", "utf8");
    expect(chatSrc.split(NEW.opener).length - 1).toBe(1);
    expect(chatSrc.split(NEW.button).length - 1).toBe(1);
    expect(chatSrc.split(OLD.opener).length - 1).toBe(0);
    expect(chatSrc.split(OLD.button).length - 1).toBe(0);

    expect(AGE_REDIRECT_TEXT).toBe(NEW.age);
    expect(AGE_REDIRECT_CARD.answer_th).toBe(NEW.age);

    for (const [id, file] of Object.entries(CARD_FILES)) {
      const fromFile = cardFromFile(file, id);
      const fromBank = BANK.find((c) => c.id === id);
      expect(fromBank, id).toBeTruthy();
      const expected = NEW[id as keyof typeof NEW];
      expect(fromFile.answer_th, id).toBe(expected);
      expect(fromBank!.answer_th, id).toBe(expected);
      for (const fact of fromFile.key_facts) {
        expect(fromFile.answer_th, `${id} key_fact ${fact}`).toContain(fact);
      }
      expect(fromFile.key_facts).toEqual(fromBank!.key_facts);
    }

    expect(cardFromFile(CARD_FILES["pregnancy.notthetime.000"], "pregnancy.notthetime.000").key_facts).toEqual([
      "1663",
      "ไม่จำเป็นต้องให้เขารู้ว่าเธอเป็นใคร",
    ]);
    expect(cardFromFile(CARD_FILES["sex.activity.consent.000"], "sex.activity.consent.000").key_facts).toEqual([
      "ความเต็มใจของทั้งสองคน",
    ]);
    expect(cardFromFile(CARD_FILES["harassment.002"], "harassment.002").key_facts).toEqual(["1300", "191"]);
    expect(cardFromFile(CARD_FILES["disease.syphilis.001"], "disease.syphilis.001").key_facts).toEqual([
      "แผลที่ขอบยกนูนแข็ง",
    ]);
    expect(cardFromFile(CARD_FILES["relationship.violence.001"], "relationship.violence.001").key_facts).toEqual([
      "1300",
      "ศูนย์พึ่งได้",
    ]);

    expect(TWELVE).toHaveLength(12);
    for (const s of TWELVE) {
      expect(s, s).not.toMatch(/พี่|น้อง/);
    }
  });

  it("คุณ surfaces unchanged", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const chat = readFileSync("src/ui/chat.ts", "utf8");
    const referral = readFileSync("src/core/referral.ts", "utf8");

    const crisisHeading = "ตอนนี้ความปลอดภัยของคุณสำคัญที่สุด";
    const crisisLead = "คุณไม่ได้อยู่คนเดียว มีคนพร้อมช่วยตอนนี้ กดที่เบอร์เพื่อโทรได้ทันที";
    const crisisStrip = "ถ้าเรื่องนี้เกิดกับคุณ หรือคุณไม่ปลอดภัยตอนนี้ ";
    const under15Body = "แต่คุณยังขอความช่วยเหลือได้เสมอ:";

    expect(main).toContain(crisisHeading);
    expect(main).toContain(crisisLead);
    expect(main).toContain(crisisStrip);
    expect(chat).toContain(crisisStrip);
    expect(main).toContain(under15Body);
    expect(crisisHeading).toContain("คุณ");
    expect(crisisLead).toContain("คุณ");
    expect(crisisStrip).toContain("คุณ");
    expect(under15Body).toContain("คุณ");
    expect(referral).toContain(SUPPORT_BASE[0]);

    const supportValues = Object.values(SUPPORT_LINE_TH);
    expect(supportValues).toHaveLength(8);
    expect(supportValues).toEqual([...SUPPORT_BASE]);
    for (const s of supportValues) {
      expect(s).not.toContain("เธอ");
    }
  });

  it("pins safety files to the base blob SHA-1", () => {
    for (const [rel, sha] of Object.entries(PINNED)) {
      expect(gitBlobSha(rel), rel).toBe(sha);
    }

    const git = spawnSync("git", ["rev-parse", "--verify", BASE], { encoding: "utf8" });
    if (git.error || git.status !== 0) return;
    const diff = spawnSync("git", ["diff", "--quiet", BASE, "--", ...SAFETY_FILES], { encoding: "utf8" });
    expect(diff.status, diff.stderr || diff.stdout).toBe(0);
  });
});
