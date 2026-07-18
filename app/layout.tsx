import type { Metadata } from 'next';
import { Fraunces, Alegreya_Sans } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});

const alegreya = Alegreya_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Marginalia — read, mark, think',
  description:
    'A local-first PDF reader. Highlight passages, and open a notebook page beside them to write down everything you think.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${alegreya.variable}`}>
      <body>{children}</body>
    </html>
  );
}
