import { apiRequest, toApiError } from './api.ts';
import { API_BASE_URL } from './config.ts';
import { parsePage, validateAssistantResponse, type Page } from './assistant-contracts.ts';
const base = '/api/v1/assistant';
export async function assistantRequest<T>(path: string, token: string, signal?: AbortSignal, method = 'GET', payload?: unknown): Promise<T> {
  const value = await apiRequest<T>(`${base}${path}`, { token, signal, method, cache: 'no-store', ...(payload !== undefined ? { body: payload instanceof FormData ? payload : JSON.stringify(payload) } : {}) });
  validateAssistantResponse(path, value); return value;
}
export async function assistantPage<T>(path: string, token: string, signal?: AbortSignal, cursor?: string | null): Promise<Page<T>> {
  return parsePage<T>(await assistantRequest(`${path}${path.includes('?') ? '&' : '?'}limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, token, signal));
}
export async function exportAssistant(id: string, format: 'json' | 'csv', history: boolean, token: string, signal: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}${base}/sessions/${encodeURIComponent(id)}/export?format=${format}&includeHistory=${history}`, { cache: 'no-store', headers: { Accept: 'application/json,text/csv', Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw toApiError(response.status, await response.json().catch(() => null));
  return response.blob();
}
/** Only opaque keys/fingerprints are retained in sessionStorage. Never bodies, images or tokens. */
export type PendingOperation = { key: string; fingerprint: string };
export class OperationLedger {
  private pending = new Map<string, PendingOperation>();
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, private namespace = 'assistant.operation') {}
  entries(): [string, PendingOperation][] {
    try { const scopes = JSON.parse(this.storage?.getItem(`${this.namespace}:index`) || '[]'); if (Array.isArray(scopes)) for (const scope of scopes) { if (typeof scope !== 'string') continue; const record = JSON.parse(this.storage?.getItem(`${this.namespace}:${scope}`) || 'null'); if (record && typeof record.key === 'string' && /^[0-9a-f]{64}$/.test(record.fingerprint)) this.pending.set(scope, record); } } catch { /* Minimal metadata only. */ }
    return [...this.pending.entries()];
  }
  async key(scope: string, payload: unknown): Promise<string> {
    const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))))].map(x => x.toString(16).padStart(2, '0')).join('');
    let old = this.pending.get(scope);
    if (!old && this.storage) { try { const saved = JSON.parse(this.storage.getItem(`${this.namespace}:${scope}`) || 'null'); if (saved && typeof saved.key === 'string' && /^[0-9a-f]{64}$/.test(saved.fingerprint)) old = saved; } catch { /* Storage may be disabled. */ } }
    if (old && old.fingerprint !== fingerprint) throw new Error('上一请求的结果尚未确认。请先刷新记录，并用原内容重试；不能更换请求键绕过冲突。');
    const record = old || { key: crypto.randomUUID(), fingerprint };
    this.pending.set(scope, record); try { this.storage?.setItem(`${this.namespace}:${scope}`, JSON.stringify(record)); this.storage?.setItem(`${this.namespace}:index`, JSON.stringify([...new Set([...this.entries().map(([name]) => name), scope])])); } catch { /* In-memory retry remains available. */ }
    return record.key;
  }
  resolved(scope: string) { this.pending.delete(scope); try { this.storage?.removeItem(`${this.namespace}:${scope}`); this.storage?.setItem(`${this.namespace}:index`, JSON.stringify(this.entries().map(([name]) => name).filter(name => name !== scope))); } catch { /* No private content stored. */ } }
}

/** Core's configured cap can be lower; its absolute permitted maximum is 10 MiB. */
export async function assistantImageFingerprint(file: Pick<File, 'type' | 'size' | 'arrayBuffer'>): Promise<string> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('当前只支持 JPEG 和 PNG 图片，不支持 WebP。');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MiB；服务端可能设置更低上限。');
  const bytes = await file.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
