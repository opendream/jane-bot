import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ART_CREDIT, JANE_IMAGES, JANE_STARS, JANE_RASTER_ALLOWLIST } from "../../src/ui/jane";

const ROOT = path.resolve(__dirname, "../..");
const JANE_DIR = path.join(ROOT, "src/assets/jane");
const FONT_DIR = path.join(ROOT, "src/assets/fonts");
const DIST = path.join(ROOT, "dist");
const CDN = /fonts\.googleapis|fonts\.gstatic|gstatic\.com|fonts\.cdn|cdnjs|jsdelivr|unpkg|cloudinary|imgur\.com|fbcdn|raw\.githubusercontent|github\.com\/.*\/releases/i;
const RASTER = /\.(webp|png|jpe?g|gif|avif|jxl|bmp)$/i;
const ALLOWED = new Set<string>(JANE_RASTER_ALLOWLIST);

const EXPECTED_FILES = [
  ...JANE_RASTER_ALLOWLIST,
  "star-yellow.svg", "star-lilac.svg", "star-lilac-2.svg", "star-pale-blue.svg",
  "star-pink.svg", "star-white.svg", "stars-sheet.svg", "tokens.css", "MANIFEST.md",
];

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

/** Vite emits `name-<hash>.ext`. Match longest stem first so `avatar-96-*` is not `avatar-*`. */
function allowlistedRaster(file: string): string | null {
  if (ALLOWED.has(file)) return file;
  const ordered = [...ALLOWED].sort((a, b) => b.replace(/\.[^.]+$/, "").length - a.replace(/\.[^.]+$/, "").length);
  for (const a of ordered) {
    const stem = a.replace(/\.[^.]+$/, "");
    const ext = a.slice(stem.length);
    if (new RegExp(`^${stem}-[A-Za-z0-9_-]+${ext.replace(".", "\\.")}$`).test(file)) return a;
  }
  return null;
}

describe("Jane 2018 art and credit", () => {
  it("credit text is exact and shown from the helper", () => {
    expect(ART_CREDIT).toBe("Illustration © Opendream, 2018");
    const main = fs.readFileSync(path.join(ROOT, "src/main.ts"), "utf8");
    expect(main).toContain("ART_CREDIT");
    expect(main).toContain("art-credit");
  });

  it("each Jane image has Thai alt text; stars are decorative", () => {
    for (const [k, spec] of Object.entries(JANE_IMAGES)) {
      expect(spec.alt, k).toMatch(/[ก-๙]/);
      expect(spec.alt, k).not.toBe("");
      expect(spec.width, k).toBeGreaterThan(0);
      expect(spec.height, k).toBeGreaterThan(0);
    }
    for (const [k, spec] of Object.entries(JANE_STARS)) {
      expect(spec.decorative, k).toBe(true);
    }
    const src = fs.readFileSync(path.join(ROOT, "src/ui/jane.ts"), "utf8");
    expect(src).toMatch(/alt:\s*""/);
    expect(src).toContain('"aria-hidden": "true"');
  });

  it("ships only the allowlisted rasters plus the given SVG/tokens (no other raster, no condom mascot, no comic pages)", () => {
    const files = fs.readdirSync(JANE_DIR).sort();
    for (const f of EXPECTED_FILES) expect(files, f).toContain(f);
    expect(files.some((f) => /condom|mascot|comic/i.test(f))).toBe(false);
    const rasters = files.filter((f) => RASTER.test(f)).sort();
    expect(rasters).toEqual([...ALLOWED].sort());
    expect(files.filter((f) => /\.(png|jpe?g|gif|pdf)$/i.test(f))).toEqual([]);
  });

  it("src and dist (if built) contain no raster outside the Jane allowlist", () => {
    const srcRasters = fs.readdirSync(JANE_DIR).filter((f) => RASTER.test(f)).sort();
    expect(srcRasters).toEqual([...ALLOWED].sort());
    if (!fs.existsSync(DIST)) return;
    const distRasters = walkFiles(DIST).filter((p) => RASTER.test(p));
    const mapped = distRasters.map((p) => {
      const base = path.basename(p);
      const allowed = allowlistedRaster(base);
      expect(allowed, `unexpected raster in dist: ${path.relative(DIST, p)}`).not.toBeNull();
      return allowed!;
    });
    expect([...new Set(mapped)].sort()).toEqual([...ALLOWED].sort());
  });

  it("avatar uses srcset for 96 / 192 / 256", () => {
    expect(JANE_IMAGES.avatar96.srcset).toMatch(/96w/);
    expect(JANE_IMAGES.avatar96.srcset).toMatch(/192w/);
    expect(JANE_IMAGES.avatar96.srcset).toMatch(/256w/);
    expect(JANE_IMAGES.avatar96.sizes).toBe("40px");
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

  it("quiz success helper uses the surprised image plus stars; question/wrong-answer have art helpers", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/ui/jane.ts"), "utf8");
    expect(src).toContain('janeImg("surprised")');
    expect(src).toContain("quiz-success");
    expect(src).toContain("quiz-stars");
    expect(src).toContain("quizThinkingArt");
    expect(src).toContain("quizTryAgainArt");
    const quiz = fs.readFileSync(path.join(ROOT, "src/ui/quiz.ts"), "utf8");
    expect(quiz).toContain("quizSuccessArt()");
    expect(quiz).toContain("quizThinkingArt()");
    expect(quiz).toContain("quizTryAgainArt()");
  });
});
