import { API_BASE_URL } from './config.ts';
import { toApiError } from './api.ts';
import { terminal, type Run } from './assistant-contracts.ts';
export type AssistantEvent = { event: string; sequence: number; runId: string; branchId: string; text?: string; state?: string; retrieval?: Record<string, unknown>; executionUncertain?: boolean };
const eventsAllowed = new Set(['run.accepted', 'retrieval.status', 'citation', 'message.delta', 'message.snapshot', 'choice', 'usage', 'run.state']);
const statesAllowed = new Set(['QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
const frameLimit = 1048576;
const encoder = new TextEncoder();
function parseEvent(raw: string): AssistantEvent | null {
  if (encoder.encode(raw).byteLength > frameLimit) throw new Error('Assistant 流帧超出上限。');
  const lines = raw.split(/\r?\n/);
  const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
  if (!data) return null;
  const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
  const id = lines.find(line => line.startsWith('id:'))?.slice(3).trim();
  const value = JSON.parse(data);
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.contractVersion !== 1
    || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || String(value.sequence) !== id
    || typeof value.runId !== 'string' || !value.runId || typeof value.branchId !== 'string' || !value.branchId
    || !eventsAllowed.has(event)) throw new Error('Assistant 事件身份不完整。');
  if ((event === 'message.delta' || event === 'message.snapshot') && typeof value.text !== 'string') throw new Error('Assistant 流正文格式无效。');
  if (['message.snapshot', 'run.state', 'run.accepted'].includes(event) && !statesAllowed.has(value.state)) throw new Error('Assistant 流状态无效。');
  if (value.state !== undefined && !['message.snapshot', 'run.state', 'run.accepted'].includes(event)) throw new Error('Assistant 流状态与事件不一致。');
  if (value.executionUncertain !== undefined && typeof value.executionUncertain !== 'boolean') throw new Error('Assistant 流状态无效。');
  if (value.retrieval !== undefined && (!value.retrieval || typeof value.retrieval !== 'object' || Array.isArray(value.retrieval))) throw new Error('Assistant 检索状态格式无效。');
  return { event, sequence: value.sequence, runId: value.runId, branchId: value.branchId, text: value.text,
    state: value.state, retrieval: value.retrieval, executionUncertain: value.executionUncertain };
}
/** UTF-8 and frame boundaries are independent of HTTP chunk boundaries. */
export class AssistantEventDecoder {
  private decoder = new TextDecoder('utf-8', { fatal: true });
  private buffer = '';
  push(bytes: Uint8Array, final = false): AssistantEvent[] {
    this.buffer += this.decoder.decode(bytes, { stream: !final });
    const events: AssistantEvent[] = [];
    while (true) {
      const match = /\r?\n\r?\n/.exec(this.buffer); if (!match || match.index === undefined) break;
      const raw = this.buffer.slice(0, match.index); this.buffer = this.buffer.slice(match.index + match[0].length);
      const event = parseEvent(raw); if (event) events.push(event);
    }
    if (encoder.encode(this.buffer).byteLength > frameLimit) throw new Error('Assistant 流帧超出上限。');
    // EOF cannot advance a partially delivered frame or manufacture a terminal state.
    return events;
  }
}
export function applyAssistantEvent(run: Run, event: AssistantEvent): Run {
  if (event.runId !== run.id || event.branchId !== run.branchId) throw new Error('Assistant 流来源不匹配。');
  if (event.sequence <= run.sequence) return run;
  if (event.event !== 'message.snapshot' && event.sequence !== run.sequence + 1) throw new Error('Assistant 流序号缺失，请读取已保存状态。');
  return { ...run, sequence: event.sequence,
    checkpoint: event.event === 'message.snapshot' ? event.text || '' : event.event === 'message.delta' ? run.checkpoint + (event.text || '') : run.checkpoint,
    status: event.state || run.status, retrieval: event.retrieval || run.retrieval, executionUncertain: event.executionUncertain ?? run.executionUncertain };
}
export async function subscribeAssistant(run: Run, token: string, signal: AbortSignal, onRun: (run: Run) => void): Promise<Run> {
  const response = await fetch(`${API_BASE_URL}/api/v1/assistant/runs/${encodeURIComponent(run.id)}/events?after=${run.sequence}`, { cache: 'no-store', headers: { Accept: 'text/event-stream,application/json', Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Assistant 流响应不可用。');
  const reader = response.body.getReader(); const decoder = new AssistantEventDecoder(); let current = run;
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      for (const event of decoder.push(value || new Uint8Array(), done)) { current = applyAssistantEvent(current, event); onRun(current); }
      if (done || terminal(current.status)) break;
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return current; // Caller performs a status GET; EOF never marks COMPLETED.
}
