// Generates a 300-page PDF with a real outline (table of contents) for
// stress-testing virtualized rendering and navigation. Output is written to
// public/ for local testing only — do not commit the PDF.
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const PAGES = 300;
const CHAPTER_EVERY = 50;
const W = 595.28;
const H = 841.89;
const INK = rgb(0.13, 0.11, 0.08);

const doc = await PDFDocument.create();
const roman = await doc.embedFont(StandardFonts.TimesRoman);
const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

for (let i = 1; i <= PAGES; i++) {
  const page = doc.addPage([W, H]);
  const chapter = Math.floor((i - 1) / CHAPTER_EVERY) + 1;
  if ((i - 1) % CHAPTER_EVERY === 0) {
    page.drawText(`Chapter ${chapter}`, { x: 76, y: H - 120, size: 30, font: bold, color: INK });
  }
  page.drawText(`Page ${i}`, { x: 76, y: H - 180, size: 16, font: bold, color: INK });
  page.drawText(
    `This is page ${i} of the stress test volume, chapter ${chapter}. ` +
      'It exists to make the reader carry three hundred pages without flinching.',
    { x: 76, y: H - 220, size: 11.5, font: roman, color: INK, maxWidth: W - 152, lineHeight: 17 },
  );
  page.drawText(`— ${i} —`, { x: W / 2 - 18, y: 48, size: 10, font: roman, color: INK });
}

// A real /Outlines tree so the Contents panel has something to read.
function addOutline(pdf, entries) {
  const ctx = pdf.context;
  const pageRefs = pdf.getPages().map((p) => p.ref);
  const rootRef = ctx.nextRef();
  const refs = entries.map(() => ctx.nextRef());
  entries.forEach((e, i) => {
    const dict = ctx.obj({
      Title: PDFHexString.fromText(e.title),
      Parent: rootRef,
      Dest: [pageRefs[e.pageIndex], PDFName.of('XYZ'), null, null, null],
    });
    if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
    if (i < entries.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
    ctx.assign(refs[i], dict);
  });
  ctx.assign(
    rootRef,
    ctx.obj({
      Type: PDFName.of('Outlines'),
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: PDFNumber.of(entries.length),
    }),
  );
  pdf.catalog.set(PDFName.of('Outlines'), rootRef);
}

addOutline(
  doc,
  Array.from({ length: PAGES / CHAPTER_EVERY }, (_, k) => ({
    title: `Chapter ${k + 1}`,
    pageIndex: k * CHAPTER_EVERY,
  })),
);

writeFileSync('public/test-book.pdf', await doc.save());
console.log(`public/test-book.pdf written (${PAGES} pages)`);
