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
