/**
 * Chat-first generation epoch. AbortSignal is not enough on its own: a
 * queued wllama request can still start after abort, and WebGPU generate
 * may ignore cancel. Every reply is tagged with the token it was started
 * for; a stale token is discarded and a queued request whose token is
 * stale returns without generating.
 *
 * Never logs user text.
 */

let token = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function bumpGenerationToken(): number {
  token += 1;
  notify();
  return token;
}

export function currentGenerationToken(): number {
  return token;
}

export function isCurrentGeneration(groupId: number): boolean {
  return groupId === token;
}

/** True when a queued or in-flight generate must not run / must not count. */
export function shouldSkipGeneration(groupId?: number, signal?: AbortSignal): boolean {
  if (groupId != null && !isCurrentGeneration(groupId)) return true;
  return !!signal?.aborted;
}

/** Subscribe to token bumps (generation queue uses this to drop stale waiters). */
export function onGenerationTokenChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test helper. Production never calls this. */
export function resetGenerationTokenForTests(): void {
  token = 0;
  notify();
}
