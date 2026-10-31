import type { LLMAdapter } from "./adapter";
import type { DialogModel } from "../core/dialog";
import { REWORD_RUNTIMES } from "../config";
import { parsePick } from "./prompts";

/**
 * Bridge from a loaded LLMAdapter to the chat's DialogModel. Crisis routing never goes through here
 * (runTurn checks the rules first). Pick output is parsed against the shortlist; reword is only offered
 * on runtimes in REWORD_RUNTIMES and is always validated by rewordGuard in runTurn.
 */
export function toDialogModel(a: LLMAdapter | null, rewordRuntimes: readonly string[] = REWORD_RUNTIMES): DialogModel | null {
  if (!a) return null;
  const m: DialogModel = {
    ready: () => a.ready(),
    warmupRemainingMs: a.warmupRemainingMs ? () => a.warmupRemainingMs!() : undefined,
  };
  if (a.pickCard) {
    const pick = a.pickCard.bind(a);
    m.pickCard = async (text, shortlist, prev, signal) => parsePick((await pick(text, shortlist, prev, signal)) ?? "", shortlist.map((s) => s.id));
  }
  if (a.rewordCard && a.runtime && rewordRuntimes.includes(a.runtime)) {
    const rw = a.rewordCard.bind(a);
    m.reword = (card, signal) => rw({ answer_th: card.answer_th, key_facts: card.key_facts }, signal);
  }
  if (a.chatReply) {
    const chat = a.chatReply.bind(a);
    m.chatReply = (text, history, signal, lang, groupId) => chat(text, history, signal, lang, groupId);
  }
  return m.pickCard || m.reword || m.chatReply ? m : null;
}
