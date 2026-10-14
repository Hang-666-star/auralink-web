import { ApiError } from './api.ts';
import type { AssistantTimestamp } from './assistant-contracts.ts';

export type UploadResolution = { status: string; resultType?: string; resultId?: string; resultStatus?: string | null; attachmentLinked?: boolean | null; expiresAt?: AssistantTimestamp | null };
export type UploadRecovery = 'unconfirmed' | 'ready' | 'linked' | 'uploading' | 'terminal';
/** Only exact pre-admission refusals qualify, and callers must first resolve the original key as NOT_FOUND. */
export function isDefinitiveUploadRefusal(error: unknown): boolean {
  return error instanceof ApiError && ((error.status === 413 && error.code === 'ASSISTANT_QUOTA_EXCEEDED') || (error.status === 503 && ['ASSISTANT_STORAGE_POLICY_UNAVAILABLE', 'ASSISTANT_HISTORY_ONLY'].includes(error.code || '')));
}
/** A failed lookup/unknown status is never authority to replace an uncertain operation key. */
export function uploadRecovery(result: UploadResolution): UploadRecovery {
  if (result.status === 'NOT_FOUND') return 'unconfirmed';
  if (result.status !== 'FOUND' || result.resultType !== 'ATTACHMENT' || !result.resultId) throw new Error('图片上传状态尚未确认，请点击“核对上传状态”；没有重新上传。');
  if (result.resultStatus === 'READY') return result.attachmentLinked ? 'linked' : 'ready';
  if (result.resultStatus === 'UPLOADING') return 'uploading';
  if (['FAILED', 'DELETING', 'DELETED'].includes(result.resultStatus || '')) return 'terminal';
  throw new Error('图片上传状态尚未确认，请点击“核对上传状态”；没有重新上传。');
}
export function attachmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ASSISTANT_HISTORY_ONLY') return '当前为历史模式，不能新增图片上传。已有图片仍可读取、下载、导出和删除。';
    if (error.code === 'ASSISTANT_QUOTA_EXCEEDED') return '图片配额不足，服务器未接受这次新增上传。可移除不需要的待发送图片或删除会话；请等待服务器清理释放配额，刷新用量后再主动上传。已有图片仍可读取、下载和导出。';
    if (error.code === 'ASSISTANT_STORAGE_POLICY_UNAVAILABLE') return '图片存储政策尚未有效配置，新增上传暂不可用。已有图片仍可读取、下载、导出和删除；请联系管理员核对存储政策。';
    if (error.code === 'ASSISTANT_DISK_FULL') return '服务器图片存储空间不足，未确认上传成功。请核对上传状态；不要重复提交或清空已保存的历史。';
    if (error.status === 401) return '登录已失效，请重新登录后读取图片。';
    if ([403, 404].includes(error.status)) return '图片不存在、已移除或当前账号无权读取。请刷新会话核对记录；不会删除服务器上的其他图片。';
    if (error.status === 410) return '这次上传已过期或移除。仍需使用时，请重新选择图片发起一次新的上传。';
    if (error.status === 409) return '这次上传的状态或内容发生冲突。请先核对上传状态；未确认的请求不会更换请求键。';
    if ([400, 413, 415, 422].includes(error.status)) return '图片未被接受。请检查 JPEG／PNG 文件是否完整且未超过大小限制，再重新选择。';
    return '图片暂时未能读取或上传结果尚未确认。请核对上传状态；不要把连接失败当作图片已删除。';
  }
  return error instanceof Error ? error.message : '图片操作未完成，请核对状态后重试。';
}
