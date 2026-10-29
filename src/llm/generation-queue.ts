/**
 * One-at-a-time chat generation.
 *
 * Timed-out and superseded calls abort the in-flight generate. A queued
 * request whose generation token is already stale returns immediately
 * without generating, so it cannot hold the slot. The next current turn
 * does not wait behind abandoned work: the previous call is aborted, and
 * a stale waiter bails instead of blocking.
 *
 * WASM (wllama) passes AbortSignal into createChatCompletion so generation
 * stops. WebGPU (WebLLM) does not reliably abort in-flight GPU work — call
 * interruptGenerate when the engine has it, and discard any late result
 * via shouldSkipGeneration. Never logs user text.
 */

import {
  onGenerationTokenChange,
  shouldSkipGeneration,
} from "./generation-token";

export type QueuedGenerate<T> = (signal: AbortSignal) => Promise<T>;

export interface GenerationQueueOpts {
  /**
   * Wait for the aborted previous call to settle before starting (WASM
   * is one-at-a-time). WebGPU sets this false: a late result is discarded
   * by the generation token instead of delaying the next turn.
   */
  waitForPrevious?: boolean;
}

function whenSkipped(groupId: number | undefined, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      unsub();
      signal.removeEventListener("abort", check);
      resolve();
    };
    const check = () => {
      if (shouldSkipGeneration(groupId, signal)) finish();
    };
    const unsub = onGenerationTokenChange(check);
    signal.addEventListener("abort", check);
    check();
  });
}

export function createGenerationQueue(opts: GenerationQueueOpts = {}) {
  const waitForPrevious = opts.waitForPrevious !== false;
  let inflight: { ac: AbortController; done: Promise<void> } | null = null;

  const run = async <T>(
    groupId: number | undefined,
    outer: AbortSignal | undefined,
    fn: QueuedGenerate<T>,
  ): Promise<T | null> => {
    // Drop queued / superseded work without taking the slot.
    if (shouldSkipGeneration(groupId, outer)) return null;

    inflight?.ac.abort();
    const prev = inflight;

    const ac = new AbortController();
    const onOuter = () => ac.abort();
    if (outer) {
      if (outer.aborted) ac.abort();
      else outer.addEventListener("abort", onOuter);
    }

    let release!: () => void;
    const done = new Promise<void>((r) => { release = r; });
    inflight = { ac, done };

    try {
      if (prev && waitForPrevious) {
        await Promise.race([prev.done, whenSkipped(groupId, ac.signal)]);
      }
      if (shouldSkipGeneration(groupId, ac.signal)) return null;
      const out = await fn(ac.signal);
      if (shouldSkipGeneration(groupId, ac.signal)) return null;
      return out;
    } catch {
      return null;
    } finally {
      outer?.removeEventListener("abort", onOuter);
      release();
      if (inflight?.ac === ac) inflight = null;
    }
  };

  const abort = () => inflight?.ac.abort();

  return { run, abort };
}

export type GenerationQueue = ReturnType<typeof createGenerationQueue>;
