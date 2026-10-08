import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeReturnPath } from "../lib/navigation.ts";

describe("safeReturnPath", () => {
  it("keeps internal return paths", () => {
    assert.equal(
      safeReturnPath("/gallery/00000000-0000-0000-0000-000000000001?tab=guide"),
      "/gallery/00000000-0000-0000-0000-000000000001?tab=guide",
    );
  });

  it("rejects external and protocol-relative redirects", () => {
    assert.equal(safeReturnPath("https://example.test"), "/gallery");
    assert.equal(safeReturnPath("//example.test"), "/gallery");
  });
});
