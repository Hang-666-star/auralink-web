"use client";

import {
  allowedNextOperations,
  appendEditorOperation,
  removeEditorTransform,
  setEditorSource,
  type WorkflowEditorState,
} from "@/lib/workflow-editor";
import type { WorkflowCapabilities, WorkflowModality } from "@/lib/types";

const modalityLabels: Record<WorkflowModality, string> = {
  TEXT_DESCRIPTION: "文字描述",
  POEM: "诗词原文",
  IMAGE: "图片",
  PAINTING: "馆藏画作",
  AUDIO: "音乐",
  VIDEO: "视频",
};

type Props = {
  capabilities: WorkflowCapabilities | null;
  value: WorkflowEditorState;
  disabled?: boolean;
  onChange: (value: WorkflowEditorState) => void;
};

export function WorkflowEditor({ capabilities, value, disabled = false, onChange }: Props) {
  const next = allowedNextOperations(value, capabilities);
  const sourceChoices = (capabilities?.sourceModalities ?? []) as WorkflowModality[];

  return (
    <fieldset className="workflow-editor" disabled={disabled}>
      <legend>顺序工作流</legend>
      <label>
        <span>源卡片</span>
        <select
          value={value.sourceModality ?? ""}
          onChange={(event) => onChange(setEditorSource((event.target.value || null) as WorkflowModality | null))}
        >
          <option value="">请选择一种输入</option>
          {sourceChoices.map((modality) => <option key={modality} value={modality}>{modalityLabels[modality]}</option>)}
        </select>
      </label>

      {value.sourceModality ? (
        <ol className="workflow-card-list" aria-label="工作流卡片">
          <li className="workflow-card"><strong>源</strong><span>{modalityLabels[value.sourceModality]}</span></li>
          {value.operations.map((operation, index) => (
            <li className="workflow-card" key={`${operation.code}-${index}`}>
              <div><strong>转换 {index + 1}</strong><span>{operation.displayName}</span></div>
              <button type="button" className="button" onClick={() => onChange(removeEditorTransform(value, index))}>移除此步及后续</button>
              {operation.executionAvailable !== true ? <small>{operation.availabilityReason || "当前不可执行，可保存为草稿"}</small> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {value.sourceModality && next.length > 0 ? (
        <label>
          <span>追加转换</span>
          <select
            value=""
            onChange={(event) => {
              const operation = next.find((candidate) => candidate.code === event.target.value);
              if (operation) onChange(appendEditorOperation(value, operation, capabilities));
            }}
          >
            <option value="">请选择合法下一步</option>
            {next.map((operation) => <option key={operation.code} value={operation.code}>{operation.displayName}</option>)}
          </select>
        </label>
      ) : null}
      {value.sourceModality && value.operations.length === 0 ? <small>源卡片可保存为草稿，但不能提交创作。</small> : null}
    </fieldset>
  );
}
