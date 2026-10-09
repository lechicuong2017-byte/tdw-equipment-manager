/** Static local audit only. It never reads .env, connects to a service, or deletes files. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../next-app/", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const config = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw new Error("Cannot read TypeScript configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const files = parsed.fileNames.filter((file) => !file.includes("/.next/") && !file.includes("/node_modules/"));
const graph = new Map();
const nonLiteralImports = [];
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const references = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) references.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) references.push(node.arguments[0].text);
      else nonLiteralImports.push(path.relative(root, file));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  graph.set(file, references.map((reference) => ts.resolveModuleName(reference, file, parsed.options, ts.sys).resolvedModule?.resolvedFileName).filter(Boolean));
}
const used = new Set();
function mark(file) {
  if (used.has(file)) return;
  used.add(file);
  for (const dependency of graph.get(file) ?? []) mark(dependency);
}
for (const file of files) {
  if ((file.includes("/app/") && /\/(page|layout|route|loading|error|not-found|default|template|global-error)\.tsx?$/.test(file))
    || /\/(proxy|next\.config)\.ts$/.test(file)) mark(file);
}
const candidates = files.filter((file) => (file.includes("/lib/") || file.includes("/components/")) && !used.has(file));
console.log(JSON.stringify({
  sourceFiles: files.length,
  unreachableCandidates: candidates.map((file) => path.relative(root, file)),
  nonLiteralImports: [...new Set(nonLiteralImports)],
  limit: "Static candidates require checking runtime conventions, tests and external consumers before removal. CSS, migrations and external route callers are not classified as dead code.",
}, null, 2));
if (process.argv.includes("--strict") && candidates.length) process.exitCode = 1;
