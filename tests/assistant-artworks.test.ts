import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artworkFilters, artworkSearchPath, emptyArtworkQuery, selectedArtworkReferences, artworkErrorMessage, reconcileRejectedArtworkSubmission, artworkRunFailureNotice } from '../lib/assistant-artworks.ts';
import { OperationLedger } from '../lib/assistant-api.ts';
import { validateAssistantResponse, artworkDisplay, type ArtworkReference } from '../lib/assistant-contracts.ts';
import { ApiError } from '../lib/api.ts';
const id = '3b77654a-8c16-42f4-aaec-b1029f7559c3';
const art: ArtworkReference = { artworkId: id, batchId: id, revision: 3, projectionVersion: 'assistant-public-artwork-v1', sourceRecordId: 'source', fields: [{ key: 'core.title', value: '同名山水', rawValue: null, valueStatus: 'PRESENT', assertionStatus: 'UNSPECIFIED' }] };

test('Explicit catalog query has bounded pagination and only supported filter parameters', () => {
  const query = { ...emptyArtworkQuery(), keyword: ' 山水 ', privatePath: '/must-not-leave-browser', userId: 'untrusted' };
  for (const [key] of artworkFilters) Object.assign(query, { [key]: ' 合成筛选 ' });
  const url = new URL(artworkSearchPath(query, 2), 'https://local.invalid');
  assert.equal(url.pathname, '/artworks/page'); assert.equal(url.searchParams.get('size'), '10'); assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('keyword'), '山水');
  assert.equal(url.searchParams.has('privatePath'), false); assert.equal(url.searchParams.has('userId'), false);
  artworkFilters.forEach(([key]) => assert.equal(url.searchParams.get(key), '合成筛选'));
  assert.throws(() => artworkSearchPath(query, -1));
  assert.throws(() => artworkSearchPath({ ...query, keyword: '中'.repeat(201) }));
  assert.throws(() => artworkSearchPath({ ...query, author: '中'.repeat(513) }));
  assert.equal(new URL(artworkSearchPath(emptyArtworkQuery()), 'https://local.invalid').searchParams.has('keyword'), false);
});

test('Selected references send no client-authored fields and do not imply image inspection', () => {
  const expected = [{ artworkId: id, expectedBatchId: id, expectedRevision: 3, includeImage: false }];
  assert.deepEqual(selectedArtworkReferences([art]), expected);
  assert.deepEqual(selectedArtworkReferences([]), []);
  assert.throws(() => selectedArtworkReferences([art, art]), /不同作品/);
  assert.throws(() => selectedArtworkReferences(Array.from({ length: 6 }, (_, index) => ({ ...art, artworkId: `id-${index}` }))), /最多/);
});

test('Artwork pagination validates totals separately from selections and rejects malformed successes', () => {
  const page = { items: [art], totalElements: 23, totalPages: 3, page: 2, size: 10 };
  assert.doesNotThrow(() => validateAssistantResponse('/artworks/page?keyword=山水', page));
  assert.doesNotThrow(() => validateAssistantResponse(`/artworks/${id}`, art));
  assert.doesNotThrow(() => validateAssistantResponse('/artworks/page', { items: [], totalElements: 0, totalPages: 0, page: 0, size: 10 }));
  for (const patch of [{ totalPages: 2 }, { size: 11 }, { totalElements: -1 }, { page: 0.5 }, { items: [art, art] }, { items: [{ ...art, artworkId: '../private' }] }, { items: [{ ...art, fields: [{ key: 'core.title', value: {}, rawValue: null }] }] }]) {
    assert.throws(() => validateAssistantResponse('/artworks/page', { ...page, ...patch }));
  }
});

test('Missing and unresolved records stay visible with uncertainty instead of fabricated facts', () => {
  const fields = artworkDisplay({ ...art, fields: [{ key: 'legacy.author_name', value: null, rawValue: null, valueStatus: 'MISSING', assertionStatus: 'UNKNOWN' }, { key: 'legacy.creation_dynasty_raw', value: '0', rawValue: '0', valueStatus: 'PRESENT', assertionStatus: 'UNRESOLVED' }] });
  assert.equal(fields[0].value, '未提供'); assert.equal(fields[0].uncertainty, '未知或缺失');
  assert.equal(fields[1].value, '0'); assert.equal(fields[1].uncertainty, '待核实');
  assert.match(artworkErrorMessage(new ApiError('not found', 404, 'not_found', 'ASSISTANT_ARTWORK_NOT_FOUND')), /移除后重新查找/);
  assert.match(artworkErrorMessage(new ApiError('stale', 409, 'conflict', 'ASSISTANT_ARTWORK_REVISION_CHANGED')), /当前修订/);
  assert.match(artworkErrorMessage(new ApiError('timeout', 504, 'server', 'ASSISTANT_ARTWORK_TIMEOUT')), /未确认来源/);
});

