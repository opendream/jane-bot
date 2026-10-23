import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import seed from "../../evals/seed-set.json";
import paraphrase from "../../evals/paraphrase-set.json";
import crisisFp from "../../evals/crisis-fp-set.json";
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
    ]);
    const files = [
      ["evals/seed-set.json", seed],
      ["evals/paraphrase-set.json", paraphrase],
      ["evals/crisis-fp-set.json", crisisFp],
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
  });
});
