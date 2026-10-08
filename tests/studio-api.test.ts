import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { api, ApiError, CreationResponseContractError, errorMessage } from "../lib/api.ts";
import { SingleFlightGuard } from "../lib/studio-contracts.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const mediaAssetPayload = {
  assetId: "22222222-2222-2222-2222-222222222222",
  originalFilename: "source.png",
  mimeType: "image/png",
  fileSize: 4,
  width: 1,
  height: 1,
  durationSeconds: null,
  assetType: "IMAGE",
  semanticType: "IMAGE",
  sourceType: "USER_UPLOAD",
  visibility: "PRIVATE",
  status: "ACTIVE",
  contentUrl: "/api/v1/assets/22222222-2222-2222-2222-222222222222/content",
  downloadUrl: "/api/v1/assets/22222222-2222-2222-2222-222222222222/download",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

/**
 * The persisted successful two-step record investigated in Round 6.  This is
 * deliberately a transport payload, rather than a parsed CreationDetail: the
 * test must exercise apiRequest plus the real response parser.
 */
const historicalUntitledTwoStepDetailPayload = {
  creationId: "f4ae6554-7b29-4747-a97f-d4ca81495ec5",
  workflowId: "75b121f4-9835-4343-a444-71f0434d5ca9",
  workflowName: "123",
  status: "SUCCEEDED",
  errorCode: null,
  errorMessage: null,
  recoveryState: "NONE",
  sourceModality: "TEXT_DESCRIPTION",
  sourcePaintingId: null,
  sourcePaintingTitle: null,
  sourcePaintingContentUrl: null,
  sourceAssetId: null,
  sourceText: "暮春江畔，渔船停在岸边",
  sourceAssetContentUrl: null,
  sourceAssetDownloadUrl: null,
  finalModality: "POEM",
  finalAssetId: null,
  finalAssetContentUrl: null,
  finalAssetDownloadUrl: null,
  finalText: "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声",
  finalPoem: {
    schemaVersion: "1",
    title: null,
    lines: ["孤舟系岸柳风轻", "远岫含烟水自清", "数点浮石分碧落", "一篱茅舍隐林声"],
    text: "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声",
  },
  createdAt: "2026-09-08T15:51:50.134Z",
  updatedAt: "2026-09-08T15:52:45.412Z",
  startedAt: "2026-09-08T15:51:50.295Z",
  finishedAt: "2026-09-08T15:52:45.412Z",
  retryVersion: 0,
  retryAvailable: false,
  retryBlockedReason: "CREATION_RETRY_NOT_AVAILABLE",
  executionAttemptCount: 1,
  steps: [
    {
      stepId: "f618abdb-fcc9-409b-8936-405366e7ce94",
      stepIndex: 0,
      nodeId: "step1",
      operation: "TEXT_TO_PAINTING",
      inputModality: "TEXT_DESCRIPTION",
      outputModality: "PAINTING",
      status: "SUCCEEDED",
      attemptCount: 1,
      errorCode: null,
      errorMessage: null,
      outputAssetId: "09af351f-e66c-4382-933f-264c213a517a",
      outputAssetContentUrl: "/api/v1/assets/09af351f-e66c-4382-933f-264c213a517a/content",
      outputAssetDownloadUrl: "/api/v1/assets/09af351f-e66c-4382-933f-264c213a517a/download",
      outputText: null,
      outputPoem: null,
      startedAt: "2026-09-08T15:51:50.295Z",
      finishedAt: "2026-09-08T15:52:41.867Z",
    },
    {
      stepId: "0de69fa3-47b0-457d-b3d9-47c09f06e269",
      stepIndex: 1,
      nodeId: "step2",
      operation: "PAINTING_TO_POEM",
      inputModality: "PAINTING",
      outputModality: "POEM",
      status: "SUCCEEDED",
      attemptCount: 1,
      errorCode: null,
      errorMessage: null,
      outputAssetId: null,
      outputAssetContentUrl: null,
      outputAssetDownloadUrl: null,
      outputText: "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声",
      outputPoem: {
        schemaVersion: "1",
        title: null,
        lines: ["孤舟系岸柳风轻", "远岫含烟水自清", "数点浮石分碧落", "一篱茅舍隐林声"],
        text: "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声",
      },
      startedAt: "2026-09-08T15:52:41.898Z",
      finishedAt: "2026-09-08T15:52:45.412Z",
    },
  ],
};

