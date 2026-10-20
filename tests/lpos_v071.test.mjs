import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadWorkspaceModule() {
  const source = readFileSync("apps/lpos/src/workspace.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText.replaceAll('"./engine/portfolio.js"', JSON.stringify(pathToFileURL(resolve("apps/lpos/src/engine/portfolio.js")).href));
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

function localStorageMock(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("temporary invalid input is saved as a draft while strict workspace saving returns an error", async () => {
  const module = await loadWorkspaceModule();
  const priorWindow = globalThis.window;
  const storage = localStorageMock();
  globalThis.window = { localStorage: storage };
  try {
    const invalid = module.createDefaultWorkspace();
    invalid.current.ownCapital = 0;
    assert.match(module.persistWorkspace(invalid), /尚未通過驗證/);
    assert.equal(storage.values.has("lpos-v07-workspace-v2"), false);

    const valid = module.createDefaultWorkspace();
    const message = module.persistEditorState({
      lastValidWorkspace: valid,
      drafts: { "current.ownCapital": "0" },
      activeStep: 0,
      loanAmountTwd: 0,
      cashReserveTwd: 0,
      linkLoanWeights: true
    });
    assert.equal(message, "");
    const restored = module.loadEditorState();
    assert.equal(restored.workspace.current.ownCapital, 0);
    assert.equal(restored.lastValidWorkspace.current.ownCapital, valid.current.ownCapital);
    assert.equal(restored.drafts["current.ownCapital"], "0");
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test("corrupt editor storage is retained and blocks automatic replacement", async () => {
  const module = await loadWorkspaceModule();
  const priorWindow = globalThis.window;
  const storage = localStorageMock({ "lpos-v071-editor-v3": "{broken json" });
  globalThis.window = { localStorage: storage };
  try {
    const loaded = module.loadEditorState();
    assert.equal(loaded.canPersist, false);
    assert.equal(loaded.rawBackup, "{broken json");
    assert.match(loaded.notice, /不會覆寫/);
    assert.equal(storage.getItem("lpos-v071-editor-v3"), "{broken json");
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test("a fresh editor starts with no loan and migrated scenarios retain their original loan intent", async () => {
  const module = await loadWorkspaceModule();
  const priorWindow = globalThis.window;
  const freshStorage = localStorageMock();
  globalThis.window = { localStorage: freshStorage };
  try {
    const fresh = module.loadEditorState();
    assert.equal(fresh.loanAmountTwd, 0);
    assert.equal(fresh.workspace.current.borrowUtilPct, 0);

    const existing = module.createDefaultWorkspace();
    freshStorage.setItem("lpos-v07-workspace-v2", JSON.stringify(existing));
    const migrated = module.loadEditorState();
    assert.ok(migrated.loanAmountTwd > 0);
    assert.equal(migrated.workspace.current.borrowUtilPct, existing.current.borrowUtilPct);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test("editor saves preserve decimal amount intent and storage failures stay recoverable", async () => {
  const module = await loadWorkspaceModule();
  const priorWindow = globalThis.window;
  const storage = localStorageMock();
  globalThis.window = { localStorage: storage };
  try {
    const workspace = module.createDefaultWorkspace();
    const error = module.persistEditorState({ lastValidWorkspace: workspace, drafts: { "cash.reserve": "12,500.75", "current.monthlyFreeCashFlow": "-25,000.75" }, activeStep: 0, loanAmountTwd: 25000.5, cashReserveTwd: 12500.75, linkLoanWeights: true });
    assert.equal(error, "");
    const restored = module.loadEditorState();
    assert.equal(restored.cashReserveTwd, 12500.75);
    assert.equal(restored.loanAmountTwd, 25000.5);
    assert.equal(restored.drafts["cash.reserve"], "12,500.75");
    assert.equal(restored.workspace.current.monthlyFreeCashFlow, -25000.75);

    globalThis.window = { get localStorage() { throw new Error("storage denied"); } };
    assert.match(module.persistEditorState({ lastValidWorkspace: workspace, drafts: {}, activeStep: 0, loanAmountTwd: 0, cashReserveTwd: 0, linkLoanWeights: false }), /暫存失敗/);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test("V0.7.1 user flow exposes the four setup steps and separates advanced research", () => {
  const app = readFileSync("apps/lpos/src/App.tsx", "utf8");
  assert.match(app, /資金.*ETF 配置.*借款.*確認試算/);
  assert.match(app, /進階研究與工具/);
  assert.match(app, /設定已變更，舊研究結果已隱藏/);
  assert.match(app, /loanAmountTwd > Number\(capacityCalc\.loanCapacity/);
});
