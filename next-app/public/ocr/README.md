# Local Vietnamese OCR assets

`vie.traineddata` is from the official Tesseract `tessdata_fast` release 4.1.0:
https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0

License: Apache-2.0 (see LICENSE). SHA-256:
`79df64caf7bcfb2a27df5042ecb6121e196eada34da774956995747636d5bfa1`.

The build copies the pinned tesseract.js worker and tesseract.js-core WASM files
from node_modules with `next-app/scripts/prepare-it-ocr-assets.mjs`. These generated runtime
files are ignored by Git. Browser worker/core/language paths explicitly point to
`/ocr`; the reader has no external OCR API integration. Runtime request evidence
is recorded by the synthetic browser test, not inferred from this configuration.
