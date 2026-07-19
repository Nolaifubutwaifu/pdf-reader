'use client';

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { DocumentRow } from '@/lib/types';
import { touchDocument } from '@/lib/data';
import AuthGate from './AuthGate';
import Library from './Library';
import Reader from './Reader';

export default function App() {
  return <AuthGate>{(session) => <Shell session={session} />}</AuthGate>;
}

function Shell({ session }: { session: Session }) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [jumpNoteId, setJumpNoteId] = useState<string | null>(null);

  function open(next: DocumentRow, noteId?: string) {
    setJumpNoteId(noteId ?? null);
    setDoc(next);
    void touchDocument(next.id);
  }

  if (doc) {
    return (
      <Reader
        doc={doc}
        initialNoteId={jumpNoteId}
        onBack={() => {
          setDoc(null);
          setJumpNoteId(null);
        }}
      />
    );
  }
  return <Library session={session} onOpen={open} />;
}
