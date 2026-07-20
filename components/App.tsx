'use client';

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { DocumentRow } from '@/lib/types';
import { touchDocument } from '@/lib/data';
import AuthGate from './AuthGate';
import Library from './Library';
import Reader from './Reader';

export interface OpenTarget {
  noteId?: string;
  page?: number;
}

export default function App() {
  return <AuthGate>{(session) => <Shell session={session} />}</AuthGate>;
}

function Shell({ session }: { session: Session }) {
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [jump, setJump] = useState<OpenTarget>({});

  function open(next: DocumentRow, target?: OpenTarget) {
    setJump(target ?? {});
    setDoc(next);
    void touchDocument(next.id);
  }

  if (doc) {
    return (
      <Reader
        key={doc.id}
        doc={doc}
        initialNoteId={jump.noteId ?? null}
        initialPage={jump.page ?? null}
        onBack={() => {
          setDoc(null);
          setJump({});
        }}
      />
    );
  }
  return <Library session={session} onOpen={open} />;
}
