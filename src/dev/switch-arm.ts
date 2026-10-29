/**
 * One-arm switch sequence. Abort the in-flight turn, dispose the WASM heap, then navigate.
 * Production never imports this file.
 */

export type SwitchStep = "abort" | "dispose" | "cache" | "navigate";

export async function switchArm(args: {
  abort: () => void;
  dispose: () => Promise<void> | void;
  prepareCache?: () => Promise<void> | void;
  navigate: () => void;
  onStep?: (step: SwitchStep) => void;
}): Promise<void> {
  args.onStep?.("abort");
  args.abort();
  args.onStep?.("dispose");
  await args.dispose();
  args.onStep?.("cache");
  await args.prepareCache?.();
  args.onStep?.("navigate");
  args.navigate();
}
