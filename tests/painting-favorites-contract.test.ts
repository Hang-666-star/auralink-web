import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { api, ApiError } from "../lib/api.ts";

const PAINTING_ID = "11111111-2222-3333-4444-555555555555";
const TOKEN = "session-token";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("painting detail and favorites API contract", () => {
  it("uses the public painting UUID and current-user favorites endpoint", async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null }> = [];
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        authorization: headers.get("Authorization"),
      });
      if (init?.method === "PUT" || init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return Response.json({ items: [], page: 0, size: 12, totalElements: 0, totalPages: 0, first: true, last: true, hasNext: false });
    };

    await api.painting(PAINTING_ID, TOKEN);
    await api.favoritePainting(PAINTING_ID, TOKEN);
    await api.unfavoritePainting(PAINTING_ID, TOKEN);
    await api.favoritePaintings(0, 12, TOKEN);

    assert.deepEqual(calls, [
      { url: `http://localhost:5000/api/v1/paintings/${PAINTING_ID}`, method: "GET", authorization: `Bearer ${TOKEN}` },
      { url: `http://localhost:5000/api/v1/paintings/${PAINTING_ID}/favorite`, method: "PUT", authorization: `Bearer ${TOKEN}` },
      { url: `http://localhost:5000/api/v1/paintings/${PAINTING_ID}/favorite`, method: "DELETE", authorization: `Bearer ${TOKEN}` },
      { url: "http://localhost:5000/api/v1/me/favorites/paintings?page=0&size=12", method: "GET", authorization: `Bearer ${TOKEN}` },
    ]);
  });

  it("keeps transport failures distinct from an authentication rejection", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    await assert.rejects(
      api.favoritePainting(PAINTING_ID, TOKEN),
      (error: unknown) => error instanceof ApiError && error.kind === "network" && error.status === 0,
    );

    globalThis.fetch = async () => Response.json({ message: "登录已失效" }, { status: 401 });
    await assert.rejects(
      api.unfavoritePainting(PAINTING_ID, TOKEN),
      (error: unknown) => error instanceof ApiError && error.kind === "unauthorized" && error.status === 401,
    );
  });
});
