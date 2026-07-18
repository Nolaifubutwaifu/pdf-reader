import Dexie, { type EntityTable } from 'dexie';

/** Rectangle normalized to page dimensions (0..1), so highlights survive zooming. */
export interface NRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfDoc {
  id: string;
  name: string;
  data: Blob;
  addedAt: number;
}

export interface Annotation {
  id: string;
  pdfId: string;
  page: number;
  rects: NRect[];
  color: string;
  /** The selected passage text. */
  quote: string;
  /** Notebook content attached to this passage. */
  note: string;
  createdAt: number;
}

export const db = new Dexie('marginalia') as Dexie & {
  pdfs: EntityTable<PdfDoc, 'id'>;
  annotations: EntityTable<Annotation, 'id'>;
};

db.version(1).stores({
  pdfs: 'id, addedAt',
  annotations: 'id, pdfId, page, createdAt',
});
