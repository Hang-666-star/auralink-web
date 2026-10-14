import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../lib/api.ts';
import { OperationLedger } from '../lib/assistant-api.ts';
import { attachmentErrorMessage, uploadRecovery } from '../lib/assistant-attachment-recovery.ts';
import { validateAssistantResponse } from '../lib/assistant-contracts.ts';
const id = '10000000-0000-4000-8000-000000000001';
const found = { status: 'FOUND', resultType: 'ATTACHMENT', resultId: id };
test('upload resolution distinguishes not accepted, still uploading, ready draft and retained history', () => {
  assert.equal(uploadRecovery({ status: 'NOT_FOUND' }), 'unconfirmed');
  assert.equal(uploadRecovery({ ...found, resultStatus: 'UPLOADING' }), 'uploading');
  assert.equal(uploadRecovery({ ...found, resultStatus: 'READY', attachmentLinked: false }), 'ready');
  assert.equal(uploadRecovery({ ...found, resultStatus: 'READY', attachmentLinked: true }), 'linked');
});
test('failed and removed results are terminal; missing or unknown state does not authorize replacement', () => {
  for (const resultStatus of ['FAILED', 'DELETING', 'DELETED']) assert.equal(uploadRecovery({ ...found, resultStatus }), 'terminal');
  for (const value of [found, { ...found, resultStatus: 'UNKNOWN' }, { ...found, resultType: 'RUN' }, { ...found, resultId: undefined }]) assert.throws(() => uploadRecovery(value), /尚未确认/);
});
test('uncertain upload keeps original operation key after reload, known terminal permits a deliberate new operation', async () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const first = new OperationLedger(storage); const scope = `UPLOAD_ATTACHMENT:${id}:digest`; const body = { digest: 'bytes-digest', filename: 'private-name.png' };
  const key = await first.key(scope, body); const reloaded = new OperationLedger(storage);
  assert.equal(uploadRecovery({ status: 'NOT_FOUND' }), 'unconfirmed');
  assert.equal(await reloaded.key(scope, body), key);
  await assert.rejects(reloaded.key(scope, { ...body, filename: 'changed.png' }), /不能更换请求键/);
  assert.equal(uploadRecovery({ ...found, resultStatus: 'FAILED' }), 'terminal');
  reloaded.resolved(scope); assert.notEqual(await reloaded.key(scope, body), key);
  assert(![...data.values()].join('').includes(body.filename));
});
test('attachment errors provide Chinese recovery without echoing raw internal server messages', () => {
  assert.match(attachmentErrorMessage(new ApiError('Assistant object not found', 404, 'not_found')), /刷新会话/);
  assert.match(attachmentErrorMessage(new ApiError('Attachment upload is incomplete or removed', 409, 'conflict')), /核对上传状态/);
  assert.match(attachmentErrorMessage(new ApiError('JPEG terminal marker is missing', 400, 'validation')), /文件是否完整/);
  assert.match(attachmentErrorMessage(new ApiError('/private/path', 500, 'server')), /尚未确认/);
  assert(!attachmentErrorMessage(new ApiError('/private/path', 500, 'server')).includes('/private'));
});
test('draft responses require actual READY metadata and explicit lifetime instead of accepting arbitrary attachment IDs', () => {
  const image = { id, sessionId: id, status: 'READY', contentUrl: `/api/v1/assistant/attachments/${id}/content`, mimeType: 'image/png', draftExpiresAt: 1899999999 };
  const response = { items: [image], nextCursor: null, hasMore: false };
  validateAssistantResponse(`/sessions/${id}/attachments/draft`, response);
  for (const replacement of [{ ...image, status: 'FAILED' }, { ...image, draftExpiresAt: null }, { ...image, mimeType: 'image/svg+xml' }]) assert.throws(() => validateAssistantResponse(`/sessions/${id}/attachments/draft`, { ...response, items: [replacement] }));
});
