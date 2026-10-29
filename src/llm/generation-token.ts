/**
 * Chat-first generation epoch. AbortSignal is not enough: wllama still starts a
 * queued request after abort, and the WebGPU path ignores cancel. Every reply
 * is tagged with the token it was started for; a stale token is discarded and a
 * queued request whose token is stale returns without generating.
 *
 * Never logs user text.
 */

let token = 0;

export function bumpGenerationToken(): number {
  token += 1;
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

/** Test helper. Production never calls this. */
export function resetGenerationTokenForTests(): void {
  token = 0;
}
