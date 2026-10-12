import assert from "node:assert/strict";
import { it } from "node:test";
import { resizeMeasuredChart } from "../lib/chart-resize.ts";

it("preserves a map through a transient zero-width responsive box and resizes on recovery", () => {
  const calls: { width: number; height: number }[] = [];
  const chart = { isDisposed: () => false, resize: (size: { width: number; height: number }) => {
    // A zero-size geographic matrix is singular in ECharts; the observer must not send it.
    assert(size.width > 0 && size.height > 0);
    calls.push(size);
  } };
  const container = { isConnected: true, clientWidth: 500, clientHeight: 315 };
  assert.equal(resizeMeasuredChart(chart, container), true);
  container.clientWidth = 0;
  assert.equal(resizeMeasuredChart(chart, container), false);
  container.clientWidth = 316;
  assert.equal(resizeMeasuredChart(chart, container), true);
  assert.deepEqual(calls, [{ width: 500, height: 315 }, { width: 316, height: 315 }]);
});

it("ignores detached or disposed charts and invalid dimensions without hiding valid-size errors", () => {
  const chart = { isDisposed: () => false, resize: () => { throw new Error("real rendering failure"); } };
  const container = { isConnected: true, clientWidth: 316, clientHeight: 315 };
  assert.equal(resizeMeasuredChart(chart, { ...container, isConnected: false }), false);
  assert.equal(resizeMeasuredChart({ ...chart, isDisposed: () => true }, container), false);
  assert.equal(resizeMeasuredChart(chart, { ...container, clientHeight: 0 }), false);
  assert.equal(resizeMeasuredChart(chart, { ...container, clientWidth: NaN }), false);
  assert.throws(() => resizeMeasuredChart(chart, container), /real rendering failure/);
});
