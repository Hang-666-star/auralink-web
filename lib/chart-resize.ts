type Chart = { isDisposed: () => boolean; resize: (size: { width: number; height: number }) => void };
type Container = { isConnected: boolean; clientWidth: number; clientHeight: number };

/**
 * Responsive layout can briefly report a connected map container with width 0.
 * ECharts cannot invert that singular geographic transform. Keep its last valid
 * size and let the next positive ResizeObserver measurement recover normally.
 */
export function resizeMeasuredChart(chart: Chart, container: Container): boolean {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (!container.isConnected || chart.isDisposed()
    || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  chart.resize({ width, height });
  return true;
}
