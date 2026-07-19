'use client';

import { useEffect, useRef, useState } from 'react';
import type { AnnotationRow, Stroke } from '@/lib/types';

export type NotebookLayout = 'twin' | 'docked' | 'slideover';

const PENS = ['#2d5a8c', '#b68235', '#a03b3b', '#2d2b2b'];

const LAYOUTS: { id: NotebookLayout; icon: string; label: string }[] = [
  { id: 'twin', icon: '▮▮', label: 'Twin pages' },
  { id: 'docked', icon: '▮▯', label: 'Docked panel' },
  { id: 'slideover', icon: '▤', label: 'Slide-over' },
];

/**
 * A blank notebook page beside the document, bound to one highlighted
 * passage. Type or draw; saves to your account as you go.
 */
export default function NotebookPanel({
  annotation,
  layout,
  setLayout,
  onSave,
  onDelete,
  onClose,
  slide,
}: {
  annotation: AnnotationRow;
  layout: NotebookLayout;
  setLayout: (l: NotebookLayout) => void;
  onSave: (id: string, patch: Partial<AnnotationRow>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  slide?: boolean;
}) {
  const [text, setText] = useState(annotation.note);
  const [status, setStatus] = useState('Saved to your account');
  const [penActive, setPenActive] = useState(false);
  const [penColor, setPenColor] = useState(PENS[0]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const writeRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>(annotation.strokes ?? []);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  function flashSaved() {
    setStatus('Saved ✓');
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setStatus('Saved to your account'), 1400);
  }

  // Debounced note autosave.
  useEffect(() => {
    if (text === annotation.note) return;
    setStatus('writing…');
    const t = setTimeout(async () => {
      try {
        await onSave(annotation.id, { note: text });
        flashSaved();
      } catch (e) {
        setStatus(e instanceof Error ? `Not saved — ${e.message}` : 'Not saved');
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, annotation.id]);

  // Canvas sizing + redraw of persisted strokes (normalized coords).
  useEffect(() => {
    const el = writeRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) {
        cv.width = Math.round(r.width);
        cv.height = Math.round(r.height);
      }
      redraw();
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  function redraw() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    for (const s of strokesRef.current) {
      if (!s.pts.length) continue;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x * cv.width, s.pts[0].y * cv.height);
      for (const p of s.pts) ctx.lineTo(p.x * cv.width, p.y * cv.height);
      ctx.stroke();
    }
  }

  function canvasPt(e: React.PointerEvent) {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function onPenDown(e: React.PointerEvent) {
    if (!penActive) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = canvasPt(e);
    lastPtRef.current = pt;
    strokesRef.current = [...strokesRef.current, { color: penColor, pts: [pt] }];
  }

  function onPenMove(e: React.PointerEvent) {
    if (!drawingRef.current || !penActive) return;
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    const pt = canvasPt(e);
    const last = lastPtRef.current!;
    strokesRef.current[strokesRef.current.length - 1].pts.push(pt);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x * cv.width, last.y * cv.height);
    ctx.lineTo(pt.x * cv.width, pt.y * cv.height);
    ctx.stroke();
    lastPtRef.current = pt;
  }

  async function onPenUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    await onSave(annotation.id, { strokes: strokesRef.current });
    flashSaved();
  }

  async function clearCanvas() {
    strokesRef.current = [];
    redraw();
    await onSave(annotation.id, { strokes: [] });
    flashSaved();
  }

  async function editComment() {
    const next = window.prompt('Margin comment:', annotation.comment);
    if (next === null) return;
    await onSave(annotation.id, { comment: next.trim() });
    flashSaved();
  }

  return (
    <aside className={`nb-card${slide ? ' slide' : ''}`}>
      <div className="nb-top">
        <h2>Notebook</h2>
        <div className="lay-switch">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`lay-btn${layout === l.id ? ' on' : ''}`}
              title={l.label}
              onClick={() => setLayout(l.id)}
            >
              {l.icon}
            </button>
          ))}
        </div>
        <button className="nb-x" onClick={onClose} title="Close notebook">
          ✕
        </button>
      </div>

      <div className="nb-quote" style={{ ['--qc' as string]: annotation.color }}>
        <div className="nb-quote-head">
          <span>On this passage</span>
          <span className="ref">p. {annotation.page}</span>
        </div>
        <div className="nb-quote-body">“{annotation.quote}”</div>
        {annotation.comment.trim() && (
          <button className="nb-cmt-chip" onClick={editComment} title="Edit margin comment">
            💬 {annotation.comment}
          </button>
        )}
      </div>

      <div ref={writeRef} className={`nb-write${penActive ? ' pen-on' : ''}`}>
        <textarea
          ref={areaRef}
          className="nb-ta"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your thoughts here…"
        />
        <canvas
          ref={canvasRef}
          className="nb-canvas"
          onPointerDown={onPenDown}
          onPointerMove={onPenMove}
          onPointerUp={onPenUp}
        />
      </div>

      <div className="nb-foot">
        <button className={`mode-btn${!penActive ? ' on' : ''}`} onClick={() => setPenActive(false)}>
          ✎ Type
        </button>
        <button className={`mode-btn${penActive ? ' on' : ''}`} onClick={() => setPenActive(true)}>
          ✐ Draw
        </button>
        {penActive && (
          <div className="pen-tools">
            {PENS.map((c) => (
              <button
                key={c}
                className={`pen-sw${penColor === c ? ' on' : ''}`}
                style={{ background: c }}
                onClick={() => setPenColor(c)}
              />
            ))}
            <button className="erase-btn" onClick={clearCanvas}>
              Erase all
            </button>
          </div>
        )}
        <span className="nb-saved">{status}</span>
        <button
          className="nb-del"
          onClick={() => onDelete(annotation.id)}
          title="Delete highlight & note"
        >
          Delete
        </button>
      </div>
    </aside>
  );
}
