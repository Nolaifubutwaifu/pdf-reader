'use client';

import { useEffect, useRef, useState } from 'react';
import { Page } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const THUMB_W = 92;

export interface OutlineEntry {
  title: string;
  page: number | null;
  depth: number;
}

/** Flatten the PDF's own table of contents, resolving each entry to a page. */
export async function readOutline(pdf: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const raw = await pdf.getOutline().catch(() => null);
  if (!raw || raw.length === 0) return [];
  const flat: OutlineEntry[] = [];
  async function walk(items: NonNullable<typeof raw>, depth: number) {
    for (const it of items) {
      let page: number | null = null;
      try {
        let dest: unknown = it.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0]) {
          page = (await pdf.getPageIndex(dest[0])) + 1;
        }
      } catch {
        // Entries without a resolvable target are still listed, just not clickable.
      }
      flat.push({ title: it.title, page, depth });
      if (it.items?.length) await walk(it.items, depth + 1);
    }
  }
  await walk(raw, 0);
  return flat;
}

/**
 * Lazy thumbnail rail: every page gets a correctly-sized slot, but the actual
 * miniature only renders while it's near the rail's viewport.
 */
export function ThumbRail({
  numPages,
  ratios,
  defaultRatio,
  currentPage,
  onJump,
}: {
  numPages: number;
  ratios: Record<number, number>;
  defaultRatio: number;
  currentPage: number;
  onJump: (page: number) => void;
}) {
  const railRef = useRef<HTMLElement>(null);
  const [vis, setVis] = useState<Set<number>>(() => new Set([1, 2, 3, 4, 5, 6]));

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const io = new IntersectionObserver(
      (entries) => {
        setVis((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.thumb);
            if (e.isIntersecting) {
              if (!next.has(n)) {
                next.add(n);
                changed = true;
              }
            } else if (next.has(n)) {
              next.delete(n);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      { root: rail, rootMargin: '500px 0px' },
    );
    rail.querySelectorAll('[data-thumb]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [numPages]);

  return (
    <aside className="thumb-rail paper-scroll" ref={railRef}>
      {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
        const h = Math.round(THUMB_W * (ratios[n] ?? defaultRatio));
        return (
          <button
            key={n}
            data-thumb={n}
            className={`thumb${n === currentPage ? ' active' : ''}`}
            onClick={() => onJump(n)}
          >
            <span className="thumb-page" style={{ width: THUMB_W, height: h }}>
              {vis.has(n) && (
                <Page
                  pageNumber={n}
                  width={THUMB_W}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                />
              )}
            </span>
            <span className="thumb-num">{n}</span>
          </button>
        );
      })}
    </aside>
  );
}

/** "p. 12 / 400" — click it to type a page number and jump. */
export function PageJump({
  current,
  total,
  onJump,
}: {
  current: number;
  total: number;
  onJump: (page: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  if (!editing) {
    return (
      <button
        className="page-ind"
        title="Jump to page"
        onClick={() => {
          setVal(String(current));
          setEditing(true);
        }}
      >
        p. {current} / {total}
      </button>
    );
  }
  return (
    <input
      className="page-ind-input"
      autoFocus
      inputMode="numeric"
      value={val}
      onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))}
      onFocus={(e) => e.target.select()}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          const n = parseInt(val, 10);
          if (n >= 1 && n <= total) onJump(n);
          setEditing(false);
        }
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

/** Dropdown listing the document's own chapters. */
export function OutlinePanel({
  outline,
  onJump,
  onClose,
}: {
  outline: OutlineEntry[];
  onJump: (page: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  return (
    <div className="outline-pop paper-scroll" ref={ref}>
      {outline.map((e, i) => (
        <button
          key={i}
          className="outline-item"
          style={{ paddingLeft: 14 + e.depth * 16 }}
          disabled={e.page == null}
          onClick={() => e.page != null && onJump(e.page)}
        >
          <span className="outline-title">{e.title}</span>
          {e.page != null && <span className="outline-pg">p. {e.page}</span>}
        </button>
      ))}
    </div>
  );
}
