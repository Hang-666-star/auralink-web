import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toApiError } from "../lib/api.ts";

describe("toApiError", () => {
  it("normalizes legacy validation field errors", () => {
    const error = toApiError(400, {
      message: "参数验证失败",
      data: { username: "用户名不能为空" },
    });
    assert.equal(error.kind, "validation");
    assert.deepEqual(error.validationErrors, { username: "用户名不能为空" });
  });

  it("normalizes v1 errors and correlation identifiers", () => {
    const error = toApiError(429, {
      code: "GUIDE_RATE_LIMITED",
      message: "请求过于频繁",
      correlationId: "corr-1",
      validationErrors: {},
    });
    assert.equal(error.kind, "rate_limited");
    assert.equal(error.code, "GUIDE_RATE_LIMITED");
    assert.equal(error.correlationId, "corr-1");
  });

  it("uses safe status-based text when a response has no JSON body", () => {
    assert.equal(toApiError(503, undefined).message, "服务暂时不可用，请稍后再试。");
  });

  it("keeps an expired session distinct from recoverable server availability", () => {
    const expiredSession = toApiError(401, { success: false, message: "授权失败" });
    const unavailableServer = toApiError(503, { message: "暂时不可用" });

    assert.equal(expiredSession.kind, "unauthorized");
    assert.equal(unavailableServer.kind, "server");
  });
});
