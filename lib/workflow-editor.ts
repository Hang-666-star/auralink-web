import type {
  WorkflowCapabilities,
  WorkflowDefinitionInput,
  WorkflowDetail,
  WorkflowGraph,
  WorkflowLifecycleStatus,
  WorkflowModality,
  WorkflowOperationCapability,
} from "./types.ts";

export type WorkflowEditorState = {
  sourceModality: WorkflowModality | null;
  operations: WorkflowOperationCapability[];
  /** Parameters are keyed by the stable sequential transform node ID. */
  operationParameters: Record<string, Record<string, unknown>>;
};

export const emptyWorkflowEditor = (): WorkflowEditorState => ({
  sourceModality: null,
  operations: [],
  operationParameters: {},
});

export function setEditorSource(
  sourceModality: WorkflowModality | null,
): WorkflowEditorState {
  return { sourceModality, operations: [], operationParameters: {} };
}

export function allowedNextOperations(
  state: WorkflowEditorState,
  capabilities: WorkflowCapabilities | null,
): WorkflowOperationCapability[] {
  if (!state.sourceModality || !capabilities) return [];
  const current = state.operations.at(-1)?.outputModality ?? state.sourceModality;
  if (state.operations.at(-1)?.terminalOutput === true) return [];
  if (state.operations.length >= (capabilities.maxTransformSteps ?? 2)) return [];
  const usedNodeTypes = workflowNodeTypes(state);
  return capabilities.operations.filter((operation) =>
    operation.draftEnabled === true
      && operation.inputModality === current
      && !usedNodeTypes.has(operation.outputModality as WorkflowModality),
  );
}

/** Visible workflow card types: SOURCE output, then each transform output. */
export function workflowNodeTypes(state: WorkflowEditorState): Set<WorkflowModality> {
  const nodeTypes = new Set<WorkflowModality>();
  if (state.sourceModality) nodeTypes.add(state.sourceModality);
  state.operations.forEach((operation) => nodeTypes.add(operation.outputModality as WorkflowModality));
  return nodeTypes;
}

const WORKFLOW_NODE_TYPE_LABELS: Record<WorkflowModality, string> = {
  TEXT_DESCRIPTION: "文字",
  POEM: "古诗",
  IMAGE: "图像",
  PAINTING: "国画",
  AUDIO: "音乐",
  VIDEO: "视频",
};

export function repeatedWorkflowNodeTypeMessage(modality: WorkflowModality): string {
  return `同一流程不能重复使用${WORKFLOW_NODE_TYPE_LABELS[modality]}节点。`;
}

export function appendEditorOperation(
  state: WorkflowEditorState,
  operation: WorkflowOperationCapability,
  capabilities: WorkflowCapabilities | null,
): WorkflowEditorState {
  if (workflowNodeTypes(state).has(operation.outputModality as WorkflowModality)) {
    throw new Error(repeatedWorkflowNodeTypeMessage(operation.outputModality as WorkflowModality));
  }
  if (!allowedNextOperations(state, capabilities).some((candidate) => candidate.code === operation.code)) {
    throw new Error("该转换不能连接到当前顺序工作流。");
  }
  return { ...state, operations: [...state.operations, operation] };
}

/** Removing a transform deliberately removes every dependent successor. */
export function removeEditorTransform(
  state: WorkflowEditorState,
  index: number,
): WorkflowEditorState {
  if (index < 0 || index >= state.operations.length) return state;
  const retained = state.operations.slice(0, index);
  return {
    ...state,
    operations: retained,
    operationParameters: Object.fromEntries(
      retained.map((_, retainedIndex) => {
        const key = `step${retainedIndex + 1}`;
        return [key, state.operationParameters[key] ?? {}];
      }),
    ),
  };
}

/**
 * The VMM adapter remains unavailable for execution this round, but the
 * reviewed duration preference is part of the schema-v2 draft definition.
 * Reject instead of clamping so the editor never silently changes intent.
 */
export function setEditorMusicDuration(
  state: WorkflowEditorState,
  index: number,
  durationSeconds: number,
): WorkflowEditorState {
  const operation = state.operations[index];
  if (!operation || operation.code !== "PAINTING_TO_MUSIC") {
    throw new Error("只能为音乐节点设置音乐时长。");
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 3 || durationSeconds > 30) {
    throw new Error("设定音乐时长必须在 3 到 30 秒之间。");
  }
  return {
    ...state,
    operationParameters: {
      ...state.operationParameters,
      [`step${index + 1}`]: { durationSeconds },
    },
  };
}

export function musicDurationForEditor(state: WorkflowEditorState, index: number): number {
  const value = state.operationParameters[`step${index + 1}`]?.durationSeconds;
  return typeof value === "number" && Number.isInteger(value) && value >= 3 && value <= 30
    ? value
    : 10;
}

export function editorCanActivate(state: WorkflowEditorState): boolean {
  return state.sourceModality !== null
    && state.operations.length > 0
    && state.operations.every((operation) => operation.definitionEnabled === true);
}

export function workflowDefinitionFromEditor(
  state: WorkflowEditorState,
  capabilities: WorkflowCapabilities | null,
  name: string,
  description: string,
  status: WorkflowLifecycleStatus,
): WorkflowDefinitionInput {
  if (!state.sourceModality || !capabilities?.workflowSchemaVersion) {
    throw new Error("请选择工作流源卡片后再保存。");
  }
  if (status === "ACTIVE" && !editorCanActivate(state)) {
    throw new Error("当前工作流只能保存为草稿，不能设为可用工作流。");
  }
  const graph: WorkflowGraph = {
    schemaVersion: capabilities.workflowSchemaVersion,
    nodes: [
      { id: "source", kind: "SOURCE", outputModality: state.sourceModality },
      ...state.operations.map((operation, index) => {
        const provider = operation.providers[0];
        if (!provider) throw new Error("后端未提供该转换的批准绑定。");
        return {
          id: `step${index + 1}`,
          kind: "TRANSFORM" as const,
          operation: operation.code as WorkflowDefinitionInput["graph"]["nodes"][number]["operation"],
          providerCode: provider.code,
          inputModality: operation.inputModality as WorkflowModality,
          outputModality: operation.outputModality as WorkflowModality,
          parameters: state.operationParameters[`step${index + 1}`] ?? {},
        };
      }),
    ],
    edges: state.operations.map((_, index) => ({
      from: index === 0 ? "source" : `step${index}`,
      to: `step${index + 1}`,
    })),
  };
  return {
    name,
    description: description.trim() || null,
    status,
    graph,
  };
}

export function editorFromWorkflow(
  workflow: WorkflowDetail,
  capabilities: WorkflowCapabilities | null,
): WorkflowEditorState | null {
  const source = workflow.graph.nodes.find((node) => node.kind === "SOURCE");
  if (!source) return null;
  const operations = workflow.graph.nodes
    .filter((node) => node.kind === "TRANSFORM")
    .map((node) => capabilities?.operations.find((operation) => operation.code === node.operation))
    .filter((operation): operation is WorkflowOperationCapability => Boolean(operation));
  if (operations.length !== workflow.operationSequence.length) return null;
  const operationParameters = Object.fromEntries(
    workflow.graph.nodes
      .filter((node) => node.kind === "TRANSFORM")
      .map((node, index) => [`step${index + 1}`, node.parameters ?? {}]),
  );
  return { sourceModality: source.outputModality, operations, operationParameters };
}
