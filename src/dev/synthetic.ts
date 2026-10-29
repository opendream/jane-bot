/** Built-in synthetic prompts for the dev-test panel. Never real user text. */
import seed from "../../evals/seed-set.json";
import para from "../../evals/paraphrase-set.json";

export interface SyntheticPrompt {
  id: string;
  text: string;
}

function itemsOf(mod: unknown): { id?: string; text?: string }[] {
  const items = (mod as { items?: { id?: string; text?: string }[] }).items;
  return Array.isArray(items) ? items : [];
}

let cached: SyntheticPrompt[] | null = null;

export function syntheticPrompts(): SyntheticPrompt[] {
  if (cached) return cached;
  cached = [...itemsOf(seed), ...itemsOf(para)]
    .filter((i): i is { id: string; text: string } => !!i.id && !!i.text)
    .map((i) => ({ id: i.id, text: i.text }));
  return cached;
}

export function promptIdForText(text: string): string | null {
  const t = text.trim();
  return syntheticPrompts().find((p) => p.text === t)?.id ?? null;
}
