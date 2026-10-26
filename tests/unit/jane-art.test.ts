import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ART_CREDIT, JANE_STARS } from "../../src/ui/jane";

const ROOT = path.resolve(__dirname, "../..");
const JANE_DIR = path.join(ROOT, "src/assets/jane");
const FONT_DIR = path.join(ROOT, "src/assets/fonts");
const CDN = /fonts\.googleapis|fonts\.gstatic|gstatic\.com|fonts\.cdn|cdnjs|jsdelivr|unpkg|cloudinary|imgur\.com|fbcdn|raw\.githubusercontent|github\.com\/.*\/releases/i;

const EXPECTED_FILES = [
  "star-yellow.svg", "star-lilac.svg", "star-lilac-2.svg", "star-pale-blue.svg",
  "star-pink.svg", "star-white.svg", "stars-sheet.svg", "tokens.css", "MANIFEST.md",
];

const REMOVED_RASTERS = [
  "avatar.webp", "avatar-96.webp", "header.webp", "empty.webp",
  "quiz-thinking.webp", "quiz-surprised.webp", "quiz-back.webp",
];

describe("Jane 2018 art and credit", () => {
  it("credit text is exact and shown from the helper", () => {
    expect(ART_CREDIT).toBe("Illustration © Opendream, 2018");
    const main = fs.readFileSync(path.join(ROOT, "src/main.ts"), "utf8");
    expect(main).toContain("ART_CREDIT");
    expect(main).toContain("art-credit");
  });

  it("stars are decorative; no raster Jane images are shipped or referenced", () => {
    for (const [k, spec] of Object.entries(JANE_STARS)) {
      expect(spec.decorative, k).toBe(true);
    }
    const src = fs.readFileSync(path.join(ROOT, "src/ui/jane.ts"), "utf8");
    expect(src).toMatch(/alt:\s*""/);
    expect(src).toContain('"aria-hidden": "true"');
    expect(src).not.toMatch(/\.webp/);
    expect(src).not.toContain("janeImg");
    expect(src).not.toContain("JANE_IMAGES");
    const files = fs.readdirSync(JANE_DIR);
    expect(files.filter((f) => /\.(webp|png|jpe?g|gif|pdf)$/i.test(f))).toEqual([]);
    for (const f of REMOVED_RASTERS) expect(files, f).not.toContain(f);
  });

  it("ships the given SVG/tokens only (no new art, no condom mascot, no comic pages)", () => {
    const files = fs.readdirSync(JANE_DIR).sort();
    for (const f of EXPECTED_FILES) expect(files, f).toContain(f);
    expect(files.some((f) => /condom|mascot|comic/i.test(f))).toBe(false);
    expect(files.filter((f) => /\.(png|jpe?g|gif|pdf|webp)$/i.test(f))).toEqual([]);
  });

  it("star SVGs are self-contained (no href, script, style or font)", () => {
    for (const f of fs.readdirSync(JANE_DIR).filter((n) => n.endsWith(".svg"))) {
      const svg = fs.readFileSync(path.join(JANE_DIR, f), "utf8");
      expect(svg, f).not.toMatch(/<image|href=|<script|<style|@import|url\(|<font/i);
    }
  });

  it("self-hosts Mitr (OFL) and never points at a font or image CDN", () => {
    const ofl = fs.readFileSync(path.join(FONT_DIR, "OFL.txt"), "utf8");
    expect(ofl).toMatch(/SIL OPEN FONT LICENSE/);
    expect(ofl).toMatch(/cadsondemak\/mitr/i);
    const woff = fs.readdirSync(FONT_DIR).filter((f) => f.endsWith(".woff2"));
    expect(woff.sort()).toEqual(["Mitr-Bold-latin-thai.woff2", "Mitr-Regular-latin-thai.woff2"]);
    const fontBytes = woff.reduce((n, f) => n + fs.statSync(path.join(FONT_DIR, f)).size, 0);
    expect(fontBytes).toBeGreaterThan(20_000);
    expect(fontBytes).toBeLessThan(72 * 1024);
    const faces = fs.readFileSync(path.join(FONT_DIR, "mitr.css"), "utf8");
    expect(faces).toContain("Mitr-Regular-latin-thai.woff2");
    expect(faces).not.toMatch(CDN);
    const runtime = [
      "index.html", "src/main.ts", "src/styles.css", "src/ui/jane.ts", "src/ui/chat.ts", "src/ui/quiz.ts",
    ].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
    expect(runtime).not.toMatch(CDN);
    expect(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")).toMatch(/font-src 'self'/);
    expect(fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8")).toContain("assets/fonts/mitr.css");
  });

  it("NOTICE and README keep the art off the CC BY-SA grant", () => {
    const notice = fs.readFileSync(path.join(ROOT, "NOTICE"), "utf8");
    expect(notice).toMatch(/© Opendream 2018, all rights reserved/);
    expect(notice).toMatch(/not covered by the repository's other licences/i);
    expect(notice).not.toMatch(/illustrations[^\n]*(CC BY-SA|CC-BY-SA)/i);
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    expect(readme).toContain("Illustration © Opendream, 2018");
    expect(readme).toMatch(/not cover the illustrations|not covered by Apache-2\.0 or CC BY-SA/);
    expect(readme).not.toMatch(/art is (licensed )?CC BY-SA/i);
    expect(readme).toMatch(/Never use the 2020 Jane art/);
    expect(readme).not.toMatch(/2019 Jane art/);
    const bank = fs.readFileSync(path.join(ROOT, "src/data/bank/NOTICE"), "utf8");
    expect(bank).toMatch(/not covered by this CC BY-SA notice/);
    const evals = fs.readFileSync(path.join(ROOT, "evals/NOTICE"), "utf8");
    expect(evals).toMatch(/not covered by this CC BY-SA notice/);
  });

  it("quiz success helper uses stars only; question/wrong-answer have no raster fallback", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/ui/jane.ts"), "utf8");
    expect(src).toContain("quiz-success");
    expect(src).toContain("quiz-stars");
    expect(src).not.toContain("surprised");
    expect(src).not.toContain("quizThinkingArt");
    expect(src).not.toContain("quizTryAgainArt");
    const quiz = fs.readFileSync(path.join(ROOT, "src/ui/quiz.ts"), "utf8");
    expect(quiz).toContain("quizSuccessArt()");
    expect(quiz).not.toContain("quizThinkingArt");
    expect(quiz).not.toContain("quizTryAgainArt");
  });
});
