import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Pull the text of every page out of a PDF, client-side, for search indexing.
 * pdf.js already parses the text layer for rendering; this reuses it.
 */
export async function extractPdfText(
  blob: Blob,
): Promise<{ page: number; text: string }[]> {
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
  const out: { page: number; text: string }[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      out.push({ page: p, text });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
