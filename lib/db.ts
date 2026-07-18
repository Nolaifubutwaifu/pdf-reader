import Dexie, { type EntityTable } from 'dexie';

/** Rectangle normalized to page dimensions (0..1), so highlights survive zooming. */
export interface NRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A freehand pen stroke on a notebook page, points normalized to canvas size. */
export interface Stroke {
  color: string;
  pts: { x: number; y: number }[];
}

export interface PdfDoc {
  id: string;
  name: string;
  data: Blob;
  addedAt: number;
  lastOpenedAt?: number;
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
  /** Short margin comment (💬) attached to this passage. */
  comment: string;
  /** Hand-drawn sketch strokes on the notebook page. */
  strokes: Stroke[];
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

db.version(2)
  .stores({
    pdfs: 'id, addedAt',
    annotations: 'id, pdfId, page, createdAt',
  })
  .upgrade((tx) =>
    tx
      .table('annotations')
      .toCollection()
      .modify((a) => {
        a.comment ??= '';
        a.strokes ??= [];
      }),
  );
