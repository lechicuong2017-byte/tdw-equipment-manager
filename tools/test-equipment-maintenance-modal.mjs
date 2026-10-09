import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../next-app/package.json", import.meta.url));
const ts = require("typescript");
const forms = await readFile(new URL("../next-app/components/maintenance-forms.tsx", import.meta.url), "utf8");
const toastSource = await readFile(new URL("../next-app/components/action-toast.tsx", import.meta.url), "utf8");
const modal = await readFile(new URL("../next-app/components/app-modal.tsx", import.meta.url), "utf8");

// Check the JSX tree, not just whether a toast appears somewhere in the file.
const tree = ts.createSourceFile("maintenance-forms.tsx", forms, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const observedStates = new Set();
function visit(node, ancestors = []) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "ActionStateToast") {
    const state = node.attributes.properties.find((property) => property.name?.getText(tree) === "state");
    const stateName = state?.initializer?.expression?.getText(tree);
    if (stateName === "planState" || stateName === "logState") {
      const expectedAction = stateName === "planState" ? "planAction" : "logAction";
      assert.ok(ancestors.some((parent) => ts.isJsxElement(parent)
        && parent.openingElement.tagName.getText(tree) === "ModalTrigger"), `${stateName} must be inside its modal success boundary`);
      assert.ok(ancestors.some((parent) => ts.isJsxElement(parent)
        && parent.openingElement.tagName.getText(tree) === "form"
        && parent.openingElement.attributes.properties.some((property) => property.name?.getText(tree) === "action"
          && property.initializer?.expression?.getText(tree) === expectedAction)), `${stateName} must observe the matching form`);
      assert.ok(!observedStates.has(stateName), "Do not notify twice for the same action");
      observedStates.add(stateName);
    }
  }
  ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
}
visit(tree);
assert.deepEqual([...observedStates].sort(), ["logState", "planState"]);

// Execute the actual ActionStateToast with a minimal hook harness. No database,
// credentials, browser session, or real equipment records are involved.
const contexts = [];
let refs = [];
let cursor = 0;
let effects = [];
const react = {
  createContext(value) { const context = { value }; contexts.push(context); return context; },
  useContext: (context) => context.value,
  useRef(value) { return refs[cursor++] ??= { current: value }; },
  useEffect: (effect) => effects.push(effect),
  useCallback: (callback) => callback,
  useState: (value) => [value, () => {}],
};
const compiled = ts.transpileModule(toastSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  exports: module.exports,
  module,
  require(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
    if (name === "next/navigation" || name === "@/components/app-icon") return {};
    throw new Error(`Unexpected dependency: ${name}`);
  },
});
const messages = [];
let closes = 0;
contexts[0].value = { showToast: (message) => messages.push(message) };
module.exports.ActionSuccessContext.value = () => { closes += 1; };
function render(state, mount = false) {
  if (mount) refs = [];
  cursor = 0;
  effects = [];
  module.exports.ActionStateToast({ state });
  effects.forEach((effect) => effect());
}
render({}, true);
render({ error: "Dữ liệu chưa hợp lệ" });
assert.equal(closes, 0, "Validation errors must keep the form open");
const saved = { success: "Đã ghi nhận bảo trì cho 7 thiết bị." };
render(saved);
assert.equal(closes, 1, "Bulk maintenance success must close the modal");
assert.deepEqual(messages, [saved.success]);
render(saved);
assert.equal(closes, 1, "Re-rendering must not duplicate success");
render(saved, true);
assert.equal(closes, 1, "Reopening must not close from stale action state");
render({ success: saved.success });
assert.equal(closes, 2, "Another successful save with the same message must close again");
render({}, true);
render({ success: "Đã ghi nhận bảo trì cho 1 thiết bị." });
assert.equal(closes, 3, "Single-device maintenance must also close");
render({}, true);
render({ success: "Đã tạo kế hoạch cho 7 thiết bị." });
assert.equal(closes, 4, "Plan creation must also close");
assert.match(modal, /window\.setTimeout\(\(\) => router\.refresh\(\), 0\)/, "Refresh must follow closing the modal");
assert.match(modal, /return acquireBodyScrollLock\(\)/, "Closing must release the page scroll lock");
console.log("Equipment maintenance modal checks passed (JSX boundary wiring and action lifecycle).");
