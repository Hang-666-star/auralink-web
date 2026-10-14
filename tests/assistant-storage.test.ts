import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantBytes, assistantStorageNotice, parseAssistantStorage } from '../lib/assistant-storage.ts';
import { validateAssistantResponse } from '../lib/assistant-contracts.ts';
import { attachmentErrorMessage, isDefinitiveUploadRefusal, uploadRecovery } from '../lib/assistant-attachment-recovery.ts';
import { ApiError } from '../lib/api.ts';

const usage = { policyStatus: 'VALID', uploadsAvailable: true, historyOnly: false, quotaBytes: 1024, readyBytes: 400, reservedBytes: 100, logicalBytes: 500, cleanupReservedBytes: 75, chargedBytes: 575, retainedFileBytes: 450, pendingCleanupBytes: 50, availableBytes: 449, draftLifetimeSeconds: 300, cleanupEnabled: false };

test('storage contract separates logical reservation accounting from observed remaining physical files', () => {
  const parsed = parseAssistantStorage(usage);
  assert.equal(parsed.logicalBytes, 500);
  assert.equal(parsed.retainedFileBytes, 450);
  assert.equal(parsed.pendingCleanupBytes, 50);
  assert.equal(parsed.chargedBytes, 575);
  validateAssistantResponse('/storage', usage);
  assert.equal(assistantStorageNotice(parsed), null);
  assert.equal(assistantBytes(1024), '1 KiB');
  assert.equal(assistantBytes(73), '73 字节');
});

test('quota reached or lowered below usage does not misrepresent reading, exporting or deletion as disabled', () => {
  for (const quotaBytes of [575, 499]) {
    const parsed = parseAssistantStorage({ ...usage, quotaBytes, availableBytes: 0, uploadsAvailable: false });
    const notice = assistantStorageNotice(parsed);
    assert.match(notice!, /已有记录仍可读取、下载、导出/);
    assert.match(notice!, /删除会话/);
    assert.match(notice!, /清理完成后才释放/);
    assert.equal(parsed.logicalBytes, 500);
  }
});

test('missing and invalid storage policies remain explicitly unavailable rather than unlimited', () => {
  for (const policyStatus of ['MISSING', 'INVALID']) {
    const parsed = parseAssistantStorage({ ...usage, policyStatus, uploadsAvailable: false, quotaBytes: null, availableBytes: null, draftLifetimeSeconds: null });
    assert.match(assistantStorageNotice(parsed)!, /新增上传暂不可用/);
    assert.equal(parsed.readyBytes, 400);
    assert.throws(() => parseAssistantStorage({ ...parsed, uploadsAvailable: true }));
    assert.throws(() => parseAssistantStorage({ ...parsed, cleanupEnabled: true }));
  }
});

test('explicit history-only mode refuses new uploads without describing available bytes as usable now', () => {
  const parsed = parseAssistantStorage({ ...usage, historyOnly: true, uploadsAvailable: false });
  assert.match(assistantStorageNotice(parsed)!, /不能新增图片上传或生成回复/);
  assert.match(assistantStorageNotice(parsed)!, /查看、下载、导出或删除/);
  assert.throws(() => parseAssistantStorage({ ...parsed, uploadsAvailable: true }));
});

test('malformed byte totals and ambiguous policies never become successful quota displays', () => {
  for (const patch of [{ logicalBytes: 600 }, { chargedBytes: 500 }, { cleanupReservedBytes: -1 }, { reservedBytes: -1 }, { retainedFileBytes: NaN }, { pendingCleanupBytes: 451 }, { availableBytes: 524 }, { quotaBytes: null }, { uploadsAvailable: false }, { draftLifetimeSeconds: 0 }, { cleanupEnabled: 'true' }, { policyStatus: 'UNLIMITED' }, { readyBytes: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parseAssistantStorage({ ...usage, ...patch }));
  }
});

test('quota and disk failure guidance is specific without rotating unresolved request keys or exposing paths', () => {
  const quota = attachmentErrorMessage(new ApiError('/private/path', 413, 'validation', 'ASSISTANT_QUOTA_EXCEEDED'));
  assert.match(quota, /配额不足/); assert.match(quota, /刷新用量/); assert.doesNotMatch(quota, /文件是否完整|\/private/);
  const disk = attachmentErrorMessage(new ApiError('/private/path', 507, 'server', 'ASSISTANT_DISK_FULL'));
  assert.match(disk, /核对上传状态/); assert.doesNotMatch(disk, /\/private/);
  const policy = attachmentErrorMessage(new ApiError('/private/policy', 503, 'server', 'ASSISTANT_STORAGE_POLICY_UNAVAILABLE'));
  assert.match(policy, /已有图片仍可读取、下载、导出和删除/); assert.doesNotMatch(policy, /\/private/);
  assert.equal(uploadRecovery({ status: 'NOT_FOUND' }), 'unconfirmed');
  assert.equal(uploadRecovery({ status: 'FOUND', resultType: 'ATTACHMENT', resultId: 'id', resultStatus: 'FAILED' }), 'terminal');
});

test('only precise admission refusals may retire a key after original-state reconciliation; generic failures remain uncertain', () => {
  for (const [status, code] of [[413, 'ASSISTANT_QUOTA_EXCEEDED'], [503, 'ASSISTANT_STORAGE_POLICY_UNAVAILABLE'], [503, 'ASSISTANT_HISTORY_ONLY']] as const) assert.equal(isDefinitiveUploadRefusal(new ApiError('refused', status, 'server', code)), true);
  for (const [status, code] of [[0, undefined], [409, 'ASSISTANT_CONFLICT'], [507, 'ASSISTANT_DISK_FULL'], [413, undefined], [503, 'ASSISTANT_QUOTA_EXCEEDED']] as const) assert.equal(isDefinitiveUploadRefusal(new ApiError('uncertain', status, 'server', code)), false);
});
