import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseTelecomInvoice,telecomPageText,telecomInvoiceKey,telecomInvoiceSchema,telecomPeriod,telecomFilterSchema} from '../next-app/lib/telecom-invoices.ts';

const viettel=`Ký hiệu: 1K26TEST HÓA ĐƠN DỊCH VỤ VIỄN THÔNG (GTGT) Số: 000123 Ngày lập: 02/09/2026
TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI Mã số thuế:0100109106
Số thuê bao: Đại diện (123456789) Kỳ cước: Tháng 08/2026 Số hợp đồng:TEST Hình thức thanh toán:TM/CK
1 Dịch vụ Di động 01 27.273 10% 2.727 30.000 CỘNG 27.273 2.727 30.000 TỔNG CỘNG TIỀN THANH TOÁN`;
const r=parseTelecomInvoice(viettel,1);
assert.equal(r.period_month,'2026-08-01');assert.equal(r.issued_on,'2026-09-02');
assert.equal(r.subscriber,'123456789');assert.equal(r.amount_after_tax,30000);
assert.equal(parseTelecomInvoice(viettel.replace('CỘNG 27.273 2.727 30.000 TỔNG CỘNG TIỀN THANH TOÁN','CỘNG 27.273 2.727 TỔNG CỘNG TIỀN THANH TOÁN 30.000'),1).amount_after_tax,30000);
assert.equal(telecomInvoiceKey(r),'0100109106|1K26TEST|123');
assert.throws(()=>parseTelecomInvoice(viettel.replace('Tháng 08','Tháng 13'),1));
assert.throws(()=>parseTelecomInvoice(viettel.replace('CỘNG 27.273 2.727 30.000','CỘNG 27.273 2.727 99.000'),1));
assert.throws(()=>parseTelecomInvoice('Unreadable scanned PDF',1));
assert.equal(telecomInvoiceSchema.safeParse({...r,amount_after_tax:-1}).success,false);
assert.deepEqual(telecomPeriod(2026,12),{start:'2026-12-01',end:'2027-01-01'});
assert.deepEqual(telecomPeriod(2026),{start:'2026-01-01',end:'2027-01-01'});
assert.equal(telecomFilterSchema.safeParse({year:2026,category:'invalid'}).success,false);
const mobi=`TỔNG CÔNG TY HÓA ĐƠN DỊCH VỤ VIỄN THÔNG (GTGT) Ký hiệu (Serial No):1K26TEST
VIỄN THÔNG MOBIFONE Số (No): 456 Ngày 05 tháng 09 năm 2026
Mã số thuế (taxcode): 0100686209 Số thuê bao (Sub No): 123456789
Cước từ ngày (Charging from): 01/08/2026 đến ngày (to): 31/08/2026
1 Cước dịch vụ viễn thông trả sau (Dịch vụ chịu thuế) 54.109 10% 5.411 59.520
CỘNG (TOTAL): 54.109 5.411 59.520 TỔNG TIỀN THANH TOÁN (GRAND TOTAL):`;
assert.equal(parseTelecomInvoice(mobi,1).amount_after_tax,59520);
assert.throws(()=>parseTelecomInvoice(mobi.replace('31/08/2026','31/09/2026'),1));
console.log('Synthetic parser checks passed.');

// Optional real samples are read only locally; print aggregate counts, not identities.
if(process.argv.length>2) {
  const pdfjs=await import('../next-app/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  for(const path of process.argv.slice(2)) {
    const doc=await pdfjs.getDocument({data:new Uint8Array(await fs.readFile(path)),isEvalSupported:false,useWorkerFetch:false}).promise;
    try {
      const rows=[];
      for(let pageNo=1;pageNo<=doc.numPages;pageNo++) {
        const page=await doc.getPage(pageNo);const content=await page.getTextContent();
        const text=telecomPageText(content.items.filter(item=>'str' in item));
        rows.push(parseTelecomInvoice(text,pageNo));page.cleanup();
      }
      console.log(JSON.stringify({pages:doc.numPages,invoices:rows.length,unique:new Set(rows.map(telecomInvoiceKey)).size,periods:[...new Set(rows.map(r=>r.period_month))],before:rows.reduce((s,r)=>s+r.amount_before_tax,0),vat:rows.reduce((s,r)=>s+r.tax_amount,0),gross:rows.reduce((s,r)=>s+r.amount_after_tax,0)}));
    } finally {await doc.destroy();}
  }
}
