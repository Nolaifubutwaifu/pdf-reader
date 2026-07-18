'use client';

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export default function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const pdfs = useLiveQuery(() => db.pdfs.orderBy('addedAt').reverse().toArray(), []);
  const counts =
    useLiveQuery(async () => {
      const all = await db.annotations.toArray();
      const m: Record<string, number> = {};
      for (const a of all) m[a.pdfId] = (m[a.pdfId] ?? 0) + 1;
      return m;
    }, []) ?? {};

  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | File[]) {
    let lastId = '';
    for (const f of Array.from(files)) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) continue;
      const id = crypto.randomUUID();
      await db.pdfs.add({
        id,
        name: f.name.replace(/\.pdf$/i, ''),
        data: f,
        addedAt: Date.now(),
      });
      lastId = id;
    }
    if (lastId) onOpen(lastId);
  }

  async function openSample() {
    const res = await fetch('/sample.pdf');
    const blob = await res.blob();
    const id = crypto.randomUUID();
    await db.pdfs.add({
      id,
      name: 'On Reading Well — a sample essay',
      data: blob,
      addedAt: Date.now(),
    });
    onOpen(id);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove “${name}” and all of its highlights and notes?`)) return;
    await db.annotations.where('pdfId').equals(id).delete();
    await db.pdfs.delete(id);
  }

  return (
    <div className="lib">
      <header className="lib-mast">
        <h1 className="wordmark">
          Marginalia<span className="tail">.</span>
        </h1>
        <span className="lib-motto">read · mark · think</span>
      </header>
      <div className="lib-sub">
        <span>A private reading desk</span>
        <span>Everything stays in this browser</span>
      </div>

      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <h2>Bring a document to the desk</h2>
        <p>Drop a PDF anywhere in this frame, or pick one from your files.</p>
        <div className="dz-actions">
          <button className="btn" onClick={() => inputRef.current?.click()}>
            Choose a PDF
          </button>
          <button className="btn ghost" onClick={openSample}>
            Open the sample essay
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      <h2 className="shelf-title">On the desk</h2>
      <hr className="shelf-rule" />
      {pdfs && pdfs.length === 0 && (
        <p className="shelf-empty">Nothing here yet — the desk is clean.</p>
      )}
      <div className="shelf">
        {pdfs?.map((p) => (
          <button key={p.id} className="doc-card" onClick={() => onOpen(p.id)}>
            <h3>{p.name}</h3>
            <div className="meta">
              <span>{new Date(p.addedAt).toLocaleDateString()}</span>
              <span className="hl-count">
                {counts[p.id] ? `${counts[p.id]} highlight${counts[p.id] === 1 ? '' : 's'}` : 'unmarked'}
              </span>
            </div>
            <span
              className="doc-remove"
              role="button"
              title="Remove from desk"
              onClick={(e) => {
                e.stopPropagation();
                remove(p.id, p.name);
              }}
            >
              ✕
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
