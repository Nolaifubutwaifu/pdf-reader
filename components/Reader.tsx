'use client';

import { useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Annotation, type NRect, type PdfDoc } from '@/lib/db';
import { cleanSelectionRects } from '@/lib/rects';
import NotebookPanel from './NotebookPanel';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const BASE_WIDTH = 720;
const COLORS = ['#f6d44d', '#a9d16c', '#f2a9c0'];

interface PendingSelection {
  page: number;
  rects: NRect[];
  quote: string;
  /** Viewport coords for the floating toolbar. */
  x: number;
  y: number;
}

export default function Reader({ pdf, onBack }: { pdf: PdfDoc; onBack: () => void }) {
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const file = useMemo(() => pdf.data, [pdf.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const annotations =
    useLiveQuery(
      () => db.annotations.where('pdfId').equals(pdf.id).toArray(),
      [pdf.id],
    ) ?? [];

  const sorted = [...annotations].sort(
    (a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0),
  );
  const byPage = new Map<number, Annotation[]>();
  for (const a of annotations) {
    byPage.set(a.page, [...(byPage.get(a.page) ?? []), a]);
  }
  const openAnnotation = annotations.find((a) => a.id === openNoteId) ?? null;

  /** Capture the finished text selection and offer highlight/note actions. */
  function handleMouseUp() {
    // Let the browser finalize the selection first.
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
      const pageEl = el?.closest<HTMLElement>('[data-page-wrap]');
      if (!pageEl) {
        setPending(null);
        return;
      }
      const pageRect = pageEl.getBoundingClientRect();
      const merged = cleanSelectionRects(Array.from(range.getClientRects()));
      if (merged.length === 0) {
        setPending(null);
        return;
      }
      const left = Math.min(...merged.map((r) => r.left));
      const right = Math.max(...merged.map((r) => r.right));
      const top = Math.min(...merged.map((r) => r.top));
      setPending({
        page: Number(pageEl.dataset.pageWrap),
        quote: sel.toString().replace(/\s+/g, ' ').trim(),
        rects: merged.map((r) => ({
          x: (r.left - pageRect.left) / pageRect.width,
          y: (r.top - pageRect.top) / pageRect.height,
          w: r.width / pageRect.width,
          h: r.height / pageRect.height,
        })),
        x: (left + right) / 2,
        y: top,
      });
    }, 10);
  }

  async function commit(color: string, openNotebook: boolean) {
    if (!pending) return;
    const id = crypto.randomUUID();
    await db.annotations.add({
      id,
      pdfId: pdf.id,
      page: pending.page,
      rects: pending.rects,
      color,
      quote: pending.quote,
      note: '',
      createdAt: Date.now(),
    });
    window.getSelection()?.removeAllRanges();
    setPending(null);
    if (openNotebook) setOpenNoteId(id);
  }

  function jumpTo(a: Annotation) {
    setOpenNoteId(a.id);
    pageRefs.current[a.page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="reader">
      <header className="reader-bar">
        <button className="back-btn" onClick={onBack}>
          ← Desk
        </button>
        <span className="mark">
          Marginalia<span className="tail">.</span>
        </span>
        <span className="doc-title">{pdf.name}</span>
        <div className="zoom">
          <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}>−</button>
          <span className="pct">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))}>＋</button>
        </div>
      </header>

      <div className="reader-body">
        <aside className="side">
          <div className="side-head">
            <span>Highlights</span>
            <span>{annotations.length}</span>
          </div>
          {sorted.length === 0 && (
            <p className="side-empty">
              Select a passage in the document, pick a colour — or open a notebook page
              right beside it.
            </p>
          )}
          {sorted.map((a) => (
            <button
              key={a.id}
              className={`side-item${a.id === openNoteId ? ' active' : ''}`}
              onClick={() => jumpTo(a)}
            >
              <span className="q" style={{ ['--mark-color' as string]: a.color }}>
                <mark>{a.quote}</mark>
              </span>
              <span className="m">
                p. {a.page}
                {a.note.trim() && <span className="noted"> · ✎ note</span>}
              </span>
            </button>
          ))}
        </aside>

        <main className="pages" onMouseUp={handleMouseUp} onScroll={() => setPending(null)}>
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={<div className="doc-loading">Opening document…</div>}
            error={<div className="doc-loading">This file could not be read as a PDF.</div>}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                data-page-wrap={n}
                className="page-wrap"
                ref={(el) => {
                  pageRefs.current[n] = el;
                }}
              >
                <Page
                  pageNumber={n}
                  width={BASE_WIDTH * zoom}
                  renderAnnotationLayer={false}
                  renderTextLayer
                />
                <HighlightLayer
                  anns={byPage.get(n) ?? []}
                  activeId={openNoteId}
                  onPick={setOpenNoteId}
                />
                <span className="folio">— {n} —</span>
              </div>
            ))}
          </Document>
        </main>

        {openAnnotation && (
          <NotebookPanel
            key={openAnnotation.id}
            annotation={openAnnotation}
            onClose={() => setOpenNoteId(null)}
          />
        )}
      </div>

      {pending && (
        <div className="seltool" style={{ left: pending.x, top: pending.y }}>
          {COLORS.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              title="Highlight"
              onClick={() => commit(c, false)}
            />
          ))}
          <span className="seltool-div" />
          <button className="seltool-note" onClick={() => commit(COLORS[0], true)}>
            ✎ Open notebook
          </button>
        </div>
      )}
    </div>
  );
}

function HighlightLayer({
  anns,
  activeId,
  onPick,
}: {
  anns: Annotation[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="hl-layer">
      {anns.map((a) =>
        a.rects.map((r, i) => (
          <div
            key={`${a.id}-${i}`}
            className={`hl${a.id === activeId ? ' hl-active' : ''}`}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              backgroundColor: a.color,
            }}
            title={a.note.trim() ? a.note : 'Open notebook'}
            onClick={(e) => {
              e.stopPropagation();
              onPick(a.id);
            }}
          />
        )),
      )}
      {anns
        .filter((a) => a.note.trim())
        .map((a) => {
          const last = a.rects[a.rects.length - 1];
          if (!last) return null;
          return (
            <button
              key={`dot-${a.id}`}
              className="hl-dot"
              style={{ left: `${(last.x + last.w) * 100}%`, top: `${last.y * 100}%` }}
              title="This passage has a note"
              onClick={() => onPick(a.id)}
            >
              ✎
            </button>
          );
        })}
    </div>
  );
}
