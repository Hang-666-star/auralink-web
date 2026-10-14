'use client';
import { useEffect, useState, useRef } from 'react';
import { api, ApiError, isAbortError } from '@/lib/api';
import { assistantRequest } from '@/lib/assistant-api';
import { attachmentErrorMessage } from '@/lib/assistant-attachment-recovery';
import type { Attachment } from '@/lib/assistant-contracts';
import { useSession } from '@/components/session-provider';
import styles from './assistant.module.css';
export function PrivateAttachment({ id }: { id: string }) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<{ metadata: Attachment; url: string } | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    const dialogElement = dialog.current; const controller = new AbortController(); const identity = sessionIdentity; let url = '';
    setImage(null); setError('');
    void assistantRequest<Attachment>(`/attachments/${encodeURIComponent(id)}`, token, controller.signal).then(async metadata => {
      const blob = await api.mediaBlob(metadata.contentUrl, token, controller.signal);
      if (controller.signal.aborted || !isCurrentSession(identity)) return;
      if (!['image/png', 'image/jpeg'].includes(blob.type)) throw new Error('图片响应格式不受支持。');
      url = URL.createObjectURL(blob); setImage({ metadata, url });
    }).catch(error => {
      if (controller.signal.aborted || isAbortError(error) || !isCurrentSession(identity)) return;
      if (error instanceof ApiError && error.status === 401) { signOutIfCurrent(identity); return; }
      setError(attachmentErrorMessage(error));
    });
    return () => { controller.abort(); dialogElement?.close(); if (url) URL.revokeObjectURL(url); };
  }, [id, token, sessionIdentity, isCurrentSession, signOutIfCurrent, attempt]);
  return <figure className={styles.attachment} data-testid={`attachment-${id}`}>
    {image ? <><button className={styles.imageButton} type="button" onClick={() => dialog.current?.showModal()} aria-label={`查看原图 ${image.metadata.filename}`}><img src={image.url} width={image.metadata.width} height={image.metadata.height} alt={image.metadata.filename} /></button><figcaption>{image.metadata.filename} · <a href={image.url} download={image.metadata.filename}>下载原图</a></figcaption><dialog ref={dialog} className={styles.dialog} aria-label={`原图 ${image.metadata.filename}`}><img src={image.url} width={image.metadata.width} height={image.metadata.height} alt={image.metadata.filename} /><p>{image.metadata.filename} · {image.metadata.width} × {image.metadata.height}</p><footer><a href={image.url} download={image.metadata.filename}>下载原图</a><button autoFocus type="button" className="button" onClick={() => dialog.current?.close()}>关闭原图</button></footer></dialog></> : error ? <><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重试图片</button></> : <p role="status">正在读取私有图片…</p>}
  </figure>;
}
