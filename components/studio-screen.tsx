"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreationRunHistory, CreationStepOutput } from "@/components/creation-run-history";
import { StatePanel } from "@/components/state-panel";
import { useSession } from "@/components/session-provider";
import { WorkflowDesigner } from "@/components/workflow-designer";
import { api, ApiError, errorMessage, isAbortError } from "@/lib/api";
import { classifyCreationStatus, pollCreation, type PollOutcome } from "@/lib/creation-polling";
import { resolveMediaUrl } from "@/lib/media";
import { SingleFlightGuard } from "@/lib/studio-contracts";
import {
  editorCanActivate,
  editorFromWorkflow,
  emptyWorkflowEditor,
  musicDurationForEditor,
  setEditorMusicDuration,
  workflowDefinitionFromEditor,
  type WorkflowEditorState,
} from "@/lib/workflow-editor";
import type {
  CreationDetail,
  CreationPage,
  CreationSource,
  MediaAsset,
  PaintingPage,
  PaintingSummary,
  WorkflowCapabilities,
  WorkflowDetail,
  WorkflowLifecycleStatus,
  WorkflowOperationCapability,
  WorkflowPage,
} from "@/lib/types";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CREATION_PAGE_SIZE = 12;

type PollUiState = "idle" | "polling" | "timeout" | "unknown" | "error";
type ActionPhase = "idle" | "savingWorkflow" | "uploading" | "submitting";
type NamePromptMode = "save" | "execute" | null;
type PaintingInput =
  | { kind: "catalog"; painting: PaintingSummary }
  | { kind: "upload"; file: File }
  | null;

const statusLabels: Record<string, string> = {
  QUEUED: "已排队",
  RUNNING: "创作中",
  SUCCEEDED: "已完成",
  PARTIAL_SUCCESS: "部分完成",
  FAILED: "未完成",
};

const modalityLabels: Record<string, string> = {
  TEXT_DESCRIPTION: "文字描述",
  POEM: "古诗输入",
  IMAGE: "图像输入",
  PAINTING: "国画输入",
  AUDIO: "音乐",
  VIDEO: "视频",
};

function displayTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function useFilePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return url;
}

function userFacingAvailability(
  editor: WorkflowEditorState,
  capabilities: WorkflowCapabilities | null,
  sourceIssue: string | null,
  painting: PaintingInput,
): string | null {
  if (!editor.sourceModality) return "请先选择一种输入。";
  if (sourceIssue) return sourceIssue;
  if (editor.operations.length === 0) return "请至少添加一个创作步骤；仅输入可以保存为流程草稿。";
  if (!editorCanActivate(editor)) {
    return editor.operations.some((operation) => operation.code === "PAINTING_TO_VIDEO")
      ? "视频节点暂未开放，只能保存为流程草稿。"
      : "当前流程还不能执行。";
  }
  if (editor.operations.length > (capabilities?.maxExecutionTransformSteps ?? 2)) {
    return "当前运行环境最多支持两个转换步骤；这个组合可保存为流程草稿。";
  }
  if (capabilities?.featureEnabled !== true) return "创作服务当前未开放，仍可保存和编辑流程。";
  if (editor.operations.some((operation) => operation.code === "PAINTING_TO_MUSIC")) {
    if (editor.operations.length !== 1 || editor.sourceModality !== "PAINTING") {
      return "本轮音乐创作仅支持从画廊选择一幅国画后直接生成音乐；组合音乐流程仍可保存为草稿。";
    }
    if (painting?.kind !== "catalog") {
      return "本轮音乐创作仅支持从画廊选择一幅国画；上传国画和生成国画暂不能用于音乐。";
    }
  }
  if (editor.operations.some((operation) => operation.executionAvailable !== true)) {
    return "当前流程所需的创作服务暂未开放，仍可保存流程。";
  }
  return null;
}

function sourceIssueFor(
  editor: WorkflowEditorState,
  text: string,
  imageFile: File | null,
  painting: PaintingInput,
): string | null {
  switch (editor.sourceModality) {
    case "TEXT_DESCRIPTION":
      return text.trim() ? null : "请填写文字描述。";
    case "POEM":
      return text.trim() ? null : "请填写古诗内容。";
    case "IMAGE":
      return imageFile ? null : "请选择一张图像。";
    case "PAINTING":
      return painting ? null : "请选择一幅国画。";
    default:
      return "请先选择一种输入。";
  }
}

