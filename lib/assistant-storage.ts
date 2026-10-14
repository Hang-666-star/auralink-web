/** Owner-scoped, server-authoritative byte accounting. It is not a disk quota calculator. */
export type AssistantStorageUsage = {
  policyStatus: 'VALID' | 'MISSING' | 'INVALID';
  uploadsAvailable: boolean;
  historyOnly: boolean;
  quotaBytes: number | null;
  readyBytes: number;
  reservedBytes: number;
  logicalBytes: number;
  cleanupReservedBytes: number;
  chargedBytes: number;
  retainedFileBytes: number;
  pendingCleanupBytes: number;
  availableBytes: number | null;
  draftLifetimeSeconds: number | null;
  cleanupEnabled: boolean;
};

export function parseAssistantStorage(value: unknown): AssistantStorageUsage {
  const fail = (): never => { throw new Error('图片用量暂未核对成功。历史读取、下载、导出和删除不受此提示限制，请重新读取用量。'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  const bytes = (item: unknown): item is number => Number.isSafeInteger(item) && Number(item) >= 0;
  if (!['VALID', 'MISSING', 'INVALID'].includes(String(row.policyStatus)) || typeof row.uploadsAvailable !== 'boolean' || typeof row.historyOnly !== 'boolean' || typeof row.cleanupEnabled !== 'boolean') return fail();
  for (const key of ['readyBytes', 'reservedBytes', 'logicalBytes', 'cleanupReservedBytes', 'chargedBytes', 'retainedFileBytes', 'pendingCleanupBytes']) if (!bytes(row[key])) return fail();
  for (const key of ['quotaBytes', 'availableBytes', 'draftLifetimeSeconds']) if (row[key] !== null && !bytes(row[key])) return fail();
  if (Number(row.logicalBytes) !== Number(row.readyBytes) + Number(row.reservedBytes) || Number(row.chargedBytes) !== Number(row.logicalBytes) + Number(row.cleanupReservedBytes) || Number(row.pendingCleanupBytes) > Number(row.retainedFileBytes)) return fail();
  if (row.policyStatus === 'VALID') {
    if (!bytes(row.quotaBytes) || row.quotaBytes === 0 || !bytes(row.draftLifetimeSeconds) || row.draftLifetimeSeconds === 0 || row.availableBytes !== Math.max(0, row.quotaBytes - Number(row.chargedBytes)) || row.uploadsAvailable !== (!row.historyOnly && Number(row.availableBytes) > 0)) return fail();
  } else if (row.uploadsAvailable || row.cleanupEnabled || row.quotaBytes !== null || row.availableBytes !== null || row.draftLifetimeSeconds !== null) return fail();
  return row as AssistantStorageUsage;
}

export function assistantBytes(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return '尚未核对';
  if (value < 1024) return `${value.toLocaleString('zh-CN')} 字节`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let amount = value / 1024; let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
  return `${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${units[unit]}`;
}

export function assistantStorageNotice(usage: AssistantStorageUsage): string | null {
  if (usage.historyOnly) return '当前为历史模式，可以查看、下载、导出或删除已有记录；不能新增图片上传或生成回复。';
  if (usage.policyStatus !== 'VALID') return '图片存储政策尚未有效配置，新增上传暂不可用。已有记录仍可读取、下载、导出或删除。';
  if (!usage.uploadsAvailable) return '图片配额已用满，新的上传会被拒绝。可移除不再需要的待发送图片或删除会话；配额要等服务器清理完成后才释放。已有记录仍可读取、下载、导出。';
  return null;
}
