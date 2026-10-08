import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMediaUrl } from "../lib/media.ts";

describe("resolveMediaUrl", () => {
  it("resolves only logical MediaAsset content and download URLs", () => {
    const id = "00000000-0000-0000-0000-000000000001";
    assert.equal(resolveMediaUrl(`/api/v1/assets/${id}/content`),
      `http://localhost:5000/api/v1/assets/${id}/content`,
    );
    assert.equal(resolveMediaUrl(`/api/v1/assets/${id}/download`),
      `http://localhost:5000/api/v1/assets/${id}/download`,
    );
  });

  it("rejects absolute, provider, filesystem, and malformed values", () => {
    assert.equal(resolveMediaUrl("https://provider.example/image.jpg"), null);
    assert.equal(resolveMediaUrl("/srv/auralink/image.jpg"), null);
    assert.equal(resolveMediaUrl("/api/files/legacy.jpg"), null);
    assert.equal(resolveMediaUrl("/api/v1/assets/not-a-uuid/content"), null);
  });
});