export function StudioScreen() {
  const { token, sessionIdentity, signOutIfCurrent } = useSession();
  const [capabilities, setCapabilities] = useState<WorkflowCapabilities | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowPage | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetail | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowEditor, setWorkflowEditor] = useState<WorkflowEditorState>(emptyWorkflowEditor);
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(null);
  const [workflowSaveUncertain, setWorkflowSaveUncertain] = useState(false);
  const [namePrompt, setNamePrompt] = useState<NamePromptMode>(null);
  const [pendingWorkflowName, setPendingWorkflowName] = useState("");
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);

  const [creationPage, setCreationPage] = useState<CreationPage | null>(null);
  const [creationPageNumber, setCreationPageNumber] = useState(0);
  const [selectedCreation, setSelectedCreation] = useState<CreationDetail | null>(null);
  const [textSource, setTextSource] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [paintingInput, setPaintingInput] = useState<PaintingInput>(null);
  const [uploadedImage, setUploadedImage] = useState<{ file: File; asset: MediaAsset } | null>(null);
  const [uploadedPainting, setUploadedPainting] = useState<{ file: File; asset: MediaAsset } | null>(null);
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryChoices, setGalleryChoices] = useState<PaintingPage | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingCreations, setLoadingCreations] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPhase, setActionPhase] = useState<ActionPhase>("idle");
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [pollState, setPollState] = useState<PollUiState>("idle");
  const [creationReadStale, setCreationReadStale] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const paintingUploadRef = useRef<HTMLInputElement | null>(null);
  const discoveryController = useRef<AbortController | null>(null);
  const workflowController = useRef<AbortController | null>(null);
  const workflowSaveController = useRef<AbortController | null>(null);
  const creationsController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const pollController = useRef<AbortController | null>(null);
  const hasCreationSnapshot = useRef(false);
  const actionGuard = useRef(new SingleFlightGuard());
  const workflowSaveGuard = useRef(new SingleFlightGuard());
  const imagePreview = useFilePreview(imageFile);
  const paintingPreview = useFilePreview(paintingInput?.kind === "upload" ? paintingInput.file : null);

  const handleSessionError = useCallback((caught: unknown): boolean => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") {
      signOutIfCurrent(sessionIdentity);
      return true;
    }
    return false;
  }, [sessionIdentity, signOutIfCurrent]);

  const stopPolling = useCallback(() => {
    pollController.current?.abort();
    pollController.current = null;
    setPollState("idle");
  }, []);

  const abortForInputChange = useCallback(() => {
    actionController.current?.abort();
    actionController.current = null;
    stopPolling();
    setActionError(null);
  }, [stopPolling]);

  const resetSourceInputs = useCallback(() => {
    setTextSource("");
    setImageFile(null);
    setPaintingInput(null);
    setUploadedImage(null);
    setUploadedPainting(null);
    setShowGalleryPicker(false);
  }, []);

  useEffect(() => () => {
    discoveryController.current?.abort();
    workflowController.current?.abort();
    workflowSaveController.current?.abort();
    creationsController.current?.abort();
    detailController.current?.abort();
    actionController.current?.abort();
    pollController.current?.abort();
  }, []);

  useEffect(() => {
    if (!token) {
      discoveryController.current?.abort();
      workflowController.current?.abort();
      workflowSaveController.current?.abort();
      creationsController.current?.abort();
      detailController.current?.abort();
      actionController.current?.abort();
      stopPolling();
      return;
    }
    const controller = new AbortController();
    discoveryController.current?.abort();
    discoveryController.current = controller;
    setLoadingDiscovery(true);
    setDiscoveryError(null);
    void Promise.all([
      api.workflowCapabilities(token, controller.signal),
      api.workflows(0, 100, token, controller.signal),
    ]).then(([capabilityResult, workflowResult]) => {
      if (controller.signal.aborted) return;
      setCapabilities(capabilityResult);
      setWorkflows(workflowResult);
    }).catch((caught) => {
      if (isAbortError(caught) || controller.signal.aborted) return;
      handleSessionError(caught);
      setDiscoveryError(errorMessage(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingDiscovery(false);
    });
    return () => controller.abort();
  }, [handleSessionError, stopPolling, token]);

  useEffect(() => {
    if (!token || !selectedWorkflowId) {
      setSelectedWorkflow(null);
      return;
    }
    const controller = new AbortController();
    workflowController.current?.abort();
    workflowController.current = controller;
    setLoadingWorkflows(true);
    setSelectedWorkflow(null);
    void api.workflow(selectedWorkflowId, token, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSelectedWorkflow(result);
      })
      .catch((caught) => {
        if (isAbortError(caught) || controller.signal.aborted) return;
        handleSessionError(caught);
        setWorkflowSaveError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWorkflows(false);
      });
    return () => controller.abort();
  }, [handleSessionError, selectedWorkflowId, token]);

  useEffect(() => {
    if (!selectedWorkflow) return;
    const restored = editorFromWorkflow(selectedWorkflow, capabilities);
    if (!restored) return;
    setWorkflowName(selectedWorkflow.name);
    setWorkflowEditor(restored);
    resetSourceInputs();
    setWorkflowSaveError(selectedWorkflow.conversionRequired
      ? "这个历史流程含有重复或不兼容的节点类型，请删除不兼容节点后保存。"
      : null);
    setWorkflowSaveUncertain(false);
    setWorkflowDirty(false);
  }, [capabilities, resetSourceInputs, selectedWorkflow]);

  const refreshCreations = useCallback(async () => {
    if (!token) return;
    const controller = new AbortController();
    creationsController.current?.abort();
    creationsController.current = controller;
    setLoadingCreations(true);
    setCreationError(null);
    try {
      const result = await api.creations(creationPageNumber, CREATION_PAGE_SIZE, token, controller.signal);
      if (!controller.signal.aborted) {
        hasCreationSnapshot.current = true;
        setCreationPage(result);
        setCreationReadStale(false);
      }
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return;
      handleSessionError(caught);
      setCreationError(errorMessage(caught, "暂时无法读取我的作品。请稍后重试。"));
      setCreationReadStale(hasCreationSnapshot.current);
    } finally {
      if (!controller.signal.aborted) setLoadingCreations(false);
    }
  }, [creationPageNumber, handleSessionError, token]);

  useEffect(() => {
    void refreshCreations();
    return () => creationsController.current?.abort();
  }, [refreshCreations]);

  const applyPolledDetail = useCallback((detail: CreationDetail) => {
    hasCreationSnapshot.current = true;
    setSelectedCreation(detail);
    setCreationReadStale(false);
    setCreationPage((current) => current ? {
      ...current,
      items: current.items.map((item) => item.creationId === detail.creationId ? detail : item),
    } : current);
  }, []);

  const finishPolling = useCallback((outcome: PollOutcome) => {
    if (outcome.kind === "terminal") {
      setPollState("idle");
      void refreshCreations();
      return;
    }
    if (outcome.kind === "unknown") {
      setPollState("unknown");
      setCreationError("作品状态暂时无法识别，已停止自动刷新。请稍后重新读取详情。");
      setCreationReadStale(hasCreationSnapshot.current);
      return;
    }
    if (outcome.kind === "timeout") {
      setPollState("timeout");
      setCreationError("作品状态更新等待时间已到，请稍后重新读取详情。");
      setCreationReadStale(hasCreationSnapshot.current);
      return;
    }
    if (outcome.kind === "error") {
      setPollState("error");
      handleSessionError(outcome.error);
      setCreationError(errorMessage(outcome.error, "暂时无法读取创作状态。请稍后点击“刷新详情”重试。"));
      setCreationReadStale(hasCreationSnapshot.current);
    }
  }, [handleSessionError, refreshCreations]);

  const startPolling = useCallback((creationId: string) => {
    if (!token) return;
    pollController.current?.abort();
    const controller = new AbortController();
    pollController.current = controller;
    setPollState("polling");
    setCreationError(null);
    void pollCreation({
      signal: controller.signal,
      getDetail: (signal) => api.creation(creationId, token, signal),
      onUpdate: applyPolledDetail,
    }).then((outcome) => {
      if (pollController.current !== controller || outcome.kind === "aborted") return;
      pollController.current = null;
      finishPolling(outcome);
    });
  }, [applyPolledDetail, finishPolling, token]);

  const openCreation = useCallback(async (creationId: string) => {
    if (!token) return;
    stopPolling();
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setCreationError(null);
    try {
      const detail = await api.creation(creationId, token, controller.signal);
      if (controller.signal.aborted) return;
      hasCreationSnapshot.current = true;
      setSelectedCreation(detail);
      setCreationReadStale(false);
      if (classifyCreationStatus(detail.status) === "active") startPolling(creationId);
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return;
      handleSessionError(caught);
      setCreationError(errorMessage(caught, "暂时无法读取创作详情。请稍后点击“刷新详情”重试。"));
      setCreationReadStale(hasCreationSnapshot.current);
    }
  }, [handleSessionError, startPolling, stopPolling, token]);

  const refreshWorkflowList = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.workflows(0, 100, token);
      setWorkflows(result);
      setWorkflowSaveUncertain(false);
      setWorkflowSaveError(null);
    } catch (caught) {
      handleSessionError(caught);
      setWorkflowSaveError(errorMessage(caught));
    }
  }, [handleSessionError, token]);

  const updateEditor = useCallback((next: WorkflowEditorState) => {
    if (next.sourceModality !== workflowEditor.sourceModality) {
      abortForInputChange();
      resetSourceInputs();
    }
    setWorkflowEditor(next);
    setWorkflowDirty(true);
    setWorkflowSaveError(null);
  }, [abortForInputChange, resetSourceInputs, workflowEditor.sourceModality]);

  const newWorkflow = useCallback(() => {
    abortForInputChange();
    workflowController.current?.abort();
    setSelectedWorkflowId("");
    setSelectedWorkflow(null);
    setWorkflowName("");
    setWorkflowEditor(emptyWorkflowEditor());
    resetSourceInputs();
    setWorkflowSaveError(null);
    setWorkflowSaveUncertain(false);
    setWorkflowDirty(false);
    setShowWorkflowPicker(false);
  }, [abortForInputChange, resetSourceInputs]);

  const openWorkflow = useCallback((workflowId: string) => {
    abortForInputChange();
    workflowController.current?.abort();
    setSelectedWorkflowId(workflowId);
    setShowWorkflowPicker(false);
  }, [abortForInputChange]);

  const saveWorkflow = useCallback(async (
    status: WorkflowLifecycleStatus,
    name: string,
    preserveActionPhase = false,
  ): Promise<WorkflowDetail | null> => {
    if (!token || !workflowSaveGuard.current.enter()) return null;
    const controller = new AbortController();
    workflowSaveController.current?.abort();
    workflowSaveController.current = controller;
    setWorkflowSaveError(null);
    let requestStarted = false;
    try {
      const payload = workflowDefinitionFromEditor(workflowEditor, capabilities, name, "", status);
      setActionPhase("savingWorkflow");
      requestStarted = true;
      const saved = selectedWorkflow
        ? await api.replaceWorkflow(selectedWorkflow.workflowId, payload, token, controller.signal)
        : await api.createWorkflow(payload, token, controller.signal);
      if (controller.signal.aborted) return null;
      setSelectedWorkflow(saved);
      setSelectedWorkflowId(saved.workflowId);
      setWorkflowName(saved.name);
      setWorkflowSaveUncertain(false);
      setWorkflowDirty(false);
      const list = await api.workflows(0, 100, token, controller.signal);
      if (!controller.signal.aborted) setWorkflows(list);
      return saved;
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return null;
      if (requestStarted && caught instanceof ApiError && caught.kind === "network") {
        setWorkflowSaveUncertain(true);
        setWorkflowSaveError("保存结果暂时无法确认。为避免重复保存，请先重新读取流程列表。");
      } else {
        handleSessionError(caught);
        setWorkflowSaveError(errorMessage(caught));
      }
      return null;
    } finally {
      if (workflowSaveController.current === controller) workflowSaveController.current = null;
      if (!preserveActionPhase) setActionPhase("idle");
      workflowSaveGuard.current.leave();
    }
  }, [capabilities, handleSessionError, selectedWorkflow, token, workflowEditor]);

  const requestSave = () => {
    if (!workflowEditor.sourceModality) return;
    if (selectedWorkflow) {
      void saveWorkflow("DRAFT", selectedWorkflow.name);
      return;
    }
    setPendingWorkflowName(workflowName || "未命名流程");
    setNamePrompt("save");
  };

  const sourceIssue = sourceIssueFor(workflowEditor, textSource, imageFile, paintingInput);
  const executionDisabledReason = userFacingAvailability(workflowEditor, capabilities, sourceIssue, paintingInput);

  const createSource = async (
    controller: AbortController,
    sourceModality: WorkflowEditorState["sourceModality"],
  ): Promise<CreationSource> => {
    if (!token || !sourceModality) throw new Error("请先选择一种输入。");
    if (sourceModality === "TEXT_DESCRIPTION" || sourceModality === "POEM") {
      return { modality: sourceModality, text: textSource };
    }
    if (sourceModality === "IMAGE") {
      if (!imageFile) throw new Error("请选择一张图像。");
      if (imageFile.size > MAX_UPLOAD_BYTES) throw new Error("图像超过允许的 10 MiB 上限。");
      let asset = uploadedImage?.file === imageFile ? uploadedImage.asset : null;
      if (!asset) {
        setActionPhase("uploading");
        asset = await api.uploadImage(imageFile, "IMAGE", token, controller.signal);
        setUploadedImage({ file: imageFile, asset });
      }
      return { modality: "IMAGE", assetId: asset.assetId };
    }
    if (!paintingInput) throw new Error("请选择一幅国画。");
    if (paintingInput.kind === "catalog") {
      return { modality: "PAINTING", paintingId: paintingInput.painting.paintingId };
    }
    if (paintingInput.file.size > MAX_UPLOAD_BYTES) throw new Error("国画图片超过允许的 10 MiB 上限。");
    let asset = uploadedPainting?.file === paintingInput.file ? uploadedPainting.asset : null;
    if (!asset) {
      setActionPhase("uploading");
      asset = await api.uploadImage(paintingInput.file, "PAINTING", token, controller.signal);
      setUploadedPainting({ file: paintingInput.file, asset });
    }
    return { modality: "PAINTING", assetId: asset.assetId };
  };

  async function executeWorkflow(nameOverride?: string) {
    const name = (nameOverride ?? selectedWorkflow?.name ?? workflowName).trim();
    if (!token || !actionGuard.current.enter()) return;
    if (!name) {
      actionGuard.current.leave();
      setPendingWorkflowName("未命名流程");
      setNamePrompt("execute");
      return;
    }
    if (executionDisabledReason) {
      actionGuard.current.leave();
      setActionError(executionDisabledReason);
      return;
    }
    const controller = new AbortController();
    actionController.current?.abort();
    actionController.current = controller;
    setActionError(null);
    let creationPostStarted = false;
    try {
      // Persist and activate the exact graph the user sees before any per-run upload or submit.
      const saved = await saveWorkflow("ACTIVE", name, true);
      if (!saved || controller.signal.aborted) return;
      const source = await createSource(controller, workflowEditor.sourceModality);
      if (controller.signal.aborted) return;
      setActionPhase("submitting");
      creationPostStarted = true;
      const acknowledgement = await api.submitCreation({ workflowId: saved.workflowId, source }, token, controller.signal);
      if (controller.signal.aborted) return;
      setSubmissionUncertain(false);
      await refreshCreations();
      startPolling(acknowledgement.creationId);
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) return;
      if (creationPostStarted && caught instanceof ApiError && caught.kind === "network") {
        setSubmissionUncertain(true);
        setActionError("创作提交结果暂时无法确认。为避免重复创作，本页不会再次提交；请在“我的作品”中核对。");
      } else {
        handleSessionError(caught);
        setActionError(errorMessage(caught));
      }
    } finally {
      if (actionController.current === controller) actionController.current = null;
      setActionPhase("idle");
      actionGuard.current.leave();
    }
  }

  const submitNamePrompt = () => {
    const name = pendingWorkflowName.trim();
    if (!name) return;
    setWorkflowName(name);
    const mode = namePrompt;
    setNamePrompt(null);
    if (mode === "execute") {
      void executeWorkflow(name);
    } else {
      void saveWorkflow("DRAFT", name);
    }
  };

  const requestClear = () => {
    const meaningful = Boolean(workflowDirty || textSource || imageFile || paintingInput);
    if (meaningful && !window.confirm("清空当前未保存的工作流内容？已保存的流程和作品不会被删除。")) return;
    newWorkflow();
  };

  const loadGalleryChoices = useCallback(async () => {
    setGalleryLoading(true);
    setGalleryError(null);
    try {
      const result = await api.paintings({ keyword: gallerySearch, page: 0, size: 12 }, token);
      setGalleryChoices(result);
    } catch (caught) {
      handleSessionError(caught);
      setGalleryError(errorMessage(caught));
    } finally {
      setGalleryLoading(false);
    }
  }, [gallerySearch, handleSessionError, token]);

  const selectedRunStep = useCallback((index: number) => {
    if (workflowDirty || !selectedCreation || selectedCreation.workflowId !== selectedWorkflowId) return null;
    return selectedCreation.steps.find((step) => step.nodeId === `step${index + 1}`) ?? null;
  }, [selectedCreation, selectedWorkflowId, workflowDirty]);

  const sourceBody = useMemo(() => {
    const disabled = actionPhase !== "idle" || workflowSaveUncertain;
    if (workflowEditor.sourceModality === "TEXT_DESCRIPTION") {
      return <label className="workflow-input-label"><span>画面描述</span><textarea
        value={textSource}
        maxLength={20_000}
        disabled={disabled}
        onChange={(event) => { abortForInputChange(); setTextSource(event.target.value); }}
        placeholder="例如：暮春江岸，远山隐约，渔舟停在松影与薄雾之间。"
      /><small>{textSource.length} / 20,000</small></label>;
    }
    if (workflowEditor.sourceModality === "POEM") {
      return <label className="workflow-input-label"><span>古诗内容</span><textarea
        value={textSource}
        maxLength={20_000}
        disabled={disabled}
        onChange={(event) => { abortForInputChange(); setTextSource(event.target.value); }}
        placeholder={"明月松间照，\n清泉石上流。"}
      /><small>会保留换行；文件不会写入流程定义。</small></label>;
    }
    if (workflowEditor.sourceModality === "IMAGE") {
      return <div className="workflow-image-input">
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png" hidden disabled={disabled}
          onChange={(event) => { abortForInputChange(); setImageFile(event.target.files?.[0] ?? null); setUploadedImage(null); }} />
        {imagePreview ? <>
          <img src={imagePreview} alt="待使用的图像输入预览" />
          <a href={imagePreview} target="_blank" rel="noreferrer">放大查看</a>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => imageInputRef.current?.click()}>更换图像</button>
        </> : <button className="workflow-drop-zone" type="button" disabled={disabled}
          onClick={() => imageInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0] ?? null;
            if (file) { abortForInputChange(); setImageFile(file); setUploadedImage(null); }
          }}
        >点击或拖放图像<br /><small>JPEG / PNG，执行时才会上传</small></button>}</div>;
    }
    if (workflowEditor.sourceModality === "PAINTING") {
      const catalog = paintingInput?.kind === "catalog" ? paintingInput.painting : null;
      return <div className="workflow-painting-input">
        <input ref={paintingUploadRef} type="file" accept="image/jpeg,image/png" hidden disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (!file) return;
            abortForInputChange();
            setPaintingInput({ kind: "upload", file });
            setUploadedPainting(null);
            setShowGalleryPicker(false);
          }} />
        {catalog ? <>
          {catalog.image?.contentUrl ? <img src={resolveMediaUrl(catalog.image.contentUrl) || ""} alt={catalog.title || "已选国画"} /> : null}
          <strong>{catalog.title || "未题画作"}</strong><small>{catalog.authorName || "作者信息暂无"}</small>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => setPaintingInput(null)}>更换国画</button>
        </> : paintingPreview ? <>
          <img src={paintingPreview} alt="待使用的本地国画预览" />
          <a href={paintingPreview} target="_blank" rel="noreferrer">放大查看</a>
          <small>这幅国画会在执行时作为你的私有输入上传。</small>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => paintingUploadRef.current?.click()}>更换国画</button>
        </> : <div className="workflow-painting-actions">
          <button className="button" type="button" disabled={disabled} onClick={() => paintingUploadRef.current?.click()}>上传国画</button>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => { setShowGalleryPicker(true); void loadGalleryChoices(); }}>从画廊选择</button>
        </div>}
        {showGalleryPicker ? <div className="gallery-picker">
          <form onSubmit={(event) => { event.preventDefault(); void loadGalleryChoices(); }}>
            <label><span className="sr-only">搜索画廊</span><input value={gallerySearch} onChange={(event) => setGallerySearch(event.target.value)} placeholder="搜索画作或作者" /></label>
            <button className="button" type="submit" disabled={galleryLoading}>搜索</button>
          </form>
          {galleryError ? <p className="inline-error" role="alert">{galleryError}</p> : null}
          <div className="gallery-picker-results">
            {galleryChoices?.items.map((painting) => <button key={painting.paintingId} type="button" onClick={() => {
              abortForInputChange(); setPaintingInput({ kind: "catalog", painting }); setShowGalleryPicker(false);
            }}><span>{painting.title || "未题画作"}</span><small>{painting.authorName || "作者信息暂无"}</small></button>)}
          </div>
        </div> : null}
      </div>;
    }
    return null;
  }, [abortForInputChange, actionPhase, galleryChoices, galleryError, galleryLoading, gallerySearch, imagePreview, loadGalleryChoices, paintingInput, paintingPreview, showGalleryPicker, textSource, workflowEditor.sourceModality, workflowSaveUncertain]);

  const operationBody = useCallback((operation: WorkflowOperationCapability, index: number) => {
    const result = selectedRunStep(index);
    if (result?.status === "SUCCEEDED") return <CreationStepOutput step={result} />;
    if (operation.code === "PAINTING_TO_MUSIC") {
      const duration = musicDurationForEditor(workflowEditor, index);
      return <label className="workflow-duration"><span>设定音乐时长 <output>{duration} 秒</output></span><input
        type="range" min="3" max="30" step="1" value={duration}
        disabled={actionPhase !== "idle" || workflowSaveUncertain}
        onChange={(event) => {
          try { updateEditor(setEditorMusicDuration(workflowEditor, index, Number(event.target.value))); }
          catch (caught) { setWorkflowSaveError(errorMessage(caught)); }
        }}
      /><small>3–30 秒。生成结果会按保存的时长进行校验。</small></label>;
    }
    if (operation.code === "PAINTING_TO_VIDEO") return <p className="workflow-node-waiting">暂未开放</p>;
    if (operation.code === "PAINTING_TO_POEM") return <p className="workflow-node-waiting">完成后将在这里显示本轮生成的诗词。</p>;
    return <p className="workflow-node-waiting">完成后将在这里显示本轮生成的国画。</p>;
  }, [actionPhase, selectedRunStep, updateEditor, workflowEditor, workflowSaveUncertain]);

  if (loadingDiscovery) return <StatePanel kind="loading" title="正在准备工作流设计器" description="正在读取你的流程与可用功能。" />;
  if (discoveryError && !capabilities) return <StatePanel kind="error" title="工作流暂时无法显示" description={discoveryError} />;

  return (
    <div className="studio-layout studio-layout-redesigned">
      <WorkflowDesigner
        capabilities={capabilities}
        value={workflowEditor}
        disabled={actionPhase !== "idle" || workflowSaveUncertain}
        dirty={workflowDirty}
        saving={actionPhase === "savingWorkflow"}
        executionDisabledReason={executionDisabledReason}
        sourceBody={sourceBody}
        operationBody={operationBody}
        onChange={updateEditor}
        onSave={requestSave}
        onOpen={() => setShowWorkflowPicker((current) => !current)}
        onExecute={() => void executeWorkflow()}
        onClear={requestClear}
      />

      {showWorkflowPicker ? <section className="workflow-small-panel glass-panel" aria-label="打开已保存流程">
        <header><h3>打开流程</h3><button className="button button-quiet" type="button" onClick={newWorkflow}>新建流程</button></header>
        {loadingWorkflows ? <p>正在读取流程…</p> : null}
        {workflows?.items.length ? <ul>{workflows.items.map((workflow) => <li key={workflow.workflowId}>
          <button type="button" onClick={() => openWorkflow(workflow.workflowId)}>
            <strong>{workflow.name}</strong><span>{workflow.status === "DRAFT" ? "草稿" : "可执行流程"} · {modalityLabels[workflow.sourceModality]} → {modalityLabels[workflow.terminalModality]}</span>
          </button>
        </li>)}</ul> : <p>还没有保存的流程。</p>}
        {workflowSaveUncertain ? <button className="button" type="button" onClick={() => void refreshWorkflowList()}>重新读取流程</button> : null}
      </section> : null}

      {namePrompt ? <section className="workflow-name-dialog glass-panel" role="dialog" aria-modal="true" aria-labelledby="workflow-name-title">
        <h3 id="workflow-name-title">为流程命名</h3>
        <p>名称只用于识别这条创作路径。</p>
        <label><span className="sr-only">流程名称</span><input autoFocus value={pendingWorkflowName} maxLength={120}
          onChange={(event) => setPendingWorkflowName(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); submitNamePrompt(); }
          }} /></label>
        <div><button className="button button-quiet" type="button" onClick={() => setNamePrompt(null)}>返回</button><button className="button button-primary" type="button" disabled={!pendingWorkflowName.trim()} onClick={submitNamePrompt}>保存</button></div>
      </section> : null}

      {workflowSaveError ? <p className="inline-error studio-wide-error" role="alert">{workflowSaveError}</p> : null}
      {actionError ? <p className="inline-error studio-wide-error" role="alert">{actionError}</p> : null}
      {submissionUncertain ? <p className="studio-reason studio-wide-error" role="status">提交结果未确认；请在“我的作品”中读取实际状态后再继续。</p> : null}

      <section className="studio-creations" aria-labelledby="my-creations-title">
        <div className="section-heading section-heading-left studio-list-heading">
          <div><h2 id="my-creations-title">我的作品</h2><p>每一条记录保存本轮输入和每一步实际产出的结果。</p></div>
          <button className="button" type="button" disabled={loadingCreations} onClick={() => void refreshCreations()}>刷新</button>
        </div>
        {creationError ? <p className="inline-error" role="alert">{creationError}</p> : null}
        {creationReadStale ? <p className="studio-reason" role="status">当前卡片与详情展示的是上次成功读取的状态，可能已经更新；请使用“刷新”或“刷新详情”核对。</p> : null}
        {loadingCreations && !creationPage ? <StatePanel kind="loading" title="正在读取我的作品" /> : null}
        {creationPage?.items.length ? <>
          <div className="creation-grid">
            {creationPage.items.map((creation) => <button className="creation-card glass-panel" type="button" key={creation.creationId} onClick={() => void openCreation(creation.creationId)}>
              <span className={`creation-status status-${creation.status.toLowerCase()}`}>{statusLabels[creation.status] || "状态待确认"}</span>
              <h3>{creation.workflowName || "未命名流程"}</h3>
              <p>{modalityLabels[creation.sourceModality] || "输入"} → {modalityLabels[creation.finalModality || ""] || "等待结果"}</p>
              <time>{displayTime(creation.updatedAt)}</time>
            </button>)}
          </div>
          <nav className="pagination" aria-label="我的作品分页">
            <button className="button" type="button" disabled={creationPage.first} onClick={() => setCreationPageNumber((current) => Math.max(0, current - 1))}>上一页</button>
            <span>第 {creationPage.page + 1} / {Math.max(creationPage.totalPages, 1)} 页</span>
            <button className="button" type="button" disabled={creationPage.last} onClick={() => setCreationPageNumber((current) => current + 1)}>下一页</button>
          </nav>
        </> : !loadingCreations ? <StatePanel kind="empty" title="还没有作品" description="保存流程不会创建作品；提交成功后，每一轮创作都会在这里显示。" /> : null}
      </section>

      {selectedCreation ? <section className="creation-detail glass-panel" aria-labelledby="creation-detail-title">
        <header className="studio-section-header">
          <div><span>本轮创作</span><h2 id="creation-detail-title">{selectedCreation.workflowName || "创作详情"}</h2><p>{displayTime(selectedCreation.createdAt)}</p></div>
          <span className={`creation-status status-${selectedCreation.status.toLowerCase()}`}>{statusLabels[selectedCreation.status] || "状态待确认"}</span>
        </header>
        {pollState === "polling" ? <p className="polling-note" aria-live="polite">正在等待本轮步骤状态更新。</p> : null}
        <CreationRunHistory creation={selectedCreation} />
        {selectedCreation.errorMessage ? <p className="inline-error" role="alert">{selectedCreation.errorMessage}</p> : null}
        <div className="creation-detail-actions"><button className="button" type="button" onClick={() => void openCreation(selectedCreation.creationId)}>刷新详情</button></div>
      </section> : null}
    </div>
  );
}
