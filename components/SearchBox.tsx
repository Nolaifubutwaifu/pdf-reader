'use client';

import { useEffect, useRef, useState } from 'react';
import { searchLibrary } from '@/lib/data';
import type { SearchHit } from '@/lib/types';

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  page: 'in the text',
  note: 'note',
  document: 'document',
};

/**
 * One search across everything on the desk: the text inside every PDF,
 * your notes and comments, and document titles.
 */
export default function SearchBox({ onPick }: { onPick: (hit: SearchHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchLibrary(term);
        setHits(r);
        setOpen(true);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setOpen(true);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Click-away closes the results.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  function pick(hit: SearchHit) {
    setOpen(false);
    setQ('');
    onPick(hit);
  }

  return (
    <div className="search-wrap" ref={boxRef}>
      <input
        className="search-input"
        type="search"
        placeholder="Search the text of every document, your notes, and titles…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) pick(hits[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {busy && <span className="search-busy">searching…</span>}
      {open && (
        <div className="search-pop paper-scroll">
          {error && <div className="search-none">{error}</div>}
          {!error && hits.length === 0 && (
            <div className="search-none">Nothing found for “{q.trim()}”.</div>
          )}
          {hits.map((h) => (
            <button
              key={`${h.kind}-${h.ref_id}`}
              className="search-hit"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
            >
              <span className="search-meta">
                <span className={`search-kind k-${h.kind}`}>{KIND_LABEL[h.kind]}</span>
                <span className="search-title">{h.title}</span>
                {h.page != null && <span className="search-page">p. {h.page}</span>}
              </span>
              {h.snippet && (
                <span className="search-snippet">
                  <Snippet s={h.snippet} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** ts_headline wraps matches in «…»; render those as highlights. */
function Snippet({ s }: { s: string }) {
  const parts = s.split(/[«»]/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}
