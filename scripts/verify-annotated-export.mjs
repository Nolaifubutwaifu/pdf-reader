// Exercises lib/export-annotated.ts (via Node's TS type-stripping) against
// public/sample.pdf with known markup, then asserts on the produced PDF:
// highlights/ink/text burned into page 1, appendix appended, numbering intact.
import { readFileSync, writeFileSync } from 'node:fs';
import { exportAnnotatedPdf } from '../lib/export-annotated.ts';

const sample = readFileSync('public/sample.pdf');

const annotations = [
  {
    id: 'a1',
    document_id: 'd',
    user_id: 'u',
    page: 1,
    rects: [{ x: 0.12, y: 0.065, w: 0.45, h: 0.05 }],
    color: '#f7e59b',
    quote: 'On Reading Well',
    note: 'Test note for the appendix.',
    comment: 'test margin comment',
    strokes: [],
    created_at: '',
    updated_at: '',
  },
];

const marks = {
  1: {
    strokes: [
      {
        tool: 'pen',
        color: '#2d5a8c',
        width: 0.0026,
        pts: [
          { x: 0.2, y: 0.3 },
          { x: 0.4, y: 0.34 },
          { x: 0.6, y: 0.31 },
        ],
      },
      {
        tool: 'marker',
        color: '#bfe6b4',
        width: 0.016,
        pts: [
          { x: 0.13, y: 0.45 },
          { x: 0.75, y: 0.45 },
        ],
      },
    ],
    texts: [
      {
        id: 't1',
        x: 0.15,
        y: 0.6,
        text: 'burned in by export test',
        color: '#a03b3b',
        size: 0.022,
      },
    ],
  },
};

const blob = new Blob([sample], { type: 'application/pdf' });
const out = await exportAnnotatedPdf({
  blob,
  docName: 'On Reading Well',
  annotations,
  marks,
});
const bytes = new Uint8Array(await out.arrayBuffer());
writeFileSync('public/check-annotated.pdf', bytes);

// — Assertions via pdf.js
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await getDocument({ data: bytes.slice() }).promise;
const pageText = async (n) => {
  const p = await doc.getPage(n);
  return (await p.getTextContent()).items.map((i) => i.str).join(' ');
};

const results = {
  pages: doc.numPages,
  expectedPages: 3, // 2 original + 1 appendix
  page1HasPlacedText: (await pageText(1)).includes('burned in by export test'),
  page1HasMarker: (await pageText(1)).includes('[1]'),
  appendix: await pageText(3),
};
const appendixOk =
  results.appendix.includes('Notes — On Reading Well') &&
  results.appendix.includes('[1]') &&
  results.appendix.includes('Test note for the appendix.') &&
  results.appendix.includes('test margin comment');

console.log(
  JSON.stringify(
    {
      pages: results.pages,
      pageCountOk: results.pages === results.expectedPages,
      page1HasPlacedText: results.page1HasPlacedText,
      page1HasMarginMarker: results.page1HasMarker,
      appendixOk,
    },
    null,
    2,
  ),
);
if (
  results.pages !== 3 ||
  !results.page1HasPlacedText ||
  !results.page1HasMarker ||
  !appendixOk
) {
  process.exit(1);
}
console.log('export verification passed');
