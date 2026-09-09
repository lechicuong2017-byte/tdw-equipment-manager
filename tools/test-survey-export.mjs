import fs from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../next-app/package.json', import.meta.url));
const ts = require('typescript'); const { Workbook } = require('exceljs');
let permitted = true; let failSecondPage = false;
const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const survey = { id: '11111111-1111-4111-8111-111111111111', title: 'Tiêu đề thử', description: 'Chỉ dữ liệu synthetic', questions: [{ id: questionId, title: 'Bạn chọn gì?', type: 'multiple', required: true, options: ['A', 'B'] }] };
const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i), full_name: i === 0 ? '=1+1' : 'Nhân viên synthetic', phone: '0900000000', email: '', submitted_at: '2026-09-08T01:00:00Z', answers: { [questionId]: i % 2 ? ['A'] : ['A', 'B'] } }));
function load(relative) {
  const source = fs.readFileSync(new URL(`../next-app/${relative}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {}; new Function('require', 'exports', code)((name) => {
    if (name === '@/lib/auth') return { can: () => permitted, requireModuleAccess: async () => ({ access: {}, supabase: { from: (table) => {
      const builder = { select: () => builder, eq: () => builder, lte: () => builder, order: () => builder,
        maybeSingle: async () => ({ data: survey }), range: async (start, end) => failSecondPage && start > 0 ? { error: { message: 'synthetic failure' } } : { data: rows.slice(start, end + 1) } };
      return builder;
    } } }) };
    if (name === 'next/server') return { NextResponse: Response };
    if (name.startsWith('@/lib/')) return load(name.slice(2));
    return require(name);
  }, exports); return exports;
}
const route = load('app/api/surveys/[id]/export/route');
const template = load('app/api/surveys/template/route');
let result = await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: survey.id }) });
assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'private, no-store');
const workbook = new Workbook(); await workbook.xlsx.load(await result.arrayBuffer());
const responseSheet = workbook.getWorksheet('Cau tra loi');
assert.equal(responseSheet.rowCount, 502); assert.equal(responseSheet.getRow(2).getCell(1).value, '=1+1');
assert.equal(responseSheet.getRow(2).getCell(1).type, 3); // Plain text, not formula.
assert.equal(responseSheet.getRow(2).getCell(2).value, '0900000000');
assert.equal(responseSheet.getRow(2).getCell(5).value, 'A; B');
assert.equal(workbook.getWorksheet('Tong hop').getRow(3).getCell(2).value, 501);
result = await template.GET(); const model = new Workbook(); await model.xlsx.load(await result.arrayBuffer());
assert.deepEqual(model.worksheets[0].getRow(1).values.slice(1), ['Câu hỏi', 'Loại', 'Lựa chọn', 'Bắt buộc']);
assert.equal(model.worksheets[0].rowCount, 5);
failSecondPage = true;
assert.equal((await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: survey.id }) })).status, 503);
permitted = false;
assert.equal((await route.GET(new Request('http://localhost'), { params: Promise.resolve({ id: survey.id }) })).status, 403);
assert.equal((await template.GET()).status, 403);
console.log('PASS: real export/template handlers, 501-row pagination, Unicode, leading-zero phones, no formula interpretation, summaries, partial-query failure and permission denial.');
