import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import ts from "../next-app/node_modules/typescript/lib/typescript.js";

const root = join(import.meta.dirname, "..", "next-app");
const source = await readFile(join(root, "lib/reminder-email.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
const appRequire = createRequire(join(root, "package.json"));
new Function("require", "module", "exports", "process", compiled)(
  (specifier) => specifier === "server-only" ? {} : appRequire(specifier), module, module.exports, process,
);
const { sendReminderBatch, reminderHtml } = module.exports;

const previousKey = process.env.RESEND_API_KEY;
const previousFrom = process.env.RESEND_FROM_EMAIL;
const previousFetch = globalThis.fetch;
process.env.RESEND_API_KEY = "re_synthetic_not_a_real_secret";
process.env.RESEND_FROM_EMAIL = "TDW <notifications@example.test>";
const captured = [];
globalThis.fetch = async (_url, options) => {
  captured.push(options);
  return new Response(JSON.stringify({ id: "synthetic-message-id" }), { status: 200, headers: { "Content-Type": "application/json" } });
};
try {
  const id = "4c8d69db-4a76-4a71-b8fa-d8d7d91a28c1";
  const rows = await sendReminderBatch([{ notification_id: id }], (item) => ({
    notificationId: item.notification_id,
    to: "recipient@example.test",
    subject: "Nhắc hạn",
    text: "Nhắc hạn",
    html: reminderHtml("Nhắc hạn", "Người <test>", [["Xe", "Xe <1>"]], "Kiểm tra"),
  }));
  assert.equal(rows[0].status, "SENT");
  assert.equal(captured[0].headers["Idempotency-Key"], `tdw-reminder-${id}`);
  assert.match(JSON.parse(captured[0].body).html, /Người &lt;test&gt;/);

  globalThis.fetch = async () => { throw new Error("synthetic timeout"); };
  const unknown = await sendReminderBatch([{ notification_id: id }], (item) => ({
    notificationId: item.notification_id, to: "recipient@example.test", subject: "Nhắc hạn", text: "Nhắc hạn", html: "<p>Nhắc hạn</p>",
  }));
  assert.equal(unknown[0].status, "UNKNOWN");

  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Synthetic rejection" }), { status: 422, headers: { "Content-Type": "application/json" } });
  const rejected = await sendReminderBatch([{ notification_id: id }], (item) => ({
    notificationId: item.notification_id, to: "recipient@example.test", subject: "Nhắc hạn", text: "Nhắc hạn", html: "<p>Nhắc hạn</p>",
  }));
  assert.equal(rejected[0].status, "FAILED");
  console.log("Synthetic Resend reminder delivery: pass");
} finally {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousKey;
  if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = previousFrom;
}
