import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedNextOperations,
  appendEditorOperation,
  editorCanActivate,
  emptyWorkflowEditor,
  musicDurationForEditor,
  removeEditorTransform,
  repeatedWorkflowNodeTypeMessage,
  setEditorMusicDuration,
  setEditorSource,
  workflowDefinitionFromEditor,
} from "../lib/workflow-editor.ts";
import type { WorkflowCapabilities } from "../lib/types.ts";

const capabilities: WorkflowCapabilities = {
  workflowSchemaVersion: 2,
  featureEnabled: true,
  maxVisibleCards: 3,
  maxTransformSteps: 2,
  maxExecutionTransformSteps: 2,
  sourceModalities: ["TEXT_DESCRIPTION", "POEM", "IMAGE", "PAINTING"],
  operations: [
    {
      code: "PAINTING_TO_MUSIC", displayName: "绘画转音乐", inputModality: "PAINTING",
      outputModality: "AUDIO", definitionEnabled: true, draftEnabled: true,
      executionAvailable: false, terminalOutput: true, availabilityReason: "disabled",
      providers: [{ code: "auralink-vmm", displayName: "VMM", definitionEnabled: true, executionAvailable: false, parameterSchema: {} }],
    },
    {
      code: "TEXT_TO_PAINTING", displayName: "文字转绘画", inputModality: "TEXT_DESCRIPTION",
      outputModality: "PAINTING", definitionEnabled: true, draftEnabled: true,
      executionAvailable: false, terminalOutput: false, availabilityReason: "disabled",
      providers: [{ code: "seedream-5", displayName: "Seedream", definitionEnabled: true, executionAvailable: false, parameterSchema: {} }],
    },
    {
      code: "POEM_TO_PAINTING", displayName: "诗词转绘画", inputModality: "POEM",
      outputModality: "PAINTING", definitionEnabled: true, draftEnabled: true,
      executionAvailable: false, terminalOutput: false, availabilityReason: "disabled",
      providers: [{ code: "qwen3vl-seedream5", displayName: "Qwen + Seedream", definitionEnabled: true, executionAvailable: false, parameterSchema: {} }],
    },
    {
      code: "IMAGE_TO_PAINTING", displayName: "图像转绘画", inputModality: "IMAGE",
      outputModality: "PAINTING", definitionEnabled: true, draftEnabled: true,
      executionAvailable: false, terminalOutput: false, availabilityReason: "disabled",
      providers: [{ code: "seedream-5", displayName: "Seedream", definitionEnabled: true, executionAvailable: false, parameterSchema: {} }],
    },
    {
      code: "PAINTING_TO_POEM", displayName: "绘画转诗", inputModality: "PAINTING",
      outputModality: "POEM", definitionEnabled: true, draftEnabled: true,
      executionAvailable: false, terminalOutput: true, availabilityReason: "disabled",
      providers: [{ code: "qwen3-vl-plus", displayName: "Qwen", definitionEnabled: true, executionAvailable: false, parameterSchema: {} }],
    },
    {
      code: "PAINTING_TO_VIDEO", displayName: "绘画转视频", inputModality: "PAINTING",
      outputModality: "VIDEO", definitionEnabled: false, draftEnabled: true,
      executionAvailable: false, terminalOutput: true, availabilityReason: "RESERVED_FOR_FUTURE_IMPLEMENTATION",
      providers: [{ code: "reserved-video", displayName: "Reserved video", definitionEnabled: false, executionAvailable: false, parameterSchema: {} }],
    },
  ],
};

const operation = (code: string) => capabilities.operations.find((item) => item.code === code)!;

test("TEXT_DESCRIPTION → PAINTING → POEM is a two-step valid editor chain", () => {
  let state = setEditorSource("TEXT_DESCRIPTION");
  state = appendEditorOperation(state, operation("TEXT_TO_PAINTING"), capabilities);
  state = appendEditorOperation(state, operation("PAINTING_TO_POEM"), capabilities);

  assert.equal(editorCanActivate(state), true);
  assert.deepEqual(allowedNextOperations(state, capabilities), []);
  const request = workflowDefinitionFromEditor(state, capabilities, "题诗", "", "ACTIVE");
  assert.equal(request.graph.nodes.length, 3);
  assert.deepEqual(request.graph.edges, [{ from: "source", to: "step1" }, { from: "step1", to: "step2" }]);
});

test("source replacement and intermediate deletion remove dependent successors", () => {
  let state = setEditorSource("TEXT_DESCRIPTION");
  state = appendEditorOperation(state, operation("TEXT_TO_PAINTING"), capabilities);
  state = appendEditorOperation(state, operation("PAINTING_TO_POEM"), capabilities);
  state = removeEditorTransform(state, 0);
  assert.deepEqual(state.operations, []);

  state = setEditorSource("TEXT_DESCRIPTION");
  assert.deepEqual(state.operations, []);
  assert.deepEqual(allowedNextOperations(state, capabilities).map((item) => item.code), ["TEXT_TO_PAINTING"]);
});

test("source-only and reserved video are drafts only", () => {
  const sourceOnly = setEditorSource("PAINTING");
  assert.equal(editorCanActivate(sourceOnly), false);
  assert.equal(workflowDefinitionFromEditor(sourceOnly, capabilities, "草稿", "", "DRAFT").graph.nodes.length, 1);
  assert.throws(() => workflowDefinitionFromEditor(sourceOnly, capabilities, "草稿", "", "ACTIVE"));

  const video = appendEditorOperation(sourceOnly, operation("PAINTING_TO_VIDEO"), capabilities);
  assert.equal(editorCanActivate(video), false);
  assert.equal(workflowDefinitionFromEditor(video, capabilities, "视频草稿", "", "DRAFT").graph.nodes.length, 2);
  assert.throws(() => workflowDefinitionFromEditor(video, capabilities, "视频草稿", "", "ACTIVE"));
});

test("a repeated product node type cannot be appended even when the operation input matches", () => {
  let state = setEditorSource("POEM");
  state = appendEditorOperation(state, operation("POEM_TO_PAINTING"), capabilities);
  assert.deepEqual(allowedNextOperations(state, capabilities).map((item) => item.code), [
    "PAINTING_TO_MUSIC",
    "PAINTING_TO_VIDEO",
  ]);
  assert.throws(
    () => appendEditorOperation(state, operation("PAINTING_TO_POEM"), capabilities),
    new Error(repeatedWorkflowNodeTypeMessage("POEM")),
  );
  assert.deepEqual(emptyWorkflowEditor(), { sourceModality: null, operations: [], operationParameters: {} });
});

test("music duration is retained in a schema-v2 draft and is never silently clamped", () => {
  let state = setEditorSource("PAINTING");
  state = appendEditorOperation(state, operation("PAINTING_TO_MUSIC"), capabilities);
  assert.equal(musicDurationForEditor(state, 0), 10);
  state = setEditorMusicDuration(state, 0, 23);
  assert.equal(musicDurationForEditor(state, 0), 23);
  const request = workflowDefinitionFromEditor(state, capabilities, "音乐草稿", "", "DRAFT");
  assert.deepEqual(request.graph.nodes[1]?.parameters, { durationSeconds: 23 });
  assert.throws(() => setEditorMusicDuration(state, 0, 31));
});