const historicalUntitledTwoStepListPayload = {
  items: [{
    creationId: historicalUntitledTwoStepDetailPayload.creationId,
    workflowId: historicalUntitledTwoStepDetailPayload.workflowId,
    workflowName: historicalUntitledTwoStepDetailPayload.workflowName,
    status: historicalUntitledTwoStepDetailPayload.status,
    errorCode: historicalUntitledTwoStepDetailPayload.errorCode,
    errorMessage: historicalUntitledTwoStepDetailPayload.errorMessage,
    recoveryState: historicalUntitledTwoStepDetailPayload.recoveryState,
    sourceModality: historicalUntitledTwoStepDetailPayload.sourceModality,
    sourcePaintingId: historicalUntitledTwoStepDetailPayload.sourcePaintingId,
    sourceAssetId: historicalUntitledTwoStepDetailPayload.sourceAssetId,
    finalModality: historicalUntitledTwoStepDetailPayload.finalModality,
    finalAssetId: historicalUntitledTwoStepDetailPayload.finalAssetId,
    finalAssetContentUrl: historicalUntitledTwoStepDetailPayload.finalAssetContentUrl,
    finalAssetDownloadUrl: historicalUntitledTwoStepDetailPayload.finalAssetDownloadUrl,
    createdAt: historicalUntitledTwoStepDetailPayload.createdAt,
    updatedAt: historicalUntitledTwoStepDetailPayload.updatedAt,
    startedAt: historicalUntitledTwoStepDetailPayload.startedAt,
    finishedAt: historicalUntitledTwoStepDetailPayload.finishedAt,
    retryVersion: historicalUntitledTwoStepDetailPayload.retryVersion,
    retryAvailable: historicalUntitledTwoStepDetailPayload.retryAvailable,
    retryBlockedReason: historicalUntitledTwoStepDetailPayload.retryBlockedReason,
    executionAttemptCount: historicalUntitledTwoStepDetailPayload.executionAttemptCount,
  }],
  page: 0,
  size: 12,
  totalElements: 1,
  totalPages: 1,
  first: true,
  last: true,
  hasNext: false,
};

