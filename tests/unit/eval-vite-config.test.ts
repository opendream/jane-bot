import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

describe("eval vite config", () => {
  it("loads when the app config is a callback (vite build -c vite.eval.config.ts)", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "production" },
      path.resolve("vite.eval.config.ts"),
    );
    expect(loaded, "eval config must load").toBeTruthy();
    expect(loaded!.config.build?.outDir).toBe("dist-eval");
    expect(JSON.stringify(loaded!.config.build?.rollupOptions?.input)).toContain("eval.html");
  });
});
