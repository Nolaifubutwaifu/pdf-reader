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

export interface DocumentRow {
  id: string;
  user_id: string;
  name: string;
  storage_path: string;
  byte_size: number | null;
  page_count: number | null;
  added_at: string;
  last_opened_at: string | null;
}

/** A stroke drawn directly on a PDF page. Width is a fraction of page width. */
export interface PenStroke {
  tool: 'pen' | 'marker';
  color: string;
  width: number;
  pts: { x: number; y: number }[];
}

/** A text box placed directly on a PDF page. Size is a fraction of page width. */
export interface TextMark {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

/** All direct markup on one page. */
export interface PageMarks {
  strokes: PenStroke[];
  texts: TextMark[];
}

export interface SearchHit {
  kind: 'page' | 'note' | 'document';
  document_id: string;
  ref_id: string;
  page: number | null;
  title: string;
  /** For page hits: a ts_headline fragment with «…» around matches. */
  snippet: string | null;
  rank: number;
}

export interface AnnotationRow {
  id: string;
  document_id: string;
  user_id: string;
  page: number;
  rects: NRect[];
  color: string;
  quote: string;
  note: string;
  comment: string;
  strokes: Stroke[];
  created_at: string;
  updated_at: string;
}
