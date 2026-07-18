'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import Library from './Library';
import Reader from './Reader';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [jumpNoteId, setJumpNoteId] = useState<string | null>(null);
  const pdf = useLiveQuery(
    () => (openId ? db.pdfs.get(openId) : undefined),
    [openId],
  );

  function open(id: string, noteId?: string) {
    setJumpNoteId(noteId ?? null);
    setOpenId(id);
    db.pdfs.update(id, { lastOpenedAt: Date.now() });
  }

  if (openId && pdf) {
    return (
      <Reader
        pdf={pdf}
        initialNoteId={jumpNoteId}
        onBack={() => {
          setOpenId(null);
          setJumpNoteId(null);
        }}
      />
    );
  }
  if (openId && !pdf) {
    return <div className="boot">Fetching from the shelf…</div>;
  }
  return <Library onOpen={open} />;
}
