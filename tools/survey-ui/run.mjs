// Browser tests of real components, with synthetic server actions and no remote requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const app = path.join(root, 'next-app');
const require = createRequire(path.join(app, 'package.json'));
const { webpack } = require('next/dist/compiled/webpack/webpack');
const { chromium } = require('playwright');
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'tdw-survey-ui-'));
const mock = path.join(root, 'tools/survey-ui/mocks.tsx');
await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(root, 'tools/survey-ui/fixture.tsx'), output: { path: output, filename: 'main.js' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(app, 'node_modules')], mainFields: ['browser','module','main'], alias: { 'next/navigation': mock, 'next/link': mock, '@/app/(protected)/surveys/actions': mock, '@/app/s/[token]/actions': mock, '@': app } },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(root, 'tools/survey-ui/loader.cjs') }] },
}, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.endsWith('.js')) { response.setHeader('Content-Type', 'text/javascript'); response.end(await fs.readFile(path.join(output, path.basename(url.pathname)))); }
  else if (url.pathname === '/globals.css' || url.pathname === '/surveys.css') { response.setHeader('Content-Type', 'text/css'); response.end(await fs.readFile(path.join(app, 'app', url.pathname.slice(1)))); }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><div id="root"></div><script src="/main.js"></script></html>'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.SURVEY_BROWSER_CHANNEL || 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const failures = []; page.on('pageerror', (e) => failures.push(e.message));
  await page.route('**/*', (route) => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(`${url}?builder`);
  await page.getByPlaceholder('Ví dụ: Khảo sát trải nghiệm làm việc 2026').fill('Khảo sát trải nghiệm làm việc');
  await page.getByRole('button', { name: '+ Thêm câu hỏi', exact: true }).click();
  await page.getByPlaceholder('Bạn muốn hỏi điều gì?').fill('Câu hỏi trắc nghiệm');
  await page.getByLabel('Cho phép trả lời').selectOption('multiple');
  await page.getByLabel('Câu 1, đáp án 1', { exact: true }).fill('Đáp án một');
  await page.getByLabel('Câu 1, đáp án 2', { exact: true }).fill('Đáp án hai');
  const workbook = new (require('exceljs').Workbook)(); const sheet = workbook.addWorksheet('Synthetic');
  sheet.addRow(['Câu hỏi', 'Loại', 'Lựa chọn', 'Bắt buộc']); sheet.addRow(['Thông tin nhập từ Excel', 'short', '', 'Có']);
  const file = { name: 'synthetic.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole('cell', { name: 'Thông tin nhập từ Excel', exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'import-preview-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Thêm 1 câu hỏi', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('body').evaluate((body) => body.style.overflow), '');
  assert.equal(await page.getByPlaceholder('Bạn muốn hỏi điều gì?').count(), 2);
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click();
  assert.equal(await page.getByRole('cell', { name: 'Thông tin nhập từ Excel', exact: true }).count(), 0);
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng popup', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.screenshot({ path: path.join(output, 'builder-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'builder-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lưu khảo sát', exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.navigation === '/surveys/synthetic-saved');
  await page.goto(url);
  await page.getByLabel('Họ và tên').fill('Nhân viên thử nghiệm');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.invalid');
  await page.screenshot({ path: path.join(output, 'public-identity-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Bắt đầu khảo sát →' }).click();
  await page.getByRole('textbox', { name: 'Bạn đang làm việc tại phòng ban nào?' }).fill('Phòng hành chính');
  await page.getByLabel('Rất hài lòng', { exact: true }).check();
  await page.getByLabel('Hài lòng', { exact: true }).check();
  assert.equal(await page.getByLabel('Rất hài lòng', { exact: true }).isChecked(), false);
  await page.getByLabel('Không gian làm việc', { exact: true }).check();
  await page.getByLabel('Đào tạo', { exact: true }).check();
  assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 2);
  await page.getByRole('textbox', { name: 'Chia sẻ đề xuất của bạn' }).fill('Đề xuất có khoảng trắng\nvà xuống dòng.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'public-questions-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'public-questions-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Gửi khảo sát →' }).click();
  await page.getByRole('alert').filter({ hasText: 'Lỗi mạng synthetic' }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Chia sẻ đề xuất của bạn' }).inputValue(), 'Đề xuất có khoảng trắng\nvà xuống dòng.');
  await page.getByRole('button', { name: 'Gửi khảo sát →' }).click();
  await page.getByRole('heading', { name: 'Cảm ơn bạn đã chia sẻ!' }).waitFor();
  const submitted = JSON.parse(await page.locator('body').getAttribute('data-submitted'));
  assert.equal(submitted.identity.email, 'synthetic@example.invalid');
  assert.deepEqual(submitted.answers['cccccccc-cccc-4ccc-8ccc-cccccccccccc'], ['Không gian làm việc', 'Đào tạo']);
  assert.deepEqual(failures, []);
  console.log(`PASS: builder single/multiple selection, mobile overflow, public identity, radio exclusivity, checkbox multi-select, whitespace, failed-submit retry and success. Screenshots: ${output}`);
} finally { await browser?.close(); server.close(); }
