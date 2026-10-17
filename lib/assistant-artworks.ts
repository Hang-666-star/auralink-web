import { ApiError } from './api.ts';
import type { ArtworkReference } from './assistant-contracts.ts';
import type { OperationLedger } from './assistant-api.ts';

export const artworkFilters = [
  ['dynasty', '朝代'], ['category', '分类'], ['author', '作者名称'], ['subject', '题材'],
  ['paintingSchool', '画派'], ['style', '风格'], ['artisticConception', '意境'],
  ['paintingMaterial', '材料'], ['collectionInstitution', '收藏机构'], ['collectionPlatform', '收录平台'],
] as const;
export type ArtworkFilter = typeof artworkFilters[number][0];
export type ArtworkQuery = Partial<Record<ArtworkFilter, string>> & { keyword: string; sort: 'source' | 'title' | 'author' | 'dynasty'; direction: 'asc' | 'desc' };
export type ArtworkPage = { items: ArtworkReference[]; totalElements: number; totalPages: number; page: number; size: number };
export const emptyArtworkQuery = (): ArtworkQuery => ({ keyword: '', sort: 'source', direction: 'asc' });
export const ARTWORK_SELECTION_LIMIT = 5;
/** Only the documented public filters leave the browser. Each new search starts at page zero. */
export function artworkSearchPath(query: ArtworkQuery, page = 0): string {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('作品页码无效，请重新查询。');
  const params = new URLSearchParams({ page: String(page), size: '10', sort: query.sort, direction: query.direction });
  if (!['source', 'title', 'author', 'dynasty'].includes(query.sort) || !['asc', 'desc'].includes(query.direction)) throw new Error('作品排序无效，请重新查询。');
  const keyword = query.keyword.trim();
  if (keyword.length > 200) throw new Error('作品关键词最多 200 个字符。');
  if (keyword) params.set('keyword', keyword);
  for (const [key] of artworkFilters) {
    const value = query[key]?.trim();
    if (value && value.length > 512) throw new Error('作品筛选值最多 512 个字符。');
    if (value) params.set(key, value);
  }
  return `/artworks/page?${params}`;
}
/** Public display text is never accepted as authoritative model context. Core resolves these references. */
export function selectedArtworkReferences(selected: ArtworkReference[]) {
  if (selected.length > ARTWORK_SELECTION_LIMIT || new Set(selected.map(item => item.artworkId)).size !== selected.length) throw new Error('每次最多选用 5 幅不同作品。');
  return selected.map(({ artworkId, batchId, revision }) => ({ artworkId, expectedBatchId: batchId, expectedRevision: revision, includeImage: false }));
}
export function artworkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录状态已过期，请重新登录后查找作品。';
    if (error.status === 403 || error.status === 404) return '作品当前不可访问，可能已下架或权限已变化。请移除后重新查找。';
    if (error.status === 409) return '作品资料已有更新。请移除原选择，重新查找并选用当前修订后发送。';
    if (error.status === 400) return '筛选条件或作品标识无效，请检查后重新查找。';
    if (error.status === 503 || error.status === 504) return '平台作品查询暂不可用或超时；尚未确认来源，请稍后重新查找。';
  }
  return error instanceof Error ? error.message : '作品查询未完成，请重新查找；未将失败查询当作空结果。';
}

export function artworkRunFailureNotice(code: string | null): string | null {
  const messages: Record<string, string> = {
    ASSISTANT_ARTWORK_NOT_FOUND: '选中的作品当前不可访问，平台来源核验未完成。请移除失效选择，重新查找可用作品后主动发送新问题。',
    ASSISTANT_ARTWORK_REVISION_CHANGED: '选中的作品修订已变化，平台来源核验未完成。请重新选用当前修订后主动发送新问题；旧回答的快照不会被改写。',
    ASSISTANT_ARTWORK_UNAVAILABLE: '平台作品查询暂不可用，不能把本次失败当作成功获取资料。可稍后主动重试，或清除作品选择后发送普通问题。',
    ASSISTANT_ARTWORK_TIMEOUT: '平台作品查询超时，不能把本次失败当作成功获取资料。没有自动重新生成；请稍后主动重试。',
    ASSISTANT_ARTWORK_CONTEXT_LIMIT: '作品资料超过单次上下文上限，请减少作品选择后主动发送新问题。没有自动删去来源后继续生成。',
    ASSISTANT_ARTWORK_REQUIRED: '本次要求平台参考但没有明确选用作品。请先选用作品，或发送不附作品参考的普通问题。',
  };
  return code ? messages[code] || null : null;
}

/** A definitive source refusal is not permission to rotate an uncertain operation key.
 * Confirm that this exact key never created a run, then allow a later intentional submission.
 */
export async function reconcileRejectedArtworkSubmission(error: unknown, ledger: OperationLedger, scope: string, requestKey: string, resolve: () => Promise<{ status: string }>): Promise<boolean> {
  const refusals = ['ASSISTANT_ARTWORK_NOT_FOUND', 'ASSISTANT_ARTWORK_REVISION_CHANGED', 'ASSISTANT_ARTWORK_REQUIRED', 'ASSISTANT_ARTWORK_UNAVAILABLE', 'ASSISTANT_ARTWORK_TIMEOUT', 'ASSISTANT_ARTWORK_CONTEXT_LIMIT'];
  if (!(error instanceof ApiError) || !refusals.includes(error.code || '') || ![400, 404, 409, 422, 503, 504].includes(error.status)) return false;
  const result = await resolve();
  if (result.status !== 'NOT_FOUND' || ledger.entries().find(([name]) => name === scope)?.[1].key !== requestKey) return false;
  ledger.resolved(scope);
  return true;
}
