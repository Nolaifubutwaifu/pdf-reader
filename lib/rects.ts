/**
 * Clean up the raw client rects of a text selection over a pdf.js text layer.
 * The text layer emits one rect per span plus container rects that cover whole
 * blocks; we drop containers, then merge fragments that sit on the same line.
 */
export function cleanSelectionRects(raw: DOMRect[]): DOMRect[] {
  const rects = raw.filter((r) => r.width > 2 && r.height > 2);

  const contains = (a: DOMRect, b: DOMRect) =>
    a.left <= b.left + 1 &&
    a.right >= b.right - 1 &&
    a.top <= b.top + 1 &&
    a.bottom >= b.bottom - 1 &&
    (a.width > b.width + 1 || a.height > b.height + 1);

  const atoms = rects.filter((a) => !rects.some((b) => b !== a && contains(a, b)));

  // Merge horizontally within lines (same baseline band).
  const lines = new Map<number, { left: number; right: number; top: number; bottom: number }>();
  for (const r of atoms) {
    const key = Math.round(r.top / 4);
    const line = lines.get(key);
    if (!line) {
      lines.set(key, { left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    } else {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    }
  }
  return Array.from(lines.values()).map(
    (l) => new DOMRect(l.left, l.top, l.right - l.left, l.bottom - l.top),
  );
}
