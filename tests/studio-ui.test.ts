import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  creationRetryAvailable,
  parseWorkflowCapabilities,
  parseWorkflowDetail,
  studioSubmitState,
} from "../lib/studio-contracts.ts";

const workflow = parseWorkflowDetail({
  workflowId: "11111111-1111-1111-1111-111111111111",
  name: "文字绘画",
  description: null,
  schemaVersion: 2,
  sourceModality: "TEXT_DESCRIPTION",
  terminalModality: "PAINTING",
  nodeCount: 2,
  edgeCount: 1,
  graph: {
    schemaVersion: 2,
    nodes: [
      { id: "source", kind: "SOURCE", outputModality: "TEXT_DESCRIPTION" },
      {
        id: "transform-1",
        kind: "TRANSFORM",
        outputModality: "PAINTING",
        operation: "TEXT_TO_PAINTING",
        providerCode: "comfyui",
        inputModality: "TEXT_DESCRIPTION",
        parameters: {},
      },
    ],
    edges: [{ from: "source", to: "transform-1" }],
  },
  operationSequence: ["TEXT_TO_PAINTING"],
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
});

const capabilities = parseWorkflowCapabilities({
  workflowSchemaVersion: 2,
  featureEnabled: true,
  maxVisibleCards: 3,
  maxTransformSteps: 2,
  maxExecutionTransformSteps: 1,
  sourceModalities: ["TEXT_DESCRIPTION"],
  operations: [{
    code: "TEXT_TO_PAINTING",
    displayName: "文字生画",
    inputModality: "TEXT_DESCRIPTION",
    outputModality: "PAINTING",
    definitionEnabled: true,
    draftEnabled: true,
    executionAvailable: true,
    terminalOutput: true,
    availabilityReason: "READY_FOR_CONTROLLED_EXECUTION",
    providers: [],
  }],
});

describe("Studio UI state", () => {
  it("keeps submit disabled until the real source input is present", () => {
    const empty = studioSubmitState({ capabilities, workflow, text: "", paintingId: "", file: null, busy: false, uncertain: false });
    const ready = studioSubmitState({ capabilities, workflow, text: "云山烟树", paintingId: "", file: null, busy: false, uncertain: false });
    assert.equal(empty.available, false);
    assert.equal(ready.available, true);
  });

  it("disables submission while busy and after an uncertain POST", () => {
    const busy = studioSubmitState({ capabilities, workflow, text: "云山", paintingId: "", file: null, busy: true, uncertain: false });
    const uncertain = studioSubmitState({ capabilities, workflow, text: "云山", paintingId: "", file: null, busy: false, uncertain: true });
    assert.equal(busy.available, false);
    assert.match(uncertain.reason, /核对/);
  });

  it("fails safely when backend feature readiness is unknown", () => {
    const unknownCapabilities = parseWorkflowCapabilities({
      workflowSchemaVersion: 2,
      featureEnabled: "UNKNOWN",
      operations: [],
    });
    const state = studioSubmitState({
      capabilities: unknownCapabilities,
      workflow,
      text: "云山",
      paintingId: "",
      file: null,
      busy: false,
      uncertain: false,
    });
    assert.equal(state.available, false);
  });

  it("shows retry only for backend-approved terminal failure states", () => {
    assert.equal(creationRetryAvailable({ status: "FAILED", retryAvailable: true }), true);
    assert.equal(creationRetryAvailable({ status: "PARTIAL_SUCCESS", retryAvailable: true }), true);
    assert.equal(creationRetryAvailable({ status: "FAILED", retryAvailable: false }), false);
    assert.equal(creationRetryAvailable({ status: "RUNNING", retryAvailable: true }), false);
    assert.equal(creationRetryAvailable({ status: "FUTURE_STATE", retryAvailable: true }), false);
  });
});
