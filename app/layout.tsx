import type { Metadata } from 'next';
import {
  Libre_Caslon_Display,
  Libre_Caslon_Text,
  Hanken_Grotesk,
  JetBrains_Mono,
} from 'next/font/google';
import './globals.css';

// Taiga type stack — shared across every taigaprojects.space subdomain.
const caslonDisplay = Libre_Caslon_Display({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-display',
});

const caslonText = Libre_Caslon_Text({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-body',
});

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui-sans',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-code',
});

export const metadata: Metadata = {
  title: 'Marginalia — read, mark, think',
  description:
    'A local-first PDF reader. Highlight passages, and open a notebook page beside them to write down everything you think.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${caslonDisplay.variable} ${caslonText.variable} ${hanken.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
