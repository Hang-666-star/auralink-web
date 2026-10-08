import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  paintingToMusicAvailability,
  parseCreationDetail,
  parseMediaAsset,
  parseWorkflowCapabilities,
  parseWorkflowDetail,
  parseWorkflowPage,
  studioSubmitState,
  workflowAvailability,
} from "../lib/studio-contracts.ts";
import { poemTitleLabel } from "../lib/creation-poem.ts";

const readyOperation = {
  code: "TEXT_TO_PAINTING",
  displayName: "文字生画",
  inputModality: "TEXT_DESCRIPTION",
  outputModality: "PAINTING",
  definitionEnabled: true,
  executionAvailable: true,
  terminalOutput: true,
  availabilityReason: "READY_FOR_CONTROLLED_EXECUTION",
  providers: [{
    code: "seedream",
    displayName: "绘画引擎",
    definitionEnabled: true,
    executionAvailable: true,
    parameterSchema: {},
  }],
};

const workflowPayload = {
  workflowId: "11111111-1111-1111-1111-111111111111",
  name: "文字绘画",
  description: "真实工作流",
  schemaVersion: 1,
  sourceModality: "TEXT_DESCRIPTION",
  terminalModality: "PAINTING",
  nodeCount: 2,
  edgeCount: 1,
  graph: {
    schemaVersion: 2,
    nodes: [
      { id: "source", kind: "SOURCE", outputModality: "TEXT_DESCRIPTION" },
      {
        id: "step1", kind: "TRANSFORM", operation: "TEXT_TO_PAINTING",
        providerCode: "seedream", inputModality: "TEXT_DESCRIPTION", outputModality: "PAINTING", parameters: {},
      },
    ],
    edges: [{ from: "source", to: "step1" }],
  },
  operationSequence: ["TEXT_TO_PAINTING"],
  status: "ACTIVE",
  conversionRequired: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

describe("Studio workflow contracts", () => {
  it("parses capability, workflow page, and workflow detail responses", () => {
    const capabilities = parseWorkflowCapabilities({
      workflowSchemaVersion: 1,
      featureEnabled: true,
      sourceModalities: ["TEXT_DESCRIPTION", "IMAGE"],
      operations: [readyOperation],
    });
    const page = parseWorkflowPage({
      items: [workflowPayload],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
      first: true,
      last: true,
      hasNext: false,
    });
    const detail = parseWorkflowDetail(workflowPayload);

    assert.equal(capabilities.operations[0]?.executionAvailable, true);
    assert.equal(page.items[0]?.sourceModality, "TEXT_DESCRIPTION");
    assert.deepEqual(detail.operationSequence, ["TEXT_TO_PAINTING"]);
    assert.equal(workflowAvailability(capabilities, detail).available, true);
  });

  it("normalizes Spring LocalDateTime arrays in MediaAsset responses", () => {
    const asset = parseMediaAsset({
      assetId: "22222222-2222-2222-2222-222222222222",
      originalFilename: "source.png",
      mimeType: "image/png",
      fileSize: 79,
      width: 2,
      height: 2,
      durationSeconds: null,
      assetType: "IMAGE",
      semanticType: "IMAGE",
      sourceType: "USER_UPLOAD",
      visibility: "PRIVATE",
      status: "ACTIVE",
      contentUrl: "/api/v1/assets/22222222-2222-2222-2222-222222222222/content",
      downloadUrl: "/api/v1/assets/22222222-2222-2222-2222-222222222222/download",
      createdAt: [2026, 9, 1, 21, 9, 9, 737_088_065],
      updatedAt: [2026, 9, 1, 21, 9, 9],
    });

    assert.equal(asset.createdAt, "2026-09-01T21:09:09.737");
    assert.equal(asset.updatedAt, "2026-09-01T21:09:09");
  });

  it("treats missing and unknown readiness as unavailable", () => {
    const missing = parseWorkflowCapabilities({
      workflowSchemaVersion: 1,
      featureEnabled: true,
      sourceModalities: [],
      operations: [{ ...readyOperation, executionAvailable: undefined }],
    });
    const unknown = parseWorkflowCapabilities({
      workflowSchemaVersion: 1,
      featureEnabled: true,
      sourceModalities: [],
      operations: [{ ...readyOperation, executionAvailable: "READY" }],
    });
    const detail = parseWorkflowDetail(workflowPayload);

    assert.equal(missing.operations[0]?.executionAvailable, null);
    assert.equal(unknown.operations[0]?.executionAvailable, null);
    assert.equal(workflowAvailability(missing, detail).available, false);
    assert.equal(workflowAvailability(unknown, detail).available, false);
  });

  it("keeps a legal two-transform draft unavailable when the runtime admits only one step", () => {
    const capabilities = parseWorkflowCapabilities({
      workflowSchemaVersion: 2,
      featureEnabled: true,
      maxExecutionTransformSteps: 1,
      sourceModalities: ["TEXT_DESCRIPTION"],
      operations: [readyOperation],
    });
    const twoStep = parseWorkflowDetail({
      ...workflowPayload,
      operationSequence: ["TEXT_TO_PAINTING", "PAINTING_TO_POEM"],
    });

    const result = workflowAvailability(capabilities, twoStep);
    assert.equal(result.available, false);
    assert.match(result.reason, /最多支持 1 个转换步骤/);
  });

  it("admits an approved two-transform workflow when both ordered operations and the runtime cap are ready", () => {
    const paintingToPoem = {
      ...readyOperation,
      code: "PAINTING_TO_POEM",
      inputModality: "PAINTING",
      outputModality: "POEM",
      providers: [{ ...readyOperation.providers[0], code: "qwen3-vl-plus" }],
    };
    const capabilities = parseWorkflowCapabilities({
      workflowSchemaVersion: 2,
      featureEnabled: true,
      maxExecutionTransformSteps: 2,
      sourceModalities: ["TEXT_DESCRIPTION"],
      operations: [readyOperation, paintingToPoem],
    });
    const twoStep = parseWorkflowDetail({
      ...workflowPayload,
      operationSequence: ["TEXT_TO_PAINTING", "PAINTING_TO_POEM"],
    });

    assert.deepEqual(workflowAvailability(capabilities, twoStep), {
      available: true,
      reason: "后端已报告工作流可执行",
    });
  });

  it("does not submit a persisted workflow while its editor has unsaved changes", () => {
    const capabilities = parseWorkflowCapabilities({
      workflowSchemaVersion: 2,
      featureEnabled: true,
      sourceModalities: ["TEXT_DESCRIPTION"],
      operations: [readyOperation],
    });
    const workflow = parseWorkflowDetail(workflowPayload);
    const result = studioSubmitState({
      capabilities,
      workflow,
      text: "山水",
      paintingId: "",
      file: null,
      busy: false,
      uncertain: false,
      workflowDirty: true,
    });
    assert.equal(result.available, false);
    assert.match(result.reason, /尚未保存/);
  });

  it("disables PAINTING_TO_MUSIC for false, missing, unknown, and unavailable responses", () => {
    const cases = [
      null,
      parseWorkflowCapabilities({ workflowSchemaVersion: 1, featureEnabled: false, operations: [] }),
      parseWorkflowCapabilities({ workflowSchemaVersion: 1, featureEnabled: true, operations: [] }),
      parseWorkflowCapabilities({
        workflowSchemaVersion: 1,
        featureEnabled: true,
        operations: [{
          ...readyOperation,
          code: "PAINTING_TO_MUSIC",
          executionAvailable: false,
          availabilityReason: "PAINTING_TO_MUSIC_DEFERRED_NOT_VALIDATED",
        }],
      }),
      parseWorkflowCapabilities({
        workflowSchemaVersion: 1,
        featureEnabled: true,
        operations: [{ ...readyOperation, code: "PAINTING_TO_MUSIC", executionAvailable: "UNKNOWN" }],
      }),
    ];

    for (const capabilities of cases) {
      assert.equal(paintingToMusicAvailability(capabilities).available, false);
    }
  });

  it("keeps structurally legal combined music drafts unavailable to this direct-catalog runtime", () => {
    const music = {
      ...readyOperation,
      code: "PAINTING_TO_MUSIC",
      inputModality: "PAINTING",
      outputModality: "AUDIO",
      executionConstraint: "CATALOG_PAINTING_SINGLE_TRANSFORM_ONLY",
      providers: [{ ...readyOperation.providers[0], code: "auralink-vmm" }],
    };
    const capabilities = parseWorkflowCapabilities({
      workflowSchemaVersion: 2,
      featureEnabled: true,
      maxExecutionTransformSteps: 2,
      sourceModalities: ["TEXT_DESCRIPTION", "PAINTING"],
      operations: [readyOperation, music],
    });
    const combinedDraft = parseWorkflowDetail({
      ...workflowPayload,
      terminalModality: "AUDIO",
      operationSequence: ["TEXT_TO_PAINTING", "PAINTING_TO_MUSIC"],
    });
    const directCatalog = parseWorkflowDetail({
      ...workflowPayload,
      sourceModality: "PAINTING",
      terminalModality: "AUDIO",
      nodeCount: 2,
      edgeCount: 1,
      graph: {
        schemaVersion: 2,
        nodes: [
          { id: "source", kind: "SOURCE", outputModality: "PAINTING" },
          {
            id: "step1", kind: "TRANSFORM", operation: "PAINTING_TO_MUSIC",
            providerCode: "auralink-vmm", inputModality: "PAINTING", outputModality: "AUDIO",
            parameters: { durationSeconds: 23 },
          },
        ],
        edges: [{ from: "source", to: "step1" }],
      },
      operationSequence: ["PAINTING_TO_MUSIC"],
    });

    assert.equal(capabilities.operations[1]?.executionConstraint, "CATALOG_PAINTING_SINGLE_TRANSFORM_ONLY");
    assert.equal(workflowAvailability(capabilities, combinedDraft).available, false);
    assert.match(workflowAvailability(capabilities, combinedDraft).reason, /组合音乐流程/);
    assert.equal(workflowAvailability(capabilities, directCatalog).available, true);
  });

  it("keeps source snapshots and distinct persisted step outputs in the owner history projection", () => {
    const detail = parseCreationDetail({
      creationId: "33333333-3333-3333-3333-333333333333",
      workflowId: workflowPayload.workflowId,
      workflowName: "题画",
      status: "PARTIAL_SUCCESS",
      errorCode: null,
      errorMessage: null,
      recoveryState: "NONE",
      sourceModality: "TEXT_DESCRIPTION",
      sourcePaintingId: null,
      sourcePaintingTitle: null,
      sourcePaintingContentUrl: null,
      sourceAssetId: null,
      sourceText: "江上暮色",
      sourceAssetContentUrl: null,
      sourceAssetDownloadUrl: null,
      finalModality: null,
      finalAssetId: null,
      finalAssetContentUrl: null,
      finalAssetDownloadUrl: null,
      finalText: null,
      finalPoem: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      startedAt: null,
      finishedAt: null,
      retryVersion: 0,
      retryAvailable: false,
      retryBlockedReason: "CREATION_RETRY_NOT_AVAILABLE",
      executionAttemptCount: 1,
      steps: [
        {
          stepId: "44444444-4444-4444-4444-444444444444",
          stepIndex: 0,
          nodeId: "step1",
          operation: "TEXT_TO_PAINTING",
          inputModality: "TEXT_DESCRIPTION",
          outputModality: "PAINTING",
          status: "SUCCEEDED",
          attemptCount: 1,
          errorCode: null,
          errorMessage: null,
          outputAssetId: "55555555-5555-5555-5555-555555555555",
          outputAssetContentUrl: "/api/v1/assets/55555555-5555-5555-5555-555555555555/content",
          outputAssetDownloadUrl: "/api/v1/assets/55555555-5555-5555-5555-555555555555/download",
          outputText: null,
          outputPoem: null,
          startedAt: null,
          finishedAt: null,
        },
        {
          stepId: "66666666-6666-6666-6666-666666666666",
          stepIndex: 1,
          nodeId: "step2",
          operation: "PAINTING_TO_POEM",
          inputModality: "PAINTING",
          outputModality: "POEM",
          status: "FAILED",
          attemptCount: 1,
          errorCode: "SAFE_FAILURE",
          errorMessage: "本步未完成",
          outputAssetId: null,
          outputAssetContentUrl: null,
          outputAssetDownloadUrl: null,
          outputText: null,
          outputPoem: null,
          startedAt: null,
          finishedAt: null,
        },
      ],
    });

    assert.equal(detail.sourceText, "江上暮色");
    assert.equal(detail.steps[0]?.outputAssetContentUrl?.endsWith("/content"), true);
    assert.equal(detail.steps[1]?.nodeId, "step2");
    assert.equal(detail.steps[1]?.errorMessage, "本步未完成");
  });

  it("parses the actual untitled two-step Creation response without losing its private painting", () => {
    // This is the response contract emitted by the real CreationResponseMapper
    // for Creation f4ae6554-7b29-4747-a97f-d4ca81495ec5. The raw persistence
    // evidence has a valid nullable poem title and no terminal poem asset.
    const poem = {
      schemaVersion: "1",
      title: null,
      lines: ["孤舟系岸柳风轻", "远岫含烟水自清", "数点浮石分碧落", "一篱茅舍隐林声"],
      text: "孤舟系岸柳风轻\n远岫含烟水自清\n数点浮石分碧落\n一篱茅舍隐林声",
    };
    const detail = parseCreationDetail({
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
      finalText: poem.text,
      finalPoem: poem,
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
          outputText: poem.text,
          outputPoem: poem,
          startedAt: "2026-09-08T15:52:41.898Z",
          finishedAt: "2026-09-08T15:52:45.412Z",
        },
      ],
    });

    assert.equal(detail.status, "SUCCEEDED");
    assert.equal(detail.finalAssetId, null);
    assert.equal(detail.steps[0]?.outputAssetId, "09af351f-e66c-4382-933f-264c213a517a");
    assert.equal(detail.steps[1]?.outputPoem?.title, null);
    assert.equal(detail.finalPoem?.text, poem.text);
    assert.equal(poemTitleLabel(detail.steps[1]?.outputPoem?.title ?? null), "未题");
  });

  it("projects a persisted private music result and its exact server-validated duration", () => {
    const detail = parseCreationDetail({
      creationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      workflowId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      workflowName: "松风入乐",
      status: "SUCCEEDED",
      errorCode: null,
      errorMessage: null,
      recoveryState: "NONE",
      sourceModality: "PAINTING",
      sourcePaintingId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      sourcePaintingTitle: "松影钓船",
      sourcePaintingContentUrl: "/api/v1/assets/cccccccc-cccc-cccc-cccc-cccccccccccc/content",
      sourceAssetId: null,
      sourceText: null,
      sourceAssetContentUrl: null,
      sourceAssetDownloadUrl: null,
      finalModality: "AUDIO",
      finalAssetId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      finalAssetContentUrl: "/api/v1/assets/dddddddd-dddd-dddd-dddd-dddddddddddd/content",
      finalAssetDownloadUrl: "/api/v1/assets/dddddddd-dddd-dddd-dddd-dddddddddddd/download",
      finalText: null,
      finalPoem: null,
      createdAt: "2026-09-09T00:00:00Z",
      updatedAt: "2026-09-09T00:00:10Z",
      startedAt: "2026-09-09T00:00:01Z",
      finishedAt: "2026-09-09T00:00:10Z",
      retryVersion: 0,
      retryAvailable: false,
      retryBlockedReason: "CREATION_RETRY_NOT_AVAILABLE",
      executionAttemptCount: 1,
      steps: [{
        stepId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        stepIndex: 0,
        nodeId: "step1",
        operation: "PAINTING_TO_MUSIC",
        inputModality: "PAINTING",
        outputModality: "AUDIO",
        status: "SUCCEEDED",
        attemptCount: 1,
        errorCode: null,
        errorMessage: null,
        outputAssetId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        outputAssetContentUrl: "/api/v1/assets/dddddddd-dddd-dddd-dddd-dddddddddddd/content",
        outputAssetDownloadUrl: "/api/v1/assets/dddddddd-dddd-dddd-dddd-dddddddddddd/download",
        outputText: null,
        outputPoem: null,
        requestedDurationSeconds: 23,
        startedAt: "2026-09-09T00:00:01Z",
        finishedAt: "2026-09-09T00:00:10Z",
      }],
    });

    assert.equal(detail.steps[0]?.requestedDurationSeconds, 23);
    assert.equal(detail.steps[0]?.outputModality, "AUDIO");
    assert.equal(detail.steps[0]?.outputAssetContentUrl?.endsWith("/content"), true);
    assert.equal(detail.finalAssetId, detail.steps[0]?.outputAssetId);
  });

  it("still rejects a malformed non-string poem title", () => {
    assert.throws(() => parseCreationDetail({
      creationId: "44444444-4444-4444-4444-444444444444",
      workflowId: null, workflowName: null, status: "SUCCEEDED", errorCode: null, errorMessage: null,
      recoveryState: "NONE", sourceModality: "TEXT_DESCRIPTION", sourcePaintingId: null,
      sourcePaintingTitle: null, sourcePaintingContentUrl: null, sourceAssetId: null, sourceText: "x",
      sourceAssetContentUrl: null, sourceAssetDownloadUrl: null, finalModality: "POEM", finalAssetId: null,
      finalAssetContentUrl: null, finalAssetDownloadUrl: null, finalText: null,
      finalPoem: { schemaVersion: "1", title: 7, lines: ["一", "二", "三", "四"], text: "一\n二\n三\n四" },
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", startedAt: null,
      finishedAt: null, retryVersion: 0, retryAvailable: false, retryBlockedReason: null,
      executionAttemptCount: 1, steps: [],
    }), /诗歌标题 缺失/);
  });

  it("requires an explicit nullable poem title field", () => {
    assert.throws(() => parseCreationDetail({
      creationId: "55555555-5555-5555-5555-555555555555",
      workflowId: null, workflowName: null, status: "SUCCEEDED", errorCode: null, errorMessage: null,
      recoveryState: "NONE", sourceModality: "TEXT_DESCRIPTION", sourcePaintingId: null,
      sourcePaintingTitle: null, sourcePaintingContentUrl: null, sourceAssetId: null, sourceText: "x",
      sourceAssetContentUrl: null, sourceAssetDownloadUrl: null, finalModality: "POEM", finalAssetId: null,
      finalAssetContentUrl: null, finalAssetDownloadUrl: null, finalText: null,
      finalPoem: { schemaVersion: "1", lines: ["一", "二", "三", "四"], text: "一\n二\n三\n四" },
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", startedAt: null,
      finishedAt: null, retryVersion: 0, retryAvailable: false, retryBlockedReason: null,
      executionAttemptCount: 1, steps: [],
    }), /诗歌标题 缺失/);
  });
});
