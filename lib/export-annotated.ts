import {
  BlendMode,
  LineCapStyle,
  PDFDocument,
  PDFFont,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import type { AnnotationRow, PageMarks } from './types';

const GOLD = rgb(0.88, 0.48, 0.24);
const INK = rgb(0.13, 0.12, 0.11);

function hexColor(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return INK;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Standard fonts only cover WinAnsi; swap anything else for a placeholder. */
function sanitize(font: PDFFont, text: string) {
  return Array.from(text)
    .map((ch) => {
      if (ch === '\n') return ch;
      try {
        font.widthOfTextAtSize(ch, 10);
        return ch;
      } catch {
        return '·';
      }
    })
    .join('');
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const probe = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Burn everything the reader shows — text highlights, pen and marker ink,
 * placed text — into a copy of the original PDF, and append the notebook
 * (notes + margin comments) as a numbered appendix. The result is a plain
 * PDF that opens anywhere.
 *
 * Limitation: coordinates assume unrotated pages (by far the common case);
 * on pages with a /Rotate entry the markup may land misplaced.
 */
export async function exportAnnotatedPdf({
  blob,
  docName,
  annotations,
  marks,
}: {
  blob: Blob;
  docName: string;
  annotations: AnnotationRow[];
  marks: Record<number, PageMarks>;
}): Promise<Blob> {
  const src = await PDFDocument.load(await blob.arrayBuffer(), {
    ignoreEncryption: true,
  });
  const pages = src.getPages();
  const serif = await src.embedFont(StandardFonts.TimesRoman);
  const serifBold = await src.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await src.embedFont(StandardFonts.TimesRomanItalic);

  // Annotations that carry writing get a [n] marker and an appendix entry.
  const sorted = [...annotations].sort(
    (a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0),
  );
  const noted = sorted.filter(
    (a) => a.note.trim() || a.comment.trim() || a.strokes.length,
  );
  const refNo = new Map(noted.map((a, i) => [a.id, i + 1]));

  // — Text highlights (and their margin markers)
  for (const a of sorted) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();
    const color = hexColor(a.color);
    for (const r of a.rects) {
      page.drawRectangle({
        x: r.x * W,
        y: H * (1 - r.y - r.h),
        width: r.w * W,
        height: r.h * H,
        color,
        opacity: 0.45,
        blendMode: BlendMode.Multiply,
      });
    }
    const n = refNo.get(a.id);
    const first = a.rects[0];
    if (n && first) {
      page.drawText(`[${n}]`, {
        x: W - 28,
        y: H * (1 - first.y) - 8,
        size: 8.5,
        font: serifBold,
        color: GOLD,
      });
    }
  }

  // — Direct page markup: ink strokes and placed text
  for (const [pageNo, pm] of Object.entries(marks)) {
    const page = pages[Number(pageNo) - 1];
    if (!page) continue;
    const { width: W, height: H } = page.getSize();

    for (const s of pm.strokes) {
      const col = hexColor(s.color);
      const thickness = Math.max(0.5, s.width * W);
      const alpha = s.tool === 'marker' ? 0.45 : 1;
      if (s.pts.length === 0) continue;
      if (s.pts.length === 1) {
        page.drawCircle({
          x: s.pts[0].x * W,
          y: H * (1 - s.pts[0].y),
          size: thickness / 2,
          color: col,
          opacity: alpha,
          blendMode: BlendMode.Multiply,
        });
        continue;
      }
      const d =
        'M ' +
        s.pts.map((p) => `${(p.x * W).toFixed(2)} ${(p.y * H).toFixed(2)}`).join(' L ');
      page.drawSvgPath(d, {
        x: 0,
        y: H, // svg paths are y-down; anchor them at the top-left corner
        borderColor: col,
        borderWidth: thickness,
        borderOpacity: alpha,
        borderLineCap: LineCapStyle.Round,
        blendMode: BlendMode.Multiply,
      });
    }

    for (const t of pm.texts) {
      if (!t.text.trim()) continue;
      const size = Math.max(6, t.size * W);
      const color = hexColor(t.color);
      const maxW = Math.max(60, Math.min(0.58 * W, W - t.x * W - 20));
      let y = H * (1 - t.y) - size;
      for (const para of sanitize(serif, t.text).split('\n')) {
        for (const line of wrap(serif, para, size, maxW)) {
          page.drawText(line, { x: t.x * W, y, size, font: serif, color });
          y -= size * 1.3;
        }
      }
    }
  }

  // — Appendix: the notebook, numbered to match the margin markers
  if (noted.length) {
    const W = 595.28;
    const H = 841.89;
    const M = 64;
    let page = src.addPage([W, H]);
    let y = H - M;
    const ensure = (need: number) => {
      if (y < M + need) {
        page = src.addPage([W, H]);
        y = H - M;
      }
    };
    const para = (
      text: string,
      font: PDFFont,
      size: number,
      leading: number,
      color = INK,
      indent = 0,
    ) => {
      for (const seg of sanitize(font, text).split('\n')) {
        for (const line of wrap(font, seg, size, W - M * 2 - indent)) {
          ensure(leading);
          page.drawText(line, { x: M + indent, y, size, font, color });
          y -= leading;
        }
      }
    };

    para(`Notes — ${docName}`, serifBold, 20, 28);
    para('Exported from Marginalia. Numbers match the [n] markers in the margins.',
      serifItalic, 10, 16, GOLD);
    y -= 10;
    for (const a of noted) {
      ensure(64);
      y -= 6;
      para(`[${refNo.get(a.id)}]  p. ${a.page}`, serifBold, 11, 16, GOLD);
      if (a.quote.trim()) {
        para(
          `“${a.quote.length > 220 ? `${a.quote.slice(0, 220)}…` : a.quote}”`,
          serifItalic, 10.5, 15, INK, 12,
        );
      }
      if (a.comment.trim()) para(`Margin note: ${a.comment}`, serifItalic, 10.5, 15, INK, 12);
      if (a.note.trim()) {
        y -= 2;
        para(a.note, serif, 11, 16, INK, 12);
      }
      if (a.strokes.length) {
        para('(this entry has a hand sketch on its notebook page)', serifItalic, 9.5, 14, GOLD, 12);
      }
      y -= 6;
    }
  }

  return new Blob([new Uint8Array(await src.save())], { type: 'application/pdf' });
}
