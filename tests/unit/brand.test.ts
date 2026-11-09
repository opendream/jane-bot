import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PRODUCT_NAME, PRODUCT_NAME_EN } from "../../src/config";

describe("brand", () => {
  it("name is เจน / Jane", () => {
    expect(PRODUCT_NAME).toBe("เจน");
    expect(PRODUCT_NAME_EN).toBe("Jane");
  });
  it("mark is a self-contained, code-drawn SVG (no images, links, scripts or fonts)", () => {
    const svg = fs.readFileSync("src/assets/mark.svg", "utf8");
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 64 64"/);
    expect(svg).not.toMatch(/<image|href=|<script|<text|@import|url\(|base64/i);
    expect(svg.length).toBeLessThan(2000);
  });
  it("no leftover placeholder name in user-facing code", () => {
    for (const f of ["src/main.ts", "index.html", "src/config.ts"]) expect(fs.readFileSync(f, "utf8")).not.toMatch(/ผู้ช่วยเดโม|Demo Helper/);
  });
  it("the only art credit is Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026. (no illustrator name, no CC BY-SA on art)", () => {
    const jane = fs.readFileSync("src/ui/jane.ts", "utf8");
    const main = fs.readFileSync("src/main.ts", "utf8");
    expect(jane).toContain('export const ART_CREDIT = "Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026."');
    expect(main).toContain("ART_CREDIT");
    expect(main).not.toContain("OpenDream");
    expect(jane).not.toContain("OpenDream");
    const credits = [...jane.matchAll(/Illustration[^"\n]*/g)].map((m) => m[0]);
    expect(credits).toEqual(["Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026."]);
    expect(credits.join("\n")).not.toMatch(/CC BY-SA|CC-BY-SA/);
    expect(main).not.toMatch(/Illustration[^"\n]*(CC BY-SA|CC-BY-SA)/);
  });
});
