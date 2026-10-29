/**
 * Chat-first load warm-up. One short fixed synthetic prompt, run locally
 * after weights load, to fill the runtime cache so the first user turn does
 * not pay a 30 s system-prompt prefill. Never user text. Never sent anywhere
 * (no network). Crisis and card paths never wait on it; a user turn aborts
 * it via the generation queue.
 *
 * Same path for Qwen3-1.7B (arm A) and Qwen3-0.6B (arm B).
 */

import type { ChatLang } from "./chat-lang";
import { currentGenerationToken, shouldSkipGeneration } from "./generation-token";

/** Fixed synthetic line. Never replaced with user text. */
export const CHAT_WARMUP_USER = "สวัสดี";
export const CHAT_WARMUP_MAX_TOKENS = 1;
export const CHAT_WARMUP_LANG: ChatLang = "th";

export interface ChatWarmupGenerate {
  user: string;
  maxTokens: number;
  signal: AbortSignal;
  groupId: number;
  lang: ChatLang;
}

/**
 * Run the synthetic chat warm-up. `generate` must not fetch or see user text.
 * Failures are swallowed by the caller; this never throws into chat.
 */
export async function runChatWarmup(
  generate: (opts: ChatWarmupGenerate) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<void> {
  const s = signal ?? new AbortController().signal;
  const groupId = currentGenerationToken();
  if (shouldSkipGeneration(groupId, s)) return;
  await generate({
    user: CHAT_WARMUP_USER,
    maxTokens: CHAT_WARMUP_MAX_TOKENS,
    signal: s,
    groupId,
    lang: CHAT_WARMUP_LANG,
  });
}
