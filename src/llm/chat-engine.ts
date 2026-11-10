/**
 * Shared chat/classify engine lock. Chat warm-up runs only when chat-first is
 * on, on the same exclusive generate as classify/pick, so they cannot overlap
 * (issue #49). Card-first skips warm-up. Chat-first waits for warm-up before
 * the first user generate (within the caller's abort/timeout).
 */

import { runChatWarmup, waitForChatWarmup } from "./chat-warmup";
import { createExclusiveGenerate } from "./exclusive-generate";
import { createGenerationQueue } from "./generation-queue";
import { shouldSkipGeneration } from "./generation-token";

export function shouldStartChatWarmup(chatFirst: boolean | undefined): boolean {
  return chatFirst === true;
}

export function createChatRuntime(opts: { chatFirst?: boolean; waitForPrevious?: boolean } = {}) {
  const exclusive = createExclusiveGenerate();
  const chatQueue = createGenerationQueue({ waitForPrevious: opts.waitForPrevious !== false });
  let warmupDone: Promise<void> = Promise.resolve();

  const infer = <T>(fn: () => Promise<T>): Promise<T> => exclusive.run(fn);

  const startWarmup = (generate: (signal: AbortSignal) => Promise<unknown>): Promise<void> => {
    if (!shouldStartChatWarmup(opts.chatFirst)) {
      warmupDone = Promise.resolve();
      return warmupDone;
    }
    warmupDone = runChatWarmup(async ({ signal, groupId }) => {
      await chatQueue.run(groupId, signal, async (s) => {
        if (shouldSkipGeneration(groupId, s)) return null;
        return infer(() => generate(s));
      });
    }).catch(() => {});
    return warmupDone;
  };

  const classifyOrPick = async <T>(fn: () => Promise<T>): Promise<T> => {
    chatQueue.abort();
    return infer(fn);
  };

  const chat = async <T>(
    groupId: number | undefined,
    signal: AbortSignal | undefined,
    fn: (s: AbortSignal) => Promise<T>,
  ): Promise<T | null> => {
    await waitForChatWarmup(warmupDone, signal);
    if (shouldSkipGeneration(groupId, signal)) return null;
    return chatQueue.run(groupId, signal, async (s) => {
      if (shouldSkipGeneration(groupId, s)) return null;
      return infer(() => fn(s));
    });
  };

  return { startWarmup, classifyOrPick, chat, exclusive, chatQueue };
}

export type ChatRuntime = ReturnType<typeof createChatRuntime>;
