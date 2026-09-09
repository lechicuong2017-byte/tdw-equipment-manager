import fs from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../next-app/package.json', import.meta.url));
const ts = require('typescript'); const { Workbook } = require('exceljs');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = fs.readFileSync(new URL(`../next-app/lib/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {}; new Function('require', 'exports', code)((path) => path.startsWith('@/lib/') ? load(path.slice(6)) : require(path), exports);
  modules.set(name, exports); return exports;
}
const { parseQuestionWorkbook } = load('survey-xlsx');
const { identitySchema, surveySchema } = load('surveys');
const b = new Workbook(); const s = b.addWorksheet('Synthetic');
s.addRow(['Câu hỏi', 'Loại', 'Lựa chọn', 'Bắt buộc']);
s.addRows([
  ['Phòng ban có dấu', 'short', '', 'Có'], ['Ý kiến tự do', 'long', '', 'Không'],
  ['Chọn một', 'single', 'A | B', 'Có'], ['Chọn nhiều', 'multiple', 'A | B | C', 'Có'],
  ['Sai loại', 'unknown', '', 'Có'], ['Trùng lựa chọn', 'single', 'A | A', 'Có'],
  ['Sai bắt buộc', 'short', '', 'Yes'], [{ formula: '1+1', result: 2 }, 'short', '', 'Có'],
]);
const rows = await parseQuestionWorkbook(await b.xlsx.writeBuffer());
assert.equal(rows.length, 8); assert.equal(rows.filter((r) => r.question).length, 4);
assert.equal(rows[0].question.title, 'Phòng ban có dấu'); assert.equal(rows[3].question.type, 'multiple');
assert.deepEqual(rows[2].question.options, ['A', 'B']); assert.ok(rows[7].error);
assert.ok(surveySchema.safeParse({ title: 'Khảo sát', description: '', questions: rows.filter((r) => r.question).map((r) => r.question) }).success);
assert.ok(identitySchema.safeParse({ full_name: 'Nhân viên', phone: '0900000000', email: '' }).success);
assert.ok(identitySchema.safeParse({ full_name: 'Nhân viên', phone: '', email: 'synthetic@example.invalid' }).success);
assert.equal(identitySchema.safeParse({ full_name: 'Nhân viên', phone: '', email: '' }).success, false);
const bad = new Workbook(); bad.addWorksheet('Bad').addRow(['Wrong']);
const invalidBuffer = await bad.xlsx.writeBuffer();
await assert.rejects(() => parseQuestionWorkbook(invalidBuffer), /Tiêu đề chưa đúng/);
console.log('PASS: XLSX four question modes, row validation, formula rejection, Unicode, option splitting and contact validation.');