describe("Studio API transport", () => {
  it("uploads once with the exact Spring multipart fields", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
      assert.equal(form.get("semanticType"), "IMAGE");
      assert.ok(form.get("file") instanceof Blob);
      return json(mediaAssetPayload, 201);
    };

    const file = new File([new Uint8Array([137, 80, 78, 71])], "source.png", { type: "image/png" });
    const result = await api.uploadImage(file, "IMAGE", "token");
    assert.equal(result.assetId, mediaAssetPayload.assetId);
    assert.equal(calls, 1);
  });

  it("keeps an uploaded painting distinct from a catalog painting identifier", async () => {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
      assert.equal(form.get("semanticType"), "PAINTING");
      return json({ ...mediaAssetPayload, semanticType: "PAINTING" }, 201);
    };

    const file = new File([new Uint8Array([255, 216, 255, 217])], "private-painting.jpg", { type: "image/jpeg" });
    const result = await api.uploadImage(file, "PAINTING", "token");
    assert.equal(result.assetId, mediaAssetPayload.assetId);
    assert.equal(result.semanticType, "PAINTING");
  });

  it("preserves structured upload failures", async () => {
    globalThis.fetch = async () => json({
      code: "INVALID_IMAGE",
      message: "图片内容无效或格式不受支持",
      correlationId: "upload-correlation",
      validationErrors: {},
    }, 400);
    const file = new File(["bad"], "bad.png", { type: "image/png" });

    await assert.rejects(
      api.uploadImage(file, "IMAGE", "token"),
      (caught) => caught instanceof ApiError
        && caught.code === "INVALID_IMAGE"
        && caught.correlationId === "upload-correlation",
    );
  });

  it("submits one exact Creation request and never replays an uncertain POST", async () => {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        workflowId: "11111111-1111-1111-1111-111111111111",
        source: { modality: "TEXT_DESCRIPTION", text: "山水" },
      });
      throw new TypeError("connection reset after send");
    };

    await assert.rejects(
      api.submitCreation({
        workflowId: "11111111-1111-1111-1111-111111111111",
        source: { modality: "TEXT_DESCRIPTION", text: "山水" },
      }, "token"),
      (caught) => caught instanceof ApiError && caught.kind === "network",
    );
    assert.equal(calls, 1);
  });

  it("parses a successful asynchronous Creation acknowledgement", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return json({
        creationId: "33333333-3333-3333-3333-333333333333",
        status: "QUEUED",
      }, 202);
    };
    const result = await api.submitCreation({
      workflowId: "11111111-1111-1111-1111-111111111111",
      source: { modality: "TEXT_DESCRIPTION", text: "山水" },
    }, "token");
    assert.equal(result.status, "QUEUED");
    assert.equal(calls, 1);
  });

  it("prevents duplicate entry while an explicit action is in flight", () => {
    const guard = new SingleFlightGuard();
    assert.equal(guard.enter(), true);
    assert.equal(guard.enter(), false);
    guard.leave();
    assert.equal(guard.enter(), true);
  });

  it("creates and updates an explicit workflow draft without submitting a Creation", async () => {
    const requests: Array<{ input: string; method: string; body: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({
        input: String(input),
        method: String(init?.method),
        body: JSON.parse(String(init?.body)),
      });
      return json({
        workflowId: "11111111-1111-1111-1111-111111111111",
        name: "草稿", description: null, schemaVersion: 2,
        sourceModality: "TEXT_DESCRIPTION", terminalModality: "TEXT_DESCRIPTION",
        nodeCount: 1, edgeCount: 0, operationSequence: [], status: "DRAFT", conversionRequired: false,
        graph: { schemaVersion: 2, nodes: [{ id: "source", kind: "SOURCE", outputModality: "TEXT_DESCRIPTION" }], edges: [] },
        createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
      }, 201);
    };
    const payload = {
      name: "草稿", description: null, status: "DRAFT" as const,
      graph: { schemaVersion: 2, nodes: [{ id: "source", kind: "SOURCE" as const, outputModality: "TEXT_DESCRIPTION" as const }], edges: [] },
    };
    await api.createWorkflow(payload, "token");
    await api.replaceWorkflow("11111111-1111-1111-1111-111111111111", payload, "token");
    assert.deepEqual(requests.map((request) => [request.method, request.input]), [
      ["POST", "http://localhost:5000/api/v1/me/workflows"],
      ["PUT", "http://localhost:5000/api/v1/me/workflows/11111111-1111-1111-1111-111111111111"],
    ]);
    assert.deepEqual(requests.map((request) => request.body), [payload, payload]);
  });

  it("sends retry eligibility data and idempotency header exactly once", async () => {
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls += 1;
      assert.match(String(input), /\/api\/v1\/creations\/33333333-3333-3333-3333-333333333333\/retry$/);
      assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "retry-key-1234567890");
      assert.deepEqual(JSON.parse(String(init?.body)), { expectedRetryVersion: 2 });
      return json({
        creationId: "33333333-3333-3333-3333-333333333333",
        status: "QUEUED",
        retryVersion: 3,
        executionAttemptNumber: 4,
        acceptedAt: "2026-09-01T00:00:00Z",
        idempotentReplay: false,
      }, 202);
    };

    const result = await api.retryCreation(
      "33333333-3333-3333-3333-333333333333",
      2,
      "retry-key-1234567890",
      "token",
    );
    assert.equal(result.status, "QUEUED");
    assert.equal(calls, 1);
  });

  it("normalizes 401 responses for session cleanup", async () => {
    globalThis.fetch = async () => json({ code: "UNAUTHORIZED", message: "登录状态已失效" }, 401);
    await assert.rejects(
      api.workflowCapabilities("expired-token"),
      (caught) => caught instanceof ApiError && caught.kind === "unauthorized",
    );
  });

  it("labels an invalid successful Creation-detail response without calling it a provider failure", async () => {
    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /\/api\/v1\/creations\/33333333-3333-3333-3333-333333333333$/);
      assert.equal(init?.method, undefined);
      return json({ creationId: "33333333-3333-3333-3333-333333333333" });
    };

    await assert.rejects(
      api.creation("33333333-3333-3333-3333-333333333333", "token"),
      (caught) => caught instanceof CreationResponseContractError
        && caught.endpoint === "detail"
        && caught.parserReason === "创作步骤缺失"
        && /上次成功读取/.test(errorMessage(caught)),
    );
  });

  it("labels an invalid successful Creation-list response with list-specific recovery guidance", async () => {
    globalThis.fetch = async (input) => {
      assert.match(String(input), /\/api\/v1\/me\/creations\?page=0&size=12$/);
      return json({ items: [] });
    };

    await assert.rejects(
      api.creations(0, 12, "token"),
      (caught) => caught instanceof CreationResponseContractError
        && caught.endpoint === "list"
        && caught.parserReason === "创作页码 缺失"
        && /我的作品列表/.test(errorMessage(caught)),
    );
  });

  it("transports the persisted untitled two-step result through both history and detail APIs", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/me/creations?page=0&size=12")) {
        return json(historicalUntitledTwoStepListPayload);
      }
      assert.match(url, /\/api\/v1\/creations\/f4ae6554-7b29-4747-a97f-d4ca81495ec5$/);
      return json(historicalUntitledTwoStepDetailPayload);
    };

    const page = await api.creations(0, 12, "token");
    const detail = await api.creation("f4ae6554-7b29-4747-a97f-d4ca81495ec5", "token");

    assert.equal(page.items[0]?.creationId, detail.creationId);
    assert.equal(detail.status, "SUCCEEDED");
    assert.equal(detail.sourceText, "暮春江畔，渔船停在岸边");
    assert.equal(detail.finalAssetId, null);
    assert.equal(detail.finalPoem?.title, null);
    assert.equal(detail.finalPoem?.schemaVersion, "1");
    assert.equal(detail.steps[0]?.outputAssetId, "09af351f-e66c-4382-933f-264c213a517a");
    assert.equal(detail.steps[1]?.outputPoem?.text, detail.finalPoem?.text);
  });
});
