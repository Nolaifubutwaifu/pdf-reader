'use client';

import { useEffect, useRef, useState } from 'react';
import { db, type Annotation } from '@/lib/db';

/**
 * A blank notebook page that opens beside the document, bound to one
 * highlighted passage. Autosaves as you write.
 */
export default function NotebookPanel({
  annotation,
  onClose,
}: {
  annotation: Annotation;
  onClose: () => void;
}) {
  const [text, setText] = useState(annotation.note);
  const [status, setStatus] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (text === annotation.note) return;
    setStatus('writing…');
    const t = setTimeout(async () => {
      await db.annotations.update(annotation.id, { note: text });
      setStatus('saved to this browser');
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, annotation.id]);

  async function removeAnnotation() {
    if (!confirm('Remove this highlight and its notebook page?')) return;
    await db.annotations.delete(annotation.id);
    onClose();
  }

  return (
    <aside className="notebook" style={{ ['--nb-color' as string]: annotation.color }}>
      <div className="nb-head">
        <h2>Notebook</h2>
        <div className="nb-actions">
          <button className="danger" onClick={removeAnnotation} title="Delete highlight & note">
            Delete
          </button>
          <button onClick={onClose} title="Close notebook">
            Close ✕
          </button>
        </div>
      </div>
      <blockquote className="nb-quote">
        “{annotation.quote}”
        <span className="pg">page {annotation.page}</span>
      </blockquote>
      <div className="nb-paper">
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="All your thoughts about this passage…"
        />
      </div>
      <div className="nb-foot">{status}</div>
    </aside>
  );
}
