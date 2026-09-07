import fs from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../next-app/package.json',import.meta.url));
const ts=require('typescript');const {Workbook}=require('exceljs');
const modules=new Map();
function load(name){
  if(modules.has(name))return modules.get(name);
  const source=fs.readFileSync(new URL(`../next-app/lib/${name}.ts`,import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('require','exports',code)((path)=>path.startsWith('./')?load(path.slice(2)):require(path),exports);
  modules.set(name,exports);return exports;
}
const {parsePhoneSheet}=load('telecom-phone-workbook');
const b=new Workbook();const s=b.addWorksheet('Synthetic');
s.addRow(['STT','POSITION','SERIAL\nNUMBER','TEL.\nNUMBER','OPEN/CLOSE','NEW TEL.\nNUMBER','BALANCE','NOTE']);
s.addRow([1,'Vị trí có dấu','00123','0123456789','OPEN','',100,'Ghi chú có khoảng trắng']);
s.addRow([2,'Vị trí khác','serial','0123456789','CLOSE']);
s.addRow([3,'','logger',123456789,'OPEN','','','HUỶ']);
s.addRow([4,'Place','serial','bad','OPEN']);
s.addRow([5,'Place','serial','0987654321','mystery']);
const rows=parsePhoneSheet(s);
assert.equal(rows.length,5);assert.equal(rows[0].phone,'0123456789');assert.equal(rows[0].serial,'00123');
assert.equal(rows[0].note,'Ghi chú có khoảng trắng');assert.equal(rows[1].duplicate,true);
assert.match(rows[2].warning,/HỦY/);assert.match(rows[2].warning,/số 0/);assert.ok(rows[3].error);assert.equal(rows[4].status,'unknown');
const vi=b.addWorksheet('Vietnamese');vi.addRow(['Số điện thoại','Vị trí lắp đặt','Trạng thái','Ghi chú']);vi.addRow(['+84 123 456 789','Test','Đã hủy','']);
assert.equal(parsePhoneSheet(vi)[0].status,'cancelled');assert.equal(parsePhoneSheet(vi)[0].phone,'+84123456789');
if(process.argv[2]){const sample=new Workbook();await sample.xlsx.readFile(process.argv[2]);for(const sheet of sample.worksheets){const result=parsePhoneSheet(sheet);console.log(JSON.stringify({sheet:sheet.name,rows:result.length,warnings:result.filter(r=>r.warning).length,invalid:result.filter(r=>r.error).length,duplicates:result.filter(r=>r.duplicate).length}));}}
console.log('Phone workbook checks passed: leading zeros, bilingual columns, status mapping, replacement fields, warnings and duplicate handling.');
