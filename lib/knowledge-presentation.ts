/** Painting-only chart sizing; graph canvases keep their existing sizing. */
export function paintingChartHeight(kind: "bar" | "pie" | "line", itemCount: number): number {
  return kind === "bar" ? Math.max(156, itemCount * 28 + 36) : 220;
}

/** UI limits and server truncation are separate: neither changes metric samples. */
export function chartTruncatesItems(itemCount: number, displayLimit?: number): boolean {
  return displayLimit !== undefined && itemCount > displayLimit;
}
