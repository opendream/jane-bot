import { h } from "../ui/dom";
import {
  type ArmEntry,
  type ArmManifest,
  type ArmParam,
  armSearch,
  formatBytes,
  shaPrefix,
} from "./arms";
import { syntheticPrompts } from "./synthetic";
import {
  clearLog,
  downloadLog,
  logState,
  setIncludeTyped,
  setLogEnabled,
} from "./turn-log";
import "./devtest.css";

export interface SwitcherView {
  param: ArmParam;
  active: ArmEntry | null;
  manifest: ArmManifest;
  status: string;
  coldLoadMs: number | null;
  logOn: boolean;
}

export interface SwitcherHandlers {
  onPick(id: string): void;
  onClearCache(): void;
  onFillPrompt(text: string): void;
}

export function badgeText(view: SwitcherView): string {
  if (view.param.kind === "none") return "DEV · no arm (rules)";
  if (view.param.kind === "off") return "DEV · off · rules";
  const a = view.active;
  if (!a) return `DEV · ${view.param.id} · not in manifest`;
  const parts = [
    "DEV",
    a.id,
    a.label !== a.id ? a.label : "",
    "WASM",
    formatBytes(a.bytes),
    a.sha256 ? `sha ${shaPrefix(a.sha256)}` : "",
    view.status,
    view.coldLoadMs != null ? `${Math.round(view.coldLoadMs)} ms` : "",
    a.note ?? "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function mountSwitcher(view: SwitcherView, handlers: SwitcherHandlers): HTMLElement {
  let root = document.querySelector(".jane-devtest") as HTMLElement | null;
  if (!root) {
    root = h("div", { class: "jane-devtest" });
    document.body.append(root);
  }
  let open = !!root.querySelector("[data-testid=dev-arm-panel]");
  const render = () => {
    const panel = open ? panelEl(view, handlers, () => { open = false; render(); }) : null;
    root!.replaceChildren(...[
      h("button", {
        class: "jane-devtest-badge",
        type: "button",
        "data-testid": "dev-arm",
        "data-arm": view.param.kind === "id" ? view.param.id : view.param.kind,
        title: badgeText(view),
        onclick: () => { open = !open; render(); },
      }, badgeText(view)),
      panel,
    ].filter((n): n is HTMLElement => !!n));
  };
  render();
  return root;
}

function panelEl(view: SwitcherView, handlers: SwitcherHandlers, close: () => void): HTMLElement {
  const log = logState();
  const prompts = syntheticPrompts();
  const sel = h("select", { "data-testid": "dev-prompt-select" },
    ...prompts.map((p) => h("option", { value: p.text }, p.id))) as HTMLSelectElement;
  return h("div", { class: "jane-devtest-panel", "data-testid": "dev-arm-panel" },
    h("h2", {}, "Dev-test arms (WASM, one at a time)"),
    h("ul", { class: "jane-devtest-list", "data-testid": "dev-arm-list" },
      h("li", {}, pickBtn("off", "off · rules only", view.param.kind === "off", true, undefined, handlers)),
      ...view.manifest.arms.map((a) => pickBtn(a.id, armLine(a), view.param.kind === "id" && view.param.id === a.id, a.phone_ready, a.not_ready_reason, handlers)),
    ),
    log.enabled ? h("p", { class: "jane-devtest-banner", "data-testid": "dev-log-banner" }, "Test log ON · synthetic prompts only") : null,
    h("label", {},
      h("input", {
        type: "checkbox",
        "data-testid": "dev-log-on",
        checked: log.enabled,
        onchange: (e: Event) => { setLogEnabled((e.target as HTMLInputElement).checked); mountSwitcher(view, handlers); },
      }),
      "Turn log (this phone, this build only; nothing is sent)",
    ),
    h("label", {},
      h("input", {
        type: "checkbox",
        "data-testid": "dev-log-typed",
        checked: log.includeTyped,
        disabled: !log.enabled,
        onchange: (e: Event) => { setIncludeTyped((e.target as HTMLInputElement).checked); },
      }),
      "Include typed text (after stripPII). Default stores synthetic prompt ids only.",
    ),
    h("p", {}, "Synthetic next prompt"),
    sel,
    h("div", { class: "jane-devtest-row" },
      h("button", { type: "button", "data-testid": "dev-prompt-next", onclick: () => handlers.onFillPrompt(sel.value) }, "Fill input"),
      h("button", { type: "button", "data-testid": "dev-log-export", onclick: () => downloadLog(), disabled: log.rows.length === 0 }, "Export"),
      h("button", { type: "button", "data-testid": "dev-log-clear", onclick: () => { clearLog(); mountSwitcher(view, handlers); } }, "Clear log"),
    ),
    h("div", { class: "jane-devtest-row" },
      h("button", { type: "button", "data-testid": "dev-cache-clear", onclick: () => handlers.onClearCache() }, "Clear model cache"),
      h("button", { type: "button", onclick: close }, "Close"),
    ),
  );
}

function armLine(a: ArmEntry): string {
  const bits = [a.id, a.label !== a.id ? a.label : "", formatBytes(a.bytes)];
  if (!a.phone_ready) bits.push(a.not_ready_reason ?? "not phone-ready");
  if (a.note) bits.push(a.note);
  return bits.filter(Boolean).join(" · ");
}

function pickBtn(id: string, label: string, active: boolean, ready: boolean, reason: string | undefined, handlers: SwitcherHandlers): HTMLElement {
  return h("button", {
    type: "button",
    "data-testid": `dev-arm-pick-${id}`,
    "data-ready": String(ready),
    "data-active": String(active),
    disabled: !ready && id !== "off",
    title: reason ?? label,
    onclick: () => handlers.onPick(id),
  }, label);
}
