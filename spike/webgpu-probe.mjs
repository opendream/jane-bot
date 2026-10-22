import { chromium } from "@playwright/test";
const flagsets = {
  default: [],
  unsafe: ["--enable-unsafe-webgpu"],
  swiftshader: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan"],
  swiftshader2: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--use-vulkan=swiftshader", "--enable-features=Vulkan,WebGPUService", "--disable-vulkan-surface"],
};
for (const [name, args] of Object.entries(flagsets)) {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args });
  const p = await b.newPage();
  await p.goto("http://127.0.0.1:8099/probe.html");
  const r = await p.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { gpu: true, adapter: null };
    const info = a.info || {};
    return { gpu: true, adapter: { vendor: info.vendor, arch: info.architecture, desc: info.description },
      f16: a.features.has("shader-f16"), maxBuf: a.limits.maxBufferSize, maxStorage: a.limits.maxStorageBufferBindingSize };
  });
  console.log(name, JSON.stringify(r));
  await b.close();
}
