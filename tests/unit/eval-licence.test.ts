import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import seed from "../../evals/seed-set.json";
import paraphrase from "../../evals/paraphrase-set.json";
import crisisFp from "../../evals/crisis-fp-set.json";
import review868meta from "../../evals/review868/meta.json";
import judged from "../../evals/review868/judged.json";
import { BANK_TEXT_LICENCE, checkEvalTextLicence, EVAL_ITEM_FILES } from "../../src/core/bank";

describe("eval question-set licence", () => {
  it("a missing or wrong licence field fails", () => {
    expect(checkEvalTextLicence({}, "blank.json").map((i) => i.rule)).toContain("licence");
    expect(checkEvalTextLicence({ licence: "" }, "empty.json").map((i) => i.rule)).toContain("licence");
    expect(checkEvalTextLicence({ licence: "Apache-2.0" }, "wrong.json").map((i) => i.rule)).toContain("licence");
    expect(checkEvalTextLicence(null, "null.json").map((i) => i.rule)).toContain("licence");
    expect(checkEvalTextLicence({ licence: BANK_TEXT_LICENCE }, "ok.json")).toEqual([]);
  });

  it("every shipped eval item file is CC-BY-SA-4.0 (SPDX)", () => {
    expect(EVAL_ITEM_FILES).toEqual([
      "evals/seed-set.json",
      "evals/paraphrase-set.json",
      "evals/crisis-fp-set.json",
      "evals/review868/meta.json",
      "evals/review868/judged.json",
    ]);
    const files = [
      ["evals/seed-set.json", seed],
      ["evals/paraphrase-set.json", paraphrase],
      ["evals/crisis-fp-set.json", crisisFp],
      ["evals/review868/meta.json", review868meta],
      ["evals/review868/judged.json", judged],
    ] as const;
    for (const [name, data] of files) {
      expect(checkEvalTextLicence(data, name), name).toEqual([]);
      expect((data as { licence?: string }).licence, name).toBe(BANK_TEXT_LICENCE);
    }
    const bankLegal = fs.readFileSync(path.resolve(__dirname, "../../src/data/bank/LICENSE"), "utf8");
    const evalLegal = fs.readFileSync(path.resolve(__dirname, "../../evals/LICENSE"), "utf8");
    expect(evalLegal).toBe(bankLegal);
    const notice = fs.readFileSync(path.resolve(__dirname, "../../evals/NOTICE"), "utf8");
    expect(notice).toContain("Opendream");
    expect(notice).not.toContain("OpenDream");
    expect(notice).toMatch(/CC BY-SA 4\.0|CC-BY-SA-4.0/);
    expect(notice).toContain("does not cover illustrations, art, images, sprites");
    expect(notice).toContain("review868");
  });

  it("review868/queries.json is the 868-string pack with the pinned sha256", () => {
    const buf = fs.readFileSync(path.resolve(__dirname, "../../evals/review868/queries.json"));
    expect(createHash("sha256").update(buf).digest("hex")).toBe(
      "31f26dfc913934fafcfa0337831ae4cc4e82d7a7dc636ce6d89b2f486927a948",
    );
    const queries = JSON.parse(buf.toString("utf8")) as unknown;
    expect(Array.isArray(queries)).toBe(true);
    expect((queries as string[]).length).toBe(868);
    expect(new Set(queries as string[]).size).toBe(868);
    expect(review868meta.queries_sha256).toBe("31f26dfc913934fafcfa0337831ae4cc4e82d7a7dc636ce6d89b2f486927a948");
  });

  it("judged subset is agent-judged, pending human spot-check, and labels only bank cards / none / crisis", () => {
    expect((judged as { judged_by?: string }).judged_by).toBeTruthy();
    expect(String((judged as { $comment?: string }).$comment)).toMatch(/agent-judged/i);
    expect(String((judged as { $comment?: string }).$comment)).toMatch(/pending human spot-check/i);
    const items = (judged as { items: { label: string }[] }).items;
    expect(items.length).toBeGreaterThanOrEqual(180);
    expect(items.length).toBeLessThanOrEqual(240);
    const labels = new Set(items.map((i) => i.label));
    expect(labels.has("none")).toBe(true);
    expect(labels.has("crisis")).toBe(true);
  });
});
