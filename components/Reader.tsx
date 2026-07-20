'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  createAnnotation,
  deleteAnnotation,
  getDocumentBlob,
  isIndexed,
  listAnnotations,
  listPageMarks,
  saveDocumentText,
  savePageMarks,
  setPageCount,
  updateAnnotation,
} from '@/lib/data';
import type { AnnotationRow, DocumentRow, NRect, PageMarks } from '@/lib/types';
import { cleanSelectionRects } from '@/lib/rects';
import { extractPdfText } from '@/lib/extract';
import MarkupLayer, { type MarkTool } from './MarkupLayer';
import NotebookPanel, { type NotebookLayout } from './NotebookPanel';
import NotesOverview from './NotesOverview';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const BASE_WIDTH = 720;
const COLORS = ['#f7e59b', '#bfe6b4', '#f6bcd0', '#b7d6f2'];
const INKS = ['#2d5a8c', '#b68235', '#a03b3b', '#2d2b2b'];
const EMPTY_MARKS: PageMarks = { strokes: [], texts: [] };

const TOOLS: { id: MarkTool; icon: string; label: string }[] = [
  { id: 'read', icon: '⌖', label: 'Read & select' },
  { id: 'pen', icon: '✎', label: 'Pen' },
  { id: 'marker', icon: '▨', label: 'Marker' },
  { id: 'text', icon: 'T', label: 'Text' },
  { id: 'erase', icon: '⌫', label: 'Erase' },
];

interface PendingSelection {
  page: number;
  rects: NRect[];
  quote: string;
  /** Viewport coords for the floating popover. */
  x: number;
  y: number;
}

