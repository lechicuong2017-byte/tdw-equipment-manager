// Build step: copy pinned OCR runtime into the app. No document or network access.
import { mkdir, copyFile, readdir } from 'node:fs/promises';
const app = new URL('../',import.meta.url);
const dest = new URL('public/ocr/',app);
await mkdir(dest,{recursive:true});
await copyFile(new URL('node_modules/tesseract.js/dist/worker.min.js',app),new URL('worker.min.js',dest));
await copyFile(new URL('node_modules/tesseract.js/LICENSE.md',app),new URL('tesseract-js-LICENSE.md',dest));
await copyFile(new URL('node_modules/tesseract.js-core/LICENSE',app),new URL('tesseract-core-LICENSE',dest));
for (const name of await readdir(new URL('node_modules/tesseract.js-core/',app))) {
  if (/\.wasm(?:\.js)?$/.test(name)) await copyFile(new URL(`node_modules/tesseract.js-core/${name}`,app),new URL(name,dest));
}
console.log('OCR runtime prepared locally.');
