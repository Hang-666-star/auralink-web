import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chartTruncatesItems } from "../lib/knowledge-presentation.ts";

describe("Painting presentation limits", () => {
  it("does not claim first-12 truncation for empty, sparse or exactly-12 groups", () => {
    for (const count of [0, 1, 5, 12]) assert.equal(chartTruncatesItems(count, 12), false);
    assert.equal(chartTruncatesItems(13, 12), true);
    assert.equal(chartTruncatesItems(50, 12), true);
    // Server truncation is a separate contract flag; charts without a UI limit
    // must not invent a first-12 claim, even for many groups.
    assert.equal(chartTruncatesItems(50), false);
  });
});
