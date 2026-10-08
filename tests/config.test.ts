import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeApiBaseUrl } from "../lib/config.ts";

describe("normalizeApiBaseUrl", () => {
  it("uses the normal local Spring origin by default", () => {
    assert.equal(normalizeApiBaseUrl(undefined), "http://localhost:5000");
  });

  it("prefers and normalizes an explicit public API origin", () => {
    assert.equal(
      normalizeApiBaseUrl("http://127.0.0.1:6200/"),
      "http://127.0.0.1:6200",
    );
  });

  it("rejects provider-style credentials and non-http schemes", () => {
    assert.throws(() => normalizeApiBaseUrl("https://user:secret@example.test"));
    assert.throws(() => normalizeApiBaseUrl("file:///tmp/backend"));
  });
});
