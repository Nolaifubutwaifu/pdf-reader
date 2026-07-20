'use client';

import { useEffect, useRef, useState } from 'react';
import type { PageMarks, PenStroke, TextMark } from '@/lib/types';

export type MarkTool = 'read' | 'pen' | 'marker' | 'text' | 'erase';

const PEN_WIDTH = 0.0026; // fractions of page width, so ink scales with zoom
const MARKER_WIDTH = 0.016;
const TEXT_SIZE = 0.022;
const ERASE_RADIUS_PX = 12;

/**
 * Transparent layer over one PDF page for drawing and writing directly on it,
 * iOS-Files style. Strokes and text live in normalized page coordinates; the
 * parent persists every change (debounced), so marks save as you make them.
 */
export default function MarkupLayer({
  marks,
  tool,
  inkColor,
  markerColor,
  onChange,
}: {
  marks: PageMarks;
  tool: MarkTool;
  inkColor: string;
  markerColor: string;
  onChange: (next: PageMarks) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentRef = useRef<PenStroke | null>(null);
  const drawingRef = useRef(false);
  const [pageW, setPageW] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Size the canvas to the rendered page (zoom changes it) and repaint.
  useEffect(() => {
    const el = rootRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2) return;
      if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) {
        cv.width = Math.round(r.width);
        cv.height = Math.round(r.height);
      }
      setPageW(Math.round(r.width));
      redraw();
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks.strokes]);

  function paintStroke(
    ctx: CanvasRenderingContext2D,
    s: PenStroke,
    W: number,
    H: number,
  ) {
    ctx.globalAlpha = s.tool === 'marker' ? 0.45 : 1;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const w = Math.max(1, s.width * W);
    ctx.lineWidth = w;
    if (s.pts.length === 1) {
      ctx.beginPath();
      ctx.arc(s.pts[0].x * W, s.pts[0].y * H, w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(s.pts[0].x * W, s.pts[0].y * H);
    for (const p of s.pts) ctx.lineTo(p.x * W, p.y * H);
    ctx.stroke();
  }

  function redraw() {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of marks.strokes) paintStroke(ctx, s, cv.width, cv.height);
    if (currentRef.current) paintStroke(ctx, currentRef.current, cv.width, cv.height);
    ctx.globalAlpha = 1;
  }

  function toPt(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function eraseAt(e: React.PointerEvent) {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const survivors = marks.strokes.filter(
      (s) =>
        !s.pts.some(
          (p) => Math.hypot(p.x * r.width - px, p.y * r.height - py) < ERASE_RADIUS_PX,
        ),
    );
    if (survivors.length !== marks.strokes.length) {
      onChange({ ...marks, strokes: survivors });
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (tool === 'pen' || tool === 'marker') {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      drawingRef.current = true;
      currentRef.current = {
        tool: tool === 'marker' ? 'marker' : 'pen',
        color: tool === 'marker' ? markerColor : inkColor,
        width: tool === 'marker' ? MARKER_WIDTH : PEN_WIDTH,
        pts: [toPt(e)],
      };
      redraw();
    } else if (tool === 'erase') {
      drawingRef.current = true;
      eraseAt(e);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    if (currentRef.current) {
      currentRef.current.pts.push(toPt(e));
      redraw();
    } else if (tool === 'erase') {
      eraseAt(e);
    }
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentRef.current) {
      const stroke = currentRef.current;
      currentRef.current = null;
      onChange({ ...marks, strokes: [...marks.strokes, stroke] });
    }
  }

  function addTextAt(e: React.PointerEvent) {
    if (tool !== 'text') return;
    if ((e.target as HTMLElement).closest('.tmark')) return;
    const r = rootRef.current!.getBoundingClientRect();
    const mark: TextMark = {
      id: crypto.randomUUID(),
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      text: '',
      color: inkColor,
      size: TEXT_SIZE,
    };
    onChange({ ...marks, texts: [...marks.texts, mark] });
    setEditingId(mark.id);
  }

  function patchText(id: string, patch: Partial<TextMark>) {
    onChange({
      ...marks,
      texts: marks.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  }

  function dropText(id: string) {
    onChange({ ...marks, texts: marks.texts.filter((t) => t.id !== id) });
    if (editingId === id) setEditingId(null);
  }

  const drawing = tool === 'pen' || tool === 'marker';

  return (
    <div
      ref={rootRef}
      className={`mk-layer tool-${tool}${drawing ? ' draw' : ''}`}
      onPointerDown={tool === 'text' ? addTextAt : undefined}
    >
      <canvas
        ref={canvasRef}
        className="mk-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {marks.texts.map((t) => (
        <TextMarkView
          key={t.id}
          mark={t}
          pageW={pageW}
          tool={tool}
          editing={editingId === t.id}
          onEdit={() => setEditingId(t.id)}
          onDone={() => setEditingId(null)}
          onPatch={(p) => patchText(t.id, p)}
          onDrop={() => dropText(t.id)}
        />
      ))}
    </div>
  );
}

function TextMarkView({
  mark,
  pageW,
  tool,
  editing,
  onEdit,
  onDone,
  onPatch,
  onDrop,
}: {
  mark: TextMark;
  pageW: number;
  tool: MarkTool;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onPatch: (p: Partial<TextMark>) => void;
  onDrop: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!editing) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, mark.text]);

  function onPointerDown(e: React.PointerEvent) {
    if (tool === 'erase') {
      e.stopPropagation();
      onDrop();
      return;
    }
    if (tool !== 'text' || editing) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const host = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: mark.x,
      origY: mark.y,
      moved: false,
    };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      onPatch({
        x: Math.min(0.98, Math.max(0, d.origX + dx / host.width)),
        y: Math.min(0.99, Math.max(0, d.origY + dy / host.height)),
      });
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (d && !d.moved) onEdit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const fontSize = Math.max(9, mark.size * pageW);

  return (
    <div
      className={`tmark${editing ? ' editing' : ''}`}
      style={{
        left: `${mark.x * 100}%`,
        top: `${mark.y * 100}%`,
        fontSize,
        color: mark.color,
      }}
      onPointerDown={onPointerDown}
    >
      {editing ? (
        <textarea
          ref={areaRef}
          value={mark.text}
          rows={1}
          placeholder="Type…"
          onChange={(e) => {
            onPatch({ text: e.target.value });
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={() => {
            if (!mark.text.trim()) onDrop();
            else onDone();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
          }}
        />
      ) : (
        <span>{mark.text}</span>
      )}
    </div>
  );
}