export default function Reader({
  doc,
  initialNoteId,
  initialPage,
  onBack,
}: {
  doc: DocumentRow;
  initialNoteId?: string | null;
  initialPage?: number | null;
  onBack: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState('');
  const [annotations, setAnnotations] = useState<AnnotationRow[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [layout, setLayout] = useState<NotebookLayout>('twin');
  const [overview, setOverview] = useState(false);
  const [tool, setTool] = useState<MarkTool>('read');
  const [inkColor, setInkColor] = useState(INKS[0]);
  const [markerColor, setMarkerColor] = useState(COLORS[0]);
  const [marksByPage, setMarksByPage] = useState<Record<number, PageMarks>>({});
  const [markStatus, setMarkStatus] = useState('');
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const jumpedRef = useRef(false);
  const pageJumpedRef = useRef(false);
  const indexStartedRef = useRef(false);
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch the file (cache-first), its annotations, and its page markup.
  useEffect(() => {
    let alive = true;
    setBlob(null);
    getDocumentBlob(doc)
      .then((b) => alive && setBlob(b))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    listAnnotations(doc.id)
      .then((a) => alive && setAnnotations(a))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    listPageMarks(doc.id)
      .then((m) => alive && setMarksByPage(m))
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [doc]);

  // Make the document searchable: extract page text once, in the background.
  useEffect(() => {
    if (!blob || indexStartedRef.current) return;
    indexStartedRef.current = true;
    (async () => {
      try {
        if (await isIndexed(doc.id)) return;
        await saveDocumentText(doc.id, await extractPdfText(blob));
      } catch {
        // Search simply won't cover this document yet; retried on next open.
        indexStartedRef.current = false;
      }
    })();
  }, [blob, doc.id]);

  // Esc always drops back to reading.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTool('read');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Update one page's markup locally and persist it shortly after. */
  function updateMarks(page: number, next: PageMarks) {
    setMarksByPage((prev) => ({ ...prev, [page]: next }));
    setMarkStatus('Saving…');
    clearTimeout(saveTimersRef.current[page]);
    saveTimersRef.current[page] = setTimeout(async () => {
      try {
        await savePageMarks(doc.id, page, next);
        setMarkStatus('Saved ✓');
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        statusTimerRef.current = setTimeout(() => setMarkStatus(''), 1500);
      } catch (e) {
        setMarkStatus(e instanceof Error ? `Not saved — ${e.message}` : 'Not saved');
      }
    }, 600);
  }

  const byPage = new Map<number, AnnotationRow[]>();
  for (const a of annotations) {
    byPage.set(a.page, [...(byPage.get(a.page) ?? []), a]);
  }
  const openAnnotation = annotations.find((a) => a.id === openNoteId) ?? null;

  // Deep-link from the notes overview: open the notebook and scroll to its page.
  useEffect(() => {
    if (!initialNoteId || jumpedRef.current || numPages === 0) return;
    const a = annotations.find((x) => x.id === initialNoteId);
    if (!a) return;
    jumpedRef.current = true;
    setOpenNoteId(a.id);
    const t = setTimeout(
      () => pageRefs.current[a.page]?.scrollIntoView({ block: 'start' }),
      450,
    );
    return () => clearTimeout(t);
  }, [initialNoteId, numPages, annotations]);

  // Deep-link from search: scroll straight to the matched page.
  useEffect(() => {
    if (!initialPage || pageJumpedRef.current || numPages === 0) return;
    pageJumpedRef.current = true;
    const t = setTimeout(
      () => pageRefs.current[initialPage]?.scrollIntoView({ block: 'start' }),
      450,
    );
    return () => clearTimeout(t);
  }, [initialPage, numPages]);

  /** Locally mirror a server-side change so the UI stays responsive. */
  const patchLocal = useCallback((id: string, patch: Partial<AnnotationRow>) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  /** Capture the finished text selection and offer highlight/comment/notebook. */
  function handleMouseUp() {
    if (tool !== 'read') return; // markup tools own the pointer
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

  async function commit(color: string, opts: { openNotebook?: boolean; comment?: string } = {}) {
    if (!pending) return;
    const snapshot = pending;
    window.getSelection()?.removeAllRanges();
    setPending(null);
    try {
      const row = await createAnnotation({
        documentId: doc.id,
        page: snapshot.page,
        rects: snapshot.rects,
        color,
        quote: snapshot.quote,
        comment: opts.comment ?? '',
      });
      setAnnotations((prev) => [...prev, row]);
      if (opts.openNotebook) setOpenNoteId(row.id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }

  function commitComment() {
    const text = window.prompt('Margin comment:', '');
    if (text === null || !text.trim()) return;
    void commit(COLORS[0], { comment: text.trim() });
  }

  async function removeAnnotation(id: string) {
    if (!confirm('Remove this highlight and its notebook page?')) return;
    await deleteAnnotation(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setOpenNoteId(null);
  }

  async function saveAnnotation(id: string, patch: Partial<AnnotationRow>) {
    patchLocal(id, patch);
    await updateAnnotation(id, patch);
  }

  function jumpTo(a: AnnotationRow) {
    setOpenNoteId(a.id);
    pageRefs.current[a.page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const notebook = openAnnotation && (
    <NotebookPanel
      key={openAnnotation.id}
      annotation={openAnnotation}
      layout={layout}
      setLayout={setLayout}
      onSave={saveAnnotation}
      onDelete={removeAnnotation}
      onClose={() => setOpenNoteId(null)}
      slide={layout === 'slideover'}
    />
  );

  return (
    <div className="reader">
      <header className="rd-bar">
        <button className="rd-back" onClick={onBack}>
          ‹ Library
        </button>
        <div className="rd-sep" />
        <div className="rd-doc">
          <div className="rd-doc-t">{doc.name}</div>
          <div className="rd-doc-s">
            {numPages ? `${numPages} page${numPages === 1 ? '' : 's'} · ` : ''}added{' '}
            {new Date(doc.added_at).toLocaleDateString()}
          </div>
        </div>
        <div className="rd-right">
          <div className="zoom">
            <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}>
              −
            </button>
            <span className="pct">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.15).toFixed(2)))}>
              ＋
            </button>
          </div>
          <div className="rd-sep" />
          <button className="notes-btn" onClick={() => setOverview(true)}>
            Notes ({annotations.length})
          </button>
        </div>
      </header>

      <div className="mark-bar">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`mode-btn${tool === t.id ? ' on' : ''}`}
            title={t.label}
            onClick={() => setTool(t.id)}
          >
            {t.icon} {t.id === 'read' ? 'Read' : t.label.split(' ')[0]}
          </button>
        ))}
        {(tool === 'pen' || tool === 'text') && (
          <div className="pen-tools">
            {INKS.map((c) => (
              <button
                key={c}
                className={`pen-sw${inkColor === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setInkColor(c)}
              />
            ))}
          </div>
        )}
        {tool === 'marker' && (
          <div className="pen-tools">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`pen-sw${markerColor === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setMarkerColor(c)}
              />
            ))}
          </div>
        )}
        <span className="mark-hint">
          {tool === 'read'
            ? 'Select text to highlight it — or pick a tool and write straight onto the page.'
            : tool === 'text'
              ? 'Click the page to place text; drag to move it. Esc to finish.'
              : tool === 'erase'
                ? 'Click or drag over ink to remove it.'
                : 'Draw straight onto the page — saved automatically. Esc to finish.'}
        </span>
        <span className="mark-status">{markStatus}</span>
      </div>

      {loadError && (
        <div className="err-bar">
          {loadError}
          <button onClick={() => setLoadError('')}>✕</button>
        </div>
      )}

      <div className="stage">
        <main
          className={`pdf-pane paper-scroll${
            openAnnotation && layout === 'twin' ? ' twin' : ''
          }${tool !== 'read' ? ' marking' : ''}`}
          onMouseUp={handleMouseUp}
          onScroll={() => setPending(null)}
        >
          {!blob && !loadError && <div className="doc-loading">Fetching the document…</div>}
          {blob && (
            <Document
              file={blob}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                if (doc.page_count !== numPages) void setPageCount(doc.id, numPages);
              }}
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
                  <MarkupLayer
                    marks={marksByPage[n] ?? EMPTY_MARKS}
                    tool={tool}
                    inkColor={inkColor}
                    markerColor={markerColor}
                    onChange={(next) => updateMarks(n, next)}
                  />
                  <span className="folio">— {n} —</span>
                </div>
              ))}
            </Document>
          )}
        </main>

        {openAnnotation && layout !== 'slideover' && (
          <div className={layout === 'twin' ? 'nb-pane-twin' : 'nb-pane-dock'}>{notebook}</div>
        )}
        {openAnnotation && layout === 'slideover' && (
          <div className="nb-overlay">
            <div className="nb-scrim" onClick={() => setOpenNoteId(null)} />
            {notebook}
          </div>
        )}
      </div>

      {pending && (
        <div className="pop" style={{ left: pending.x, top: pending.y }}>
          {COLORS.map((c) => (
            <button
              key={c}
              className="pop-sw"
              style={{ background: c }}
              title="Highlight"
              onClick={() => void commit(c)}
            />
          ))}
          <span className="pop-div" />
          <button className="pop-ic" title="Margin comment" onClick={commitComment}>
            💬
          </button>
          <button
            className="pop-nb"
            onClick={() => void commit(COLORS[0], { openNotebook: true })}
          >
            Notebook page ›
          </button>
        </div>
      )}

      {overview && (
        <NotesOverview
          scopeDocumentId={doc.id}
          title={doc.name}
          onClose={() => setOverview(false)}
          onJump={(a) => {
            setOverview(false);
            const local = annotations.find((x) => x.id === a.id);
            if (local) jumpTo(local);
          }}
        />
      )}
    </div>
  );
}

function HighlightLayer({
  anns,
  activeId,
  onPick,
}: {
  anns: AnnotationRow[];
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
            title={a.note.trim() ? a.note : 'Open notebook page'}
            onClick={(e) => {
              e.stopPropagation();
              onPick(a.id);
            }}
          />
        )),
      )}
      {anns
        .filter((a) => a.note.trim() || a.strokes.length > 0)
        .map((a) => {
          const last = a.rects[a.rects.length - 1];
          if (!last) return null;
          return (
            <button
              key={`dot-${a.id}`}
              className="hl-dot"
              style={{ left: `${(last.x + last.w) * 100}%`, top: `${last.y * 100}%` }}
              title="This passage has a notebook page"
              onClick={() => onPick(a.id)}
            >
              ✎
            </button>
          );
        })}
      {anns
        .filter((a) => a.comment.trim())
        .map((a) => {
          const first = a.rects[0];
          if (!first) return null;
          return (
            <button
              key={`cmt-${a.id}`}
              className="cmt-dot"
              style={{ left: 'calc(100% + 10px)', top: `${first.y * 100}%` }}
              title={a.comment}
              onClick={() => onPick(a.id)}
            >
              💬
            </button>
          );
        })}
    </div>
  );
}
