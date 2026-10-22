import { chromium } from "@playwright/test";
const model = process.argv[2] || "Qwen3-1.7B-q4f32_1-MLC";
// Persistent profile: Cache Storage quota in ephemeral contexts is too small for ~1 GB of weights.
const b = await chromium.launchPersistentContext("/tmp/webllm-spike-profile", { executablePath: "/usr/bin/google-chrome",
  headless: true, args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-webgpu-adapter=swiftshader"] });
const p = b.pages()[0] || await b.newPage();
const reqs = new Set();
p.on("request", (r) => reqs.add(new URL(r.url()).origin));
p.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text().slice(0, 300)); });
const t0 = Date.now();
await p.goto(`http://127.0.0.1:8099/webllm-spike.html?model=${model}`);
let last = 0;
while (true) {
  const res = await p.evaluate(() => window.__result);
  const logs = await p.evaluate(() => window.__log || []);
  for (const l of logs.slice(last)) console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s]`, l.slice(0, 200));
  last = logs.length;
  if (res) { console.log("RESULT", JSON.stringify(res)); break; }
  if (Date.now() - t0 > 40 * 60 * 1000) { console.log("TIMEOUT"); break; }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("origins requested:", [...reqs]);
await b.close();
