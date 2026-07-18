'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import Library from './Library';
import Reader from './Reader';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  const pdf = useLiveQuery(
    () => (openId ? db.pdfs.get(openId) : undefined),
    [openId],
  );

  if (openId && pdf) {
    return <Reader pdf={pdf} onBack={() => setOpenId(null)} />;
  }
  if (openId && !pdf) {
    return <div className="boot">Fetching from the shelf…</div>;
  }
  return <Library onOpen={setOpenId} />;
}
