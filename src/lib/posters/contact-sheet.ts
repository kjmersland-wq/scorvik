// Contact sheet: every poster in the pack on one page, two columns, each labelled with its placement name and pixel size.
// The layout is pure; drawing lives in render-poster.ts.

export interface SheetCell { id: string; label: string; width: number; height: number }

export interface SheetOptions { columns: number; cellWidth: number; gap: number; margin: number; labelHeight: number }

export interface SheetItem { id: string; x: number; y: number; w: number; h: number; label: string; labelY: number }

export const defaultSheetOptions: SheetOptions = { columns: 2, cellWidth: 640, gap: 48, margin: 56, labelHeight: 52 };

export function sheetLabel(cell: SheetCell): string {
  return `${cell.label} — ${cell.width}×${cell.height}`;
}

export function computeContactSheet(cells: SheetCell[], options: SheetOptions = defaultSheetOptions): { width: number; height: number; items: SheetItem[] } {
  const { columns, cellWidth, gap, margin, labelHeight } = options;
  const width = margin * 2 + columns * cellWidth + (columns - 1) * gap;
  const items: SheetItem[] = [];
  let y = margin;
  for (let start = 0; start < cells.length; start += columns) {
    const row = cells.slice(start, start + columns);
    const heights = row.map((cell) => Math.round((cell.height * cellWidth) / cell.width));
    row.forEach((cell, column) => {
      const h = heights[column];
      items.push({ id: cell.id, x: margin + column * (cellWidth + gap), y, w: cellWidth, h, label: sheetLabel(cell), labelY: y + h + Math.round(labelHeight * 0.3) });
    });
    y += Math.max(...heights) + labelHeight + gap;
  }
  return { width, height: y - gap + margin, items };
}
