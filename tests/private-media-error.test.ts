import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "node:test";

import { api, ApiError } from "../lib/api.ts";

const mediaPath = "/api/v1/assets/11111111-1111-1111-1111-111111111111/content";

it("private media requests accept JSON 404 errors without classifying them as authentication failures", async () => {
  const originalFetch = globalThis.fetch;
  let accept = "";
  let authorization = "";
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    accept = headers.get("accept") ?? "";
    authorization = headers.get("authorization") ?? "";
    return new Response(JSON.stringify({ code: "ASSET_NOT_FOUND", message: "图片暂不可用" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await assert.rejects(api.mediaBlob(mediaPath, "synthetic-token"),
      (error: unknown) => error instanceof ApiError && error.status === 404
        && error.kind === "not_found" && error.code === "ASSET_NOT_FOUND");
    assert.match(accept, /image\/\*/);
    assert.match(accept, /audio\/\*/);
    assert.match(accept, /application\/octet-stream/);
    assert.match(accept, /application\/json/);
    assert.equal(authorization, "Bearer synthetic-token");
  } finally { globalThis.fetch = originalFetch; }
});

it("successful authenticated media responses preserve binary content type and exact bytes", async () => {
  const originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 1]);
  globalThis.fetch = async () => new Response(bytes, { headers: { "Content-Type": "image/png" } });
  try {
    const blob = await api.mediaBlob(mediaPath, "synthetic-token");
    const actual = new Uint8Array(await blob.arrayBuffer());
    assert.equal(blob.type, "image/png");
    assert.equal(createHash("sha256").update(actual).digest("hex"),
      createHash("sha256").update(bytes).digest("hex"));
  } finally { globalThis.fetch = originalFetch; }
});

it("genuine 401 and authorization 403 responses keep their distinct error contracts", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, kind] of [[401, "unauthorized"], [403, "forbidden"]] as const) {
      globalThis.fetch = async () => new Response(JSON.stringify({ code: "DENIED", message: "拒绝" }), {
        status, headers: { "Content-Type": "application/json" },
      });
      await assert.rejects(api.mediaBlob(mediaPath, "synthetic-token"),
        (error: unknown) => error instanceof ApiError && error.status === status && error.kind === kind);
    }
  } finally { globalThis.fetch = originalFetch; }
});
