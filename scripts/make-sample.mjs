// Generates public/sample.pdf — a short original essay with a real text layer,
// so highlighting and notes can be tried without uploading anything.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const doc = await PDFDocument.create();
const roman = await doc.embedFont(StandardFonts.TimesRoman);
const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);

const W = 595.28;
const H = 841.89; // A4
const MARGIN = 76;
const INK = rgb(0.13, 0.11, 0.08);

let page;
let y;

function newPage() {
  page = doc.addPage([W, H]);
  y = H - MARGIN;
}

function wrap(text, font, size, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function para(text, { font = roman, size = 12.5, leading = 19, after = 11 } = {}) {
  for (const line of wrap(text, font, size, W - MARGIN * 2)) {
    if (y < MARGIN + leading) newPage();
    page.drawText(line, { x: MARGIN, y, size, font, color: INK });
    y -= leading;
  }
  y -= after;
}

newPage();
para('On Reading Well', { font: bold, size: 27, leading: 34, after: 2 });
para('Notes toward a practice of attentive reading', {
  font: italic,
  size: 13,
  leading: 18,
  after: 26,
});

para(
  'There is a difference between reading a text and merely moving your eyes across it. The first is a conversation; the second is a form of politeness. Most of what we call reading in daily life belongs to the second category, and there is nothing wrong with that — timetables, receipts and news briefs do not ask to be argued with. But some texts do ask. They put forward a claim about the world, and the honest response is not to nod along but to stop, push back, and write something down.',
);
para(
  'The oldest technology for this is the margin. Readers have always crowded the edges of their books with objections, summaries, exclamation marks and small drawings. These marks — marginalia — are not decoration. They are the visible trace of a mind at work, and rereading them years later is often more revealing than rereading the text itself.',
);
para(
  'A good annotation practice has two movements. The first is fast and physical: you underline, you star, you highlight. This costs almost nothing and marks the terrain. The second is slow and deliberate: you take one of the marked passages and ask what, exactly, it made you think. This second movement needs room — more room than a margin can give. It needs a blank page of its own, sitting right next to the passage that provoked it, so the eye can travel between the author’s words and your own.',
);
para(
  'That adjacency matters more than it seems. When notes live in a separate notebook, the connection between thought and source decays within weeks; you find a sentence in your own handwriting and can no longer say what it answers. When the note is anchored to the passage — when clicking the one summons the other — the pair survives together. The passage keeps the note honest, and the note keeps the passage alive.',
);
para(
  'None of this requires discipline so much as it requires furniture. A desk where the book can lie open; a page beside it that is always blank; a way of marking that costs one gesture, not five. If the tools are right, annotation stops feeling like homework and starts feeling like what it is: thinking, caught in the act.',
);
para(
  'What follows, then, is a modest proposal for the reader of digital documents. Treat the PDF not as a picture of a text but as a working surface. Mark it in colour. Disagree with it in writing. Let every strong passage carry your reply beside it. A document read this way is never finished — and that is the point.',
);

newPage();
para('A short exercise', { font: bold, size: 19, leading: 26, after: 14 });
para(
  'Pick any sentence on the first page that strikes you as either obviously true or obviously wrong. Select it. Give it a colour. Then open the notebook page beside it and answer three questions: What is the author actually claiming? What would have to be true for the claim to hold? And where, in your own experience, has it held or failed?',
);
para(
  'Write until the page pushes back. The first two sentences of any note are usually a summary; the thought you were after tends to arrive in the third. If you stop early, you keep the summary and lose the thought.',
);
para(
  'When you return to this document next month, do not reread the essay. Read your notes first. They are the record of what this text did to you — which is the only part of reading that was ever yours.',
);

writeFileSync('public/sample.pdf', await doc.save());
console.log('public/sample.pdf written');