test('Known stale source refusal plus confirmed absent request permits explicit corrected selection', async () => {
  const ledger = new OperationLedger(); const scope = `CHAT_EXECUTION:${id}`;
  const key = await ledger.key(scope, { artworkRefs: selectedArtworkReferences([art]) });
  let resolutions = 0;
  const reconciled = await reconcileRejectedArtworkSubmission(new ApiError('changed', 409, 'conflict', 'ASSISTANT_ARTWORK_REVISION_CHANGED'), ledger, scope, key, async () => { resolutions++; return { status: 'NOT_FOUND' }; });
  assert.equal(reconciled, true); assert.equal(resolutions, 1);
  const correctedKey = await ledger.key(scope, { artworkRefs: selectedArtworkReferences([{ ...art, revision: 4 }]) });
  assert.notEqual(correctedKey, key);
  assert.equal(await ledger.key(scope, { artworkRefs: selectedArtworkReferences([{ ...art, revision: 4 }]) }), correctedKey);
});

test('Uncertain responses and existing/deleted/expired results never release an operation key', async () => {
  const scope = `CHAT_EXECUTION:${id}`;
  for (const error of [new TypeError('network lost'), new ApiError('key conflict', 409, 'conflict', 'ASSISTANT_IDEMPOTENCY_CONFLICT')]) {
    const ledger = new OperationLedger(); const key = await ledger.key(scope, { revision: 3 }); let resolutions = 0;
    assert.equal(await reconcileRejectedArtworkSubmission(error, ledger, scope, key, async () => { resolutions++; return { status: 'NOT_FOUND' }; }), false);
    assert.equal(resolutions, 0); await assert.rejects(ledger.key(scope, { revision: 4 }), /尚未确认/); assert.equal(await ledger.key(scope, { revision: 3 }), key);
  }
  for (const status of ['FOUND', 'DELETED', 'EXPIRED', 'UNKNOWN']) {
    const ledger = new OperationLedger(); const key = await ledger.key(scope, { revision: 3 });
    assert.equal(await reconcileRejectedArtworkSubmission(new ApiError('timeout', 504, 'server', 'ASSISTANT_ARTWORK_TIMEOUT'), ledger, scope, key, async () => ({ status })), false);
    await assert.rejects(ledger.key(scope, { revision: 4 }), /尚未确认/); assert.equal(await ledger.key(scope, { revision: 3 }), key);
  }
});

test('Failed request reconciliation preserves key and never dispatches or retries', async () => {
  const ledger = new OperationLedger(); const scope = `CHAT_EXECUTION:${id}`; const key = await ledger.key(scope, { revision: 3 });
  await assert.rejects(reconcileRejectedArtworkSubmission(new ApiError('unavailable', 503, 'server', 'ASSISTANT_ARTWORK_UNAVAILABLE'), ledger, scope, key, async () => { throw new TypeError('resolver unavailable'); }), /resolver unavailable/);
  assert.equal(await ledger.key(scope, { revision: 3 }), key); await assert.rejects(ledger.key(scope, { revision: 4 }), /尚未确认/);
});

test('Persisted artwork failures remain explicit rather than claiming successful grounding', () => {
  assert.match(artworkRunFailureNotice('ASSISTANT_ARTWORK_NOT_FOUND') || '', /来源核验未完成/);
  assert.match(artworkRunFailureNotice('ASSISTANT_ARTWORK_REVISION_CHANGED') || '', /重新选用当前修订/);
  assert.match(artworkRunFailureNotice('ASSISTANT_ARTWORK_TIMEOUT') || '', /不能把本次失败当作成功/);
  assert.match(artworkRunFailureNotice('ASSISTANT_ARTWORK_CONTEXT_LIMIT') || '', /没有自动删去来源/);
  assert.equal(artworkRunFailureNotice(null), null); assert.equal(artworkRunFailureNotice('UNRELATED_CODE'), null);
});
