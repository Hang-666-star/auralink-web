import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { api } from "../lib/api.ts";
import { formatProfileDate, parseProfileDateTime, parseUserProfile } from "../lib/profile-contract.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("user profile timestamp contract", () => {
  const actualLocalDateTime = [2026, 9, 7, 22, 3, 29, 602_000_000];

  it("normalizes the backend LocalDateTime array that previously crashed /me", () => {
    const profile = parseUserProfile({
      id: 7,
      username: "favorite-qa",
      fullName: "Favorites QA",
      email: "favorite-qa@example.invalid",
      createdAt: actualLocalDateTime,
      updatedAt: actualLocalDateTime,
    });

    assert.equal(profile.createdAt, "2026-09-07T22:03:29.602");
    assert.doesNotThrow(() => formatProfileDate(profile.createdAt));
    assert.match(formatProfileDate(profile.createdAt), /2026/);
  });

  it("applies the same parsing through the legacy profile envelope", async () => {
    globalThis.fetch = async () => Response.json({
      success: true,
      data: {
        id: 8,
        username: "profile-qa",
        fullName: null,
        email: "profile-qa@example.invalid",
        createdAt: actualLocalDateTime,
        updatedAt: actualLocalDateTime,
      },
    });

    const profile = await api.profile("session-token");
    assert.equal(profile.createdAt, "2026-09-07T22:03:29.602");
  });

  it("rejects malformed date arrays instead of passing an invalid Date into rendering", () => {
    assert.throws(() => parseProfileDateTime([2026, 2, 30, 12, 0], "注册时间"), /注册时间无效/);
    assert.throws(() => parseProfileDateTime([2026, 9, 7, 22, 3, 29, 1_000_000_000], "注册时间"), /注册时间无效/);
  });
});
