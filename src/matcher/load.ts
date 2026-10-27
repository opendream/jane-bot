import { noopMatcher, type IntentMatcher } from "../core/matcher";

/**
 * Unique marker for the default-bundle test. This module is loaded only via
 * dynamic import() after import.meta.env.DEV, the matcher flag is on, and the
 * UA is not a phone. Do not statically import it from the app entry.
 */
export const MATCHER_IMPL_ID = "JANE_MATCHER_E5_SMALL_INT8";

/**
 * Desktop-dev seam. The e5-small int8 runtime is not shipped; this is a no-op
 * stub (abstain → existing fallback). No fetch, XHR, or HEAD — the stub needs
 * none. Weights stay gitignored and uncommitted.
 */
export async function loadMatcher(_opts: { search?: string } = {}): Promise<IntentMatcher> {
  void MATCHER_IMPL_ID;
  return noopMatcher;
}
