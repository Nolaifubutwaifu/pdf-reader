'use client';

import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import NotesOverview from './NotesOverview';

const COVERS = [
  { cover: '#3a270d', spine: '#7d5411' },
  { cover: '#26361f', spine: '#2f4a2f' },
  { cover: '#243642', spine: '#3a4a5a' },
  { cover: '#3d2226', spine: '#6e2313' },
];

function coverFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVERS[h % COVERS.length];
}

type Shelf = 'all' | 'reading' | 'annotated';

export default function Library({
  onOpen,
}: {
  onOpen: (id: string, noteId?: string) => void;
}) {
  const pdfs = useLiveQuery(() => db.pdfs.orderBy('addedAt').reverse().toArray(), []);
  const counts =
    useLiveQuery(async () => {
      const all = await db.annotations.toArray();
      const m: Record<string, number> = {};
      for (const a of all) m[a.pdfId] = (m[a.pdfId] ?? 0) + 1;
      return m;
    }, []) ?? {};

  const [shelf, setShelf] = useState<Shelf>('all');
  const [drag, setDrag] = useState(false);
  const [overview, setOverview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = (pdfs ?? []).filter((p) =>
    shelf === 'annotated' ? (counts[p.id] ?? 0) > 0 : shelf === 'reading' ? !!p.lastOpenedAt : true,
  );

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
      name: 'On Reading Well',
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

  const shelves: { id: Shelf; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'reading', label: 'Reading' },
    { id: 'annotated', label: 'Annotated' },
  ];

  return (
    <div className="lib paper-scroll">
      <div
        className={`lib-inner${drag ? ' drag' : ''}`}
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
        <header className="lib-head">
          <div>
            <div className="kicker">Your Reading Desk</div>
            <h1 className="lib-title">Marginalia</h1>
          </div>
          <div className="lib-actions">
            <button className="cbtn" onClick={() => setOverview(true)}>
              Notebook
            </button>
            <button className="cbtn gold" onClick={() => inputRef.current?.click()}>
              ＋ Import PDF
            </button>
          </div>
        </header>
        <p className="lib-desc">
          Open any document, highlight what matters, and pull a blank notebook page
          alongside the passage to think it through. Everything stays in this browser —
          drop a PDF anywhere on this page,{' '}
          <button className="sample-link" onClick={openSample}>
            or open the sample essay
          </button>
          .
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />

        <div className="pills">
          {shelves.map((s) => (
            <button
              key={s.id}
              className={`pill${shelf === s.id ? ' on' : ''}`}
              onClick={() => setShelf(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="covers">
          {pdfs && shown.length === 0 && (
            <p className="shelf-empty">
              {shelf === 'all'
                ? 'Nothing here yet — the desk is clean.'
                : 'Nothing on this shelf yet.'}
            </p>
          )}
          {shown.map((p) => {
            const c = coverFor(p.id);
            const n = counts[p.id] ?? 0;
            return (
              <div key={p.id} className="cover-card" onClick={() => onOpen(p.id)}>
                <div className="cover" style={{ background: c.cover }}>
                  <div className="spine" style={{ background: c.spine }} />
                  <div className="cover-inner">
                    <div className="cover-kicker">PDF Document</div>
                    <div className="cover-title">{p.name}</div>
                    <div className="cover-author">
                      Added {new Date(p.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {n > 0 && <div className="cover-badge">{n} ✎</div>}
                  <button
                    className="cover-x"
                    title="Remove from desk"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id, p.name);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div>
                  <div className="under-title">{p.name}</div>
                  <div className="under-meta">
                    <span>{n ? `${n} highlight${n === 1 ? '' : 's'}` : 'unmarked'}</span>
                    <span className="gold-t">{p.lastOpenedAt ? 'reading' : 'unread'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {overview && (
        <NotesOverview
          title="All notes"
          onClose={() => setOverview(false)}
          onJump={(a) => {
            setOverview(false);
            onOpen(a.pdfId, a.id);
          }}
        />
      )}
    </div>
  );
}
