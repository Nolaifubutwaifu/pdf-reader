'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Annotation } from '@/lib/db';

/**
 * Slide-over drawer listing every notebook entry — scoped to one document in
 * the reader, or across the whole desk from the library. Exports to
 * Markdown or a formatted PDF.
 */
export default function NotesOverview({
  scopePdfId,
  title,
  onClose,
  onJump,
}: {
  scopePdfId?: string;
  title: string;
  onClose: () => void;
  onJump: (a: Annotation) => void;
}) {
  const anns =
    useLiveQuery(
      () =>
        scopePdfId
          ? db.annotations.where('pdfId').equals(scopePdfId).toArray()
          : db.annotations.toArray(),
      [scopePdfId],
    ) ?? [];
  const pdfs = useLiveQuery(() => db.pdfs.toArray(), []) ?? [];

  const nameOf = (id: string) => pdfs.find((p) => p.id === id)?.name ?? 'Untitled';
  const sorted = [...anns].sort(
    (a, b) =>
      nameOf(a.pdfId).localeCompare(nameOf(b.pdfId)) ||
      a.page - b.page ||
      (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0),
  );

  function buildMd() {
    let md = '# Marginalia — Notebook Export\n\n';
    let currentDoc = '';
    for (const a of sorted) {
      const doc = nameOf(a.pdfId);
      if (doc !== currentDoc) {
        md += `## ${doc}\n\n`;
        currentDoc = doc;
      }
      md += `> ${a.quote}\n>\n> — p. ${a.page}\n\n`;
      if (a.note.trim()) md += `${a.note.trim()}\n\n`;
      if (a.comment.trim()) md += `**Margin note:** ${a.comment.trim()}\n\n`;
      if (a.strokes.length) md += `*(includes a hand sketch)*\n\n`;
      md += '---\n\n';
    }
    return md;
  }

  function download(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportMd() {
    download(
      'marginalia-notebook.md',
      new Blob([buildMd()], { type: 'text/markdown' }),
    );
  }

  async function exportPdf() {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const roman = await doc.embedFont(StandardFonts.TimesRoman);
    const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
    const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const W = 595.28;
    const H = 841.89;
    const M = 70;
    const INK = rgb(0.13, 0.12, 0.11);
    const GOLD = rgb(0.71, 0.51, 0.21);

    let page = doc.addPage([W, H]);
    let y = H - M;
    const ensure = (need: number) => {
      if (y < M + need) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
    };
    const wrap = (text: string, font: typeof roman, size: number) => {
      const out: string[] = [];
      let line = '';
      for (const word of text.split(/\s+/)) {
        const probe = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(probe, size) > W - M * 2 - 16 && line) {
          out.push(line);
          line = word;
        } else {
          line = probe;
        }
      }
      if (line) out.push(line);
      return out;
    };
    const para = (
      text: string,
      font: typeof roman,
      size: number,
      leading: number,
      color = INK,
      indent = 0,
    ) => {
      for (const line of wrap(text, font, size)) {
        ensure(leading);
        page.drawText(line, { x: M + indent, y, size, font, color });
        y -= leading;
      }
    };

    para('Marginalia — Notebook', bold, 22, 30);
    y -= 10;
    let currentDoc = '';
    for (const a of sorted) {
      const docName = nameOf(a.pdfId);
      if (docName !== currentDoc) {
        y -= 8;
        ensure(40);
        para(docName, bold, 15, 22, GOLD);
        currentDoc = docName;
      }
      y -= 4;
      para(`“${a.quote}”  — p. ${a.page}`, italic, 11.5, 17, INK, 14);
      if (a.note.trim()) {
        y -= 2;
        para(a.note.trim(), roman, 11.5, 17);
      }
      if (a.comment.trim()) para(`Margin note: ${a.comment.trim()}`, italic, 10.5, 15);
      if (a.strokes.length) para('(includes a hand sketch)', italic, 10, 15, GOLD);
      y -= 10;
    }
    download(
      'marginalia-notebook.pdf',
      new Blob([new Uint8Array(await doc.save())], { type: 'application/pdf' }),
    );
  }

  return (
    <div className="ov-root" onClick={onClose}>
      <div className="ov-panel paper-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="ov-head">
          <div className="ov-head-row">
            <div>
              <div className="ov-kicker">Notebook</div>
              <h2 className="ov-title">{title}</h2>
            </div>
            <button className="ov-x" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="ov-actions">
            <button className="cbtn gold" onClick={exportMd} disabled={!sorted.length}>
              ↧ Export Markdown
            </button>
            <button className="cbtn" onClick={exportPdf} disabled={!sorted.length}>
              ↧ Export PDF
            </button>
          </div>
        </div>
        <div className="ov-body">
          {sorted.length === 0 && (
            <div className="ov-empty">
              No notes yet. Highlight a passage and open a notebook page to begin.
            </div>
          )}
          {sorted.map((a) => (
            <button key={a.id} className="ov-card" onClick={() => onJump(a)}>
              <span className="ov-meta">
                <span className="ov-chip" style={{ background: a.color }} />
                <span className="ov-doc">{nameOf(a.pdfId)}</span>
                <span>· p. {a.page}</span>
                {a.strokes.length > 0 && <span className="ov-sketch">✐ sketch</span>}
              </span>
              <div className="ov-quote" style={{ ['--qc' as string]: a.color }}>
                “{a.quote.length > 160 ? `${a.quote.slice(0, 160)}…` : a.quote}”
              </div>
              <div className={`ov-note${a.note.trim() ? '' : ' faint'}`}>
                {a.note.trim() || '(No written note yet — click to open)'}
              </div>
              {a.comment.trim() && <div className="ov-cmt">💬 {a.comment}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
