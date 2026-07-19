'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { annotationCounts, deleteDocument, listDocuments, uploadDocument } from '@/lib/data';
import { dismissLegacy, importLegacy, legacyCount } from '@/lib/legacy';
import type { DocumentRow } from '@/lib/types';
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
  session,
  onOpen,
}: {
  session: Session;
  onOpen: (doc: DocumentRow, noteId?: string) => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [shelf, setShelf] = useState<Shelf>('all');
  const [drag, setDrag] = useState(false);
  const [overview, setOverview] = useState(false);
  const [legacyN, setLegacyN] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([listDocuments(), annotationCounts()]);
      setDocs(d);
      setCounts(c);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void legacyCount().then(setLegacyN);
  }, [refresh]);

  async function addFiles(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (!pdfs.length) return;
    let last: DocumentRow | null = null;
    for (const [i, f] of pdfs.entries()) {
      setBusy(`Uploading ${i + 1} of ${pdfs.length}…`);
      try {
        last = await uploadDocument(f, f.name.replace(/\.pdf$/i, ''));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy('');
    await refresh();
    if (last) onOpen(last);
  }

  async function openSample() {
    setBusy('Adding the sample essay…');
    try {
      const res = await fetch('/sample.pdf');
      const doc = await uploadDocument(await res.blob(), 'On Reading Well');
      await refresh();
      onOpen(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function remove(doc: DocumentRow) {
    if (!confirm(`Remove “${doc.name}” and all of its highlights and notes?`)) return;
    setBusy('Removing…');
    try {
      await deleteDocument(doc);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  }

  async function runImport() {
    setBusy('Importing your local documents…');
    try {
      const r = await importLegacy((done, total) =>
        setBusy(`Importing ${done} of ${total}…`),
      );
      setLegacyN(0);
      await refresh();
      setBusy('');
      alert(
        `Imported ${r.documents} document${r.documents === 1 ? '' : 's'} and ${r.annotations} note${
          r.annotations === 1 ? '' : 's'
        }. Your local copies were left untouched.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy('');
    }
  }

  const shown = docs.filter((p) =>
    shelf === 'annotated' ? (counts[p.id] ?? 0) > 0 : shelf === 'reading' ? !!p.last_opened_at : true,
  );

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
          void addFiles(e.dataTransfer.files);
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

        <div className="acct-row">
          <span className="acct-mail">{session.user.email}</span>
          <button className="acct-out" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>

        <p className="lib-desc">
          Open any document, highlight what matters, and pull a blank notebook page
          alongside the passage to think it through. Drop a PDF anywhere on this page,{' '}
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
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />

        {legacyN > 0 && (
          <div className="banner">
            <div>
              <strong>
                {legacyN} document{legacyN === 1 ? '' : 's'} found in this browser
              </strong>
              <span>
                From before you had an account. Import them to your account so they sync
                and survive a cleared cache — your local copies stay where they are.
              </span>
            </div>
            <div className="banner-actions">
              <button className="cbtn gold" onClick={runImport}>
                Import
              </button>
              <button
                className="cbtn"
                onClick={() => {
                  dismissLegacy();
                  setLegacyN(0);
                }}
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="err-bar">
            {error}
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}
        {busy && <div className="busy-bar">{busy}</div>}

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
          {loading && <p className="shelf-empty">Opening your shelf…</p>}
          {!loading && shown.length === 0 && (
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
              <div key={p.id} className="cover-card" onClick={() => onOpen(p)}>
                <div className="cover" style={{ background: c.cover }}>
                  <div className="spine" style={{ background: c.spine }} />
                  <div className="cover-inner">
                    <div className="cover-kicker">
                      {p.page_count ? `${p.page_count} pages` : 'PDF Document'}
                    </div>
                    <div className="cover-title">{p.name}</div>
                    <div className="cover-author">
                      Added {new Date(p.added_at).toLocaleDateString()}
                    </div>
                  </div>
                  {n > 0 && <div className="cover-badge">{n} ✎</div>}
                  <button
                    className="cover-x"
                    title="Remove from desk"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(p);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div>
                  <div className="under-title">{p.name}</div>
                  <div className="under-meta">
                    <span>{n ? `${n} highlight${n === 1 ? '' : 's'}` : 'unmarked'}</span>
                    <span className="gold-t">{p.last_opened_at ? 'reading' : 'unread'}</span>
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
            const target = docs.find((d) => d.id === a.document_id);
            setOverview(false);
            if (target) onOpen(target, a.id);
          }}
        />
      )}
    </div>
  );
}
