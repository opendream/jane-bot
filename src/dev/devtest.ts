import { modelCardPickEnabled } from "../config";
import type { LLMAdapter } from "../llm/adapter";
import { startModel, type ModelStatus } from "../llm/runtime";
import { deleteNamedCache, keepOnlyCachedPaths } from "../llm/weights-cache";
import type { NewChatOpts } from "../ui/chat";
import {
  DEVTEST_WEIGHTS_CACHE,
  fetchArmsManifest,
  findArm,
  parseArmParam,
  rememberLastArm,
  withArmModelPick,
  armSearch,
  type ArmEntry,
  type ArmManifest,
  type ArmParam,
} from "./arms";
import { mountSwitcher } from "./switcher";
import { switchArm } from "./switch-arm";
import { recordTurn, restoreLog, clearLogMemory } from "./turn-log";

export interface DevtestHost {
  onStatus(s: ModelStatus): void;
  onAdapter(a: LLMAdapter | null): void;
  abortSession(): void;
  getAdapter(): LLMAdapter | null;
  setOnWipe(fn: () => void): void;
  setChatOpts(opts: NewChatOpts): void;
}

let manifest: ArmManifest = { arms: [] };
let param: ArmParam = { kind: "none" };
let active: ArmEntry | null = null;
let statusLine = "rules";
let coldLoadMs: number | null = null;
let loading = false;

function search(): string {
  return typeof location !== "undefined" ? location.search : "";
}

function paint() {
  mountSwitcher(
    { param, active, manifest, status: statusLine, coldLoadMs, logOn: false },
    {
      onPick: (id) => { void pickArm(id); },
      onClearCache: () => { void deleteNamedCache(DEVTEST_WEIGHTS_CACHE); },
      onFillPrompt: (text) => {
        const ta = document.querySelector('[data-testid="chat-input"], [data-testid="need-input"]') as HTMLTextAreaElement | null;
        if (ta) {
          ta.value = text;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          ta.focus();
        }
      },
    },
  );
}

async function pickArm(id: string): Promise<void> {
  if (loading) return;
  const next = armSearch(search(), id);
  await switchArm({
    abort: hostRef.abortSession,
    dispose: async () => {
      try { await hostRef.getAdapter()?.dispose?.(); } catch { /* already gone */ }
      hostRef.onAdapter(null);
    },
    prepareCache: async () => {
      const arm = findArm(manifest, id);
      try {
        await keepOnlyCachedPaths(arm?.files ?? [], DEVTEST_WEIGHTS_CACHE);
      } catch { /* cache optional */ }
      if (id !== "off") rememberLastArm(id);
    },
    navigate: () => {
      const url = `${location.pathname}${next}${location.hash}`;
      location.replace(url);
    },
  });
}

let hostRef: DevtestHost;

export async function bootDevtest(host: DevtestHost): Promise<void> {
  hostRef = host;
  restoreLog();
  host.setOnWipe(() => { clearLogMemory(); });

  const nextSearch = withArmModelPick(search());
  if (nextSearch !== search()) {
    try { history.replaceState(null, "", `${location.pathname}${nextSearch}${location.hash}`); } catch { /* ignore */ }
  }
  param = parseArmParam(search());
  host.setChatOpts({
    modelPick: modelCardPickEnabled(search()),
    search: search(),
    onTurn: ({ input, reply, ms }) => {
      recordTurn(input, reply, ms, {
        arm: param.kind === "id" ? param.id : param.kind,
        sha: active?.sha256.slice(0, 8) ?? "",
        runtime: "wasm",
        coldLoadMs,
      });
    },
  });

  manifest = await fetchArmsManifest();
  if (param.kind === "id") active = findArm(manifest, param.id) ?? null;

  if (param.kind === "none") {
    statusLine = "no arm (rules)";
    host.onStatus({ state: "off", runtime: "rules", label: "", progress: 0 });
    paint();
    return;
  }
  if (param.kind === "off") {
    statusLine = "off · rules";
    host.onStatus({ state: "off", runtime: "rules", label: "", progress: 0 });
    paint();
    return;
  }
  if (!active) {
    statusLine = "unknown arm · rules";
    host.onStatus({ state: "off", runtime: "rules", label: "", progress: 0 });
    paint();
    return;
  }
  if (!active.phone_ready) {
    statusLine = active.not_ready_reason ?? "not phone-ready";
    host.onStatus({ state: "off", runtime: "rules", label: active.label, progress: 0 });
    paint();
    return;
  }

  rememberLastArm(active.id);
  loading = true;
  statusLine = "loading";
  paint();
  const t0 = performance.now();
  const adapter = await startModel((s) => {
    host.onStatus(s);
    statusLine = s.state;
    paint();
  }, {
    search: search(),
    arm: {
      files: active.files.length === 1 ? active.files[0]! : active.files,
      label: active.label,
      cacheName: DEVTEST_WEIGHTS_CACHE,
    },
    onAdapter: host.onAdapter,
  });
  coldLoadMs = performance.now() - t0;
  loading = false;
  statusLine = adapter ? "ready" : "failed";
  if (adapter) {
    try { await keepOnlyCachedPaths(active.files, DEVTEST_WEIGHTS_CACHE); } catch { /* cache optional */ }
  }
  paint();
}
