'use client';

import dynamic from 'next/dynamic';

// pdf.js needs the DOM — render the whole app client-side only.
const App = dynamic(() => import('@/components/App'), {
  ssr: false,
  loading: () => <div className="boot">Opening the reading room…</div>,
});

export default function Home() {
  return <App />;
}
