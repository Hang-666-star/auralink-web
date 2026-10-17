'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/components/session-provider';
import { StatePanel } from '@/components/state-panel';
import { ApiError, isAbortError } from '@/lib/api';
import { assistantPage, assistantRequest, exportAssistant, OperationLedger } from '@/lib/assistant-api';
import { terminal, stateLabel, retrievalLabel, stageLabels, mergeItems, ragflowAvailable, assistantRetrievalRequest, assistantGenerationAvailable, assistantGenerationNotice, type AssistantStatus, type AssistantSession, type Branch, type Message, type Run, type Registry, type Citation, type Choice, type Summary, type Timeline, type Page, type ArtworkReference, assistantDate, platformCitationFields } from '@/lib/assistant-contracts';
import { subscribeAssistant } from '@/lib/assistant-stream';
import { useAssistantAccess } from './use-assistant-access';
import { useAssistantAttachments } from './use-assistant-attachments';
import { PrivateAttachment } from './private-attachment';
import { AssistantStorage } from './assistant-storage';
import { useBrowserSpeech } from './use-browser-speech';
import { ArtworkSelection } from './artwork-selection';
import { selectedArtworkReferences, reconcileRejectedArtworkSubmission, artworkRunFailureNotice } from '@/lib/assistant-artworks';
import styles from './assistant.module.css';
const enc = encodeURIComponent;
const empty = <T,>(): Page<T> => ({ items: [], nextCursor: null, hasMore: false });
type Access = ReturnType<typeof useAssistantAccess>;
function usePage<T>(path: string | null, access: Access, id: (row: T) => string, revision = 0, prepend = false, keepItems = false) {
  const [page, setPage] = useState<Page<T>>(empty); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const epoch = useRef(0); const idRef = useRef(id); idRef.current = id;
  const { request, report } = access;
  useEffect(() => {
    const current = ++epoch.current; if (!keepItems) setPage(empty()); setError(''); if (!path) return;
    setLoading(true);
    void request((token, signal) => assistantPage<T>(path, token, signal)).then(value => { if (current === epoch.current) setPage(value); }).catch(error => { if (current === epoch.current && !isAbortError(error)) { setError(error instanceof Error ? error.message : '读取失败'); report(error); } }).finally(() => { if (current === epoch.current) setLoading(false); });
    return () => { epoch.current = current + 1; };
  }, [path, revision, request, report, keepItems]);
  const more = async () => {
    if (!path || loading || !page.hasMore || !page.nextCursor) return; const current = epoch.current; setLoading(true);
    try { const value = await request((token, signal) => assistantPage<T>(path, token, signal, page.nextCursor)); if (current === epoch.current) setPage(old => ({ ...value, items: prepend ? mergeItems(value.items, old.items, idRef.current) : mergeItems(old.items, value.items, idRef.current) })); }
    catch (error) { if (current === epoch.current) report(error); }
    finally { if (current === epoch.current) setLoading(false); }
  };
  return { ...page, loading, error, more };
}
function LoadMore({ page, label }: { page: { hasMore: boolean; loading: boolean; more: () => Promise<void> }; label: string }) { return page.hasMore ? <button className="button" disabled={page.loading} onClick={() => void page.more()}>{page.loading ? '正在读取…' : label}</button> : null; }
function Dialog({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = ref.current; const prior = document.activeElement as HTMLElement | null; element?.showModal(); return () => { element?.close(); prior?.focus(); }; }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event => { event.preventDefault(); close(); }}><h2>{title}</h2>{children}</dialog>;
}
export function AssistantScreen() {
  const { sessionIdentity } = useSession();
  return <AssistantAccount key={sessionIdentity.generation} />;
}
function AssistantAccount() {
  const { user } = useSession(); const [error, setError] = useState(''); const access = useAssistantAccess(setError); const [status, setStatus] = useState<AssistantStatus | null>(null); const [registry, setRegistry] = useState<Registry | null>(null); const [unavailable, setUnavailable] = useState(false); const [revision, setRevision] = useState(0); const [selected, setSelected] = useState<string | null>(null); const [dialog, setDialog] = useState(false); const [title, setTitle] = useState('新的国画对话'); const [busy, setBusy] = useState(false); const opBusy = useRef(false);
  const [ledger] = useState(() => new OperationLedger(typeof window !== 'undefined' ? window.sessionStorage : undefined, `assistant.operation:${user?.id}`));
  const { request, report } = access;
  const sessions = usePage<AssistantSession>(status?.enabled ? '/sessions/page' : null, access, row => row.id, revision);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('session'); if (id && /^[0-9a-f-]{36}$/i.test(id)) setSelected(id);
  }, []);
  useEffect(() => {
    let alive = true; setUnavailable(false); setError('');
    void request((token, signal) => assistantRequest<AssistantStatus>('/status', token, signal)).then(async value => {
      if (!alive) return; setStatus(value);
      if (value.executionAvailable) {
        try { const models = await request((token, signal) => assistantRequest<Registry>('/models', token, signal)); if (alive) setRegistry(models); }
        catch (error) { if (alive) report(error); }
      }
    }).catch(error => { if (alive) { setUnavailable(true); report(error); } });
    return () => { alive = false; };
  }, [request, report, revision]);
  useEffect(() => {
    if (!status?.enabled) return; let alive = true;
    const pending = ledger.entries().find(([scope]) => scope === 'CREATE_SESSION');
    if (pending) void request((token, signal) => assistantRequest<{ status: string; resultId?: string }>('/requests/resolve', token, signal, 'POST', { operation: 'CREATE_SESSION', requestKey: pending[1].key })).then(result => {
      if (!alive || result.status !== 'FOUND' || !result.resultId) return;
      ledger.resolved('CREATE_SESSION'); setSelected(result.resultId); setRevision(value => value + 1);
      const url = new URL(window.location.href); url.searchParams.set('session', result.resultId); window.history.replaceState(null, '', url);
    }).catch(error => { if (alive) report(error); });
    return () => { alive = false; };
  }, [status?.enabled, ledger, request, report]);
  const select = (id: string | null) => { setError(''); setSelected(id); const url = new URL(window.location.href); if (id) url.searchParams.set('session', id); else url.searchParams.delete('session'); window.history.replaceState(null, '', url); };
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (opBusy.current) return; opBusy.current = true; setBusy(true); setError('');
    try { const payload = { title }; const key = await ledger.key('CREATE_SESSION', payload); const value = await request((token, signal) => assistantRequest<AssistantSession>('/sessions', token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved('CREATE_SESSION'); setDialog(false); select(value.id); setRevision(value => value + 1); }
    catch (error) { report(error); } finally { opBusy.current = false; setBusy(false); }
  };
  return <div className={`page-shell ${styles.page}`}>
    <header className={`glass-panel ${styles.header}`}><div><h1>落笔之前，一起想想</h1><p>国画助手 · 对话、参考与创作记录</p></div>{process.env.NEXT_PUBLIC_ASSISTANT_SIMULATED === 'true' ? <span className={styles.badge}>隔离预览 · 模拟模型与资料</span> : null}</header>
    {error ? <div className={`${styles.notice} ${styles.error}`} role="alert">{error}<button className={styles.small} onClick={() => { setError(''); setRevision(value => value + 1); }}>刷新记录</button></div> : null}
    {!status && !unavailable ? <StatePanel kind="loading" title="正在连接助手" /> : unavailable ? <StatePanel kind="unavailable" title="助手暂不可用" description="其他 ArtLIVE 页面仍可使用。" actionLabel="重新连接" onAction={() => setRevision(value => value + 1)} /> : !status?.enabled ? <StatePanel kind="unavailable" title="助手尚未启用" description="当前服务未开放助手；不会发起模型请求。" /> : <>
      {!status.executionAvailable ? <p className={styles.notice}>当前为历史模式：可以浏览、导出与管理已保存记录；新对话生成暂不可用。</p> : !assistantGenerationAvailable(status) ? <p className={styles.notice} role="status">{assistantGenerationNotice(status.generationState)}<button className={styles.small} onClick={() => setRevision(value => value + 1)}>刷新生成状态</button></p> : null}
      <div className={styles.layout}><aside className={`glass-panel ${styles.sidebar}`} aria-label="会话列表"><h2>我的对话</h2><button className="button button-primary" onClick={() => { setTitle('新的国画对话'); setDialog(true); }}>新建会话</button>
        {sessions.loading && !sessions.items.length ? <p role="status">正在读取会话…</p> : !sessions.items.length ? <p>还没有对话，从一次提问开始。</p> : null}
        <ul>{sessions.items.map(session => <li key={session.id}><button className={styles.session} data-testid="assistant-session" aria-current={selected === session.id} onClick={() => select(session.id)}><strong>{session.title}</strong><time>{assistantDate(session.createdAt).toLocaleDateString('zh-CN')}</time></button></li>)}</ul><LoadMore page={sessions} label="更多会话" />
      </aside><main className={styles.main}>{selected ? <SessionWorkspace key={selected} id={selected} status={status} registry={registry} ledger={ledger} onChanged={() => setRevision(value => value + 1)} onDeleted={() => { select(null); setRevision(value => value + 1); }} /> : <StatePanel kind="empty" title="从一幅画、一个念头开始" description="选择已有对话，或新建会话。记录归当前账号所有，可在其他设备登录后继续查看。" />}</main></div>
    </>}
    {dialog ? <Dialog title="新建会话" close={() => setDialog(false)}><form onSubmit={event => void create(event)}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<label>会话名称<input autoFocus value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} /></label><footer><button type="button" className="button" onClick={() => setDialog(false)}>返回</button><button className="button button-primary" disabled={busy}>创建会话</button></footer></form></Dialog> : null}
  </div>;
}
function SessionWorkspace({ id, status, registry, ledger, onChanged, onDeleted }: { id: string; status: AssistantStatus; registry: Registry | null; ledger: OperationLedger; onChanged: () => void; onDeleted: () => void }) {
  const [error, setError] = useState(''); const access = useAssistantAccess(setError); const { request, report } = access;
  const deletedRef = useRef(onDeleted); deletedRef.current = onDeleted;
  const [session, setSession] = useState<AssistantSession | null>(null); const [branchId, setBranchId] = useState<string | null>(null); const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false); const opBusy = useRef(false);
  const downloads = useRef(new Set<string>());
  useEffect(() => { const urls = downloads.current; return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }; }, []);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null); const [title, setTitle] = useState(''); const [exportHistory, setExportHistory] = useState(false);
  const branches = usePage<Branch>(`/sessions/${enc(id)}/branches/page`, access, row => row.id, revision);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { let alive = true; void request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal)).then(value => { if (alive) { setSession(value); setBranchId(current => current || value.activeBranchId); } }).catch(error => { if (alive) { if (error instanceof ApiError && [404, 410].includes(error.status)) deletedRef.current(); else report(error); } }); return () => { alive = false; }; }, [id, revision, request, report]);
  const update = async (payload: object) => { if (!session) return; const current = await request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal)); const result = await request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal, 'PATCH', { expectedVersion: current.version, ...payload })); setSession(result); onChanged(); };
  const switchBranch = async (next: string) => { if (opBusy.current) return; opBusy.current = true; setBusy(true); try { await update({ activeBranchId: next }); setBranchId(next); reload(); } catch (error) { report(error); } finally { opBusy.current = false; setBusy(false); } };
  const mutate = async (event: React.FormEvent) => {
    event.preventDefault(); if (opBusy.current) return; opBusy.current = true; setBusy(true);
    try { if (dialog === 'delete') { await request((token, signal) => assistantRequest(`/sessions/${enc(id)}`, token, signal, 'DELETE')); setDialog(null); onDeleted(); } else { await update({ title }); setDialog(null); } }
    catch (error) { report(error); } finally { opBusy.current = false; setBusy(false); }
  };
  const download = async (format: 'json' | 'csv') => { try { const blob = await request((token, signal) => exportAssistant(id, format, exportHistory, token, signal)); const url = URL.createObjectURL(blob); downloads.current.add(url); const link = document.createElement('a'); link.href = url; link.download = `assistant-${id}.${format}`; link.click(); setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000); } catch (error) { report(error); } };
  return <>
    {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}<button className={styles.small} onClick={() => { setError(''); reload(); }}>刷新会话</button></div> : null}
    {session ? <><header className={`glass-panel ${styles.toolbar}`}><h2>{session.title}</h2><button className="button" onClick={() => { setTitle(session.title); setDialog('rename'); }}>重命名</button><button className="button" onClick={() => setDialog('delete')}>删除会话</button><button className="button" onClick={reload}>刷新会话</button></header>
      <div className={`glass-panel ${styles.toolbar}`}><label className={styles.inline}>分支<select aria-label="分支" value={branchId || session.activeBranchId} disabled={busy} onChange={event => void switchBranch(event.target.value)}>{!branches.items.some(branch => branch.id === branchId) && branchId ? <option value={branchId}>当前分支</option> : null}{branches.items.map((branch, index) => <option key={branch.id} value={branch.id}>{branch.parentBranchId ? `编辑分支 ${index + 1}` : '原始分支'} · {branch.id.slice(0, 6)}</option>)}</select></label><LoadMore page={branches} label="更多分支" /><span className={styles.meta}>切换只读取历史，不发起生成。</span></div>
      {branchId ? <BranchWorkspace key={branchId} id={id} branchId={branchId} status={status} registry={registry} session={session} ledger={ledger} revision={revision} reload={reload} onBranch={next => { setBranchId(next); reload(); onChanged(); }} onAuto={async value => { await update({ summaryAutoEnabled: value }); reload(); }} onRevoked={() => deletedRef.current()} /> : null}
      <details className={`glass-panel ${styles.tools}`}><summary>导出与保存说明</summary><p>对话和原图保存在当前账号的私有记录中。默认导出当前分支；阶段标签是规则或用户分类，不是对实际作画行为的证明。导出文件不包含登录令牌或图片字节。</p><label className={styles.inline}><input type="checkbox" checked={exportHistory} onChange={event => setExportHistory(event.target.checked)} />包含历史分支</label><div className={styles.inline}><button className="button" onClick={() => void download('json')}>JSON导出</button><button className="button" onClick={() => void download('csv')}>CSV导出</button></div><p className={styles.meta}>超出服务端导出上限时会明确拒绝，不会悄悄截断。主动删除立即撤销应用访问；备份与上游已处理内容不承诺同步抹除。</p></details>
    </> : <StatePanel kind="loading" title="正在读取会话" />}
    {dialog ? <Dialog title={dialog === 'delete' ? '删除会话' : '重命名会话'} close={() => setDialog(null)}><form onSubmit={event => void mutate(event)}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}{dialog === 'delete' ? <p>删除「{session?.title}」后，对话、分支及私有图片立即不可访问。此操作不能从页面撤销。</p> : <label>会话名称<input autoFocus value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} /></label>}<footer><button className="button" type="button" onClick={() => setDialog(null)}>返回</button><button className="button button-primary" disabled={busy}>{dialog === 'delete' ? '确认删除' : '保存名称'}</button></footer></form></Dialog> : null}
  </>;
}
function BranchWorkspace({ id, branchId, status, registry, session, ledger, revision, reload, onBranch, onAuto, onRevoked }: { id: string; branchId: string; status: AssistantStatus; registry: Registry | null; session: AssistantSession; ledger: OperationLedger; revision: number; reload: () => void; onBranch: (id: string) => void; onAuto: (value: boolean) => Promise<void>; onRevoked: () => void }) {
  const [error, setError] = useState(''); const access = useAssistantAccess(setError); const { request, report, token, sessionIdentity, isCurrentSession, signOutIfCurrent } = access;
  const revokedRef = useRef(onRevoked); revokedRef.current = onRevoked;
  const branchRef = useRef(onBranch); branchRef.current = onBranch;
  const [activityTick, setActivityTick] = useState(0);
  useEffect(() => { if (!status.executionAvailable) return; const timer = setInterval(() => setActivityTick(value => value + 1), 2500); return () => clearInterval(timer); }, [status.executionAvailable]);
  const [selectedArtworks, setSelectedArtworks] = useState<ArtworkReference[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null); const [text, setText] = useState(''); const [model, setModel] = useState(''); const [ragflow, setRagflow] = useState(false); const [busy, setBusy] = useState(false); const busyRef = useRef(false); const composing = useRef(false); const [connection, setConnection] = useState('');
  const [live, setLive] = useState<Run | null>(null); const [editing, setEditing] = useState<Message | null>(null); const [editText, setEditText] = useState(''); const [notice, setNotice] = useState(''); const [timelineOpen, setTimelineOpen] = useState(false); const [summaryOpen, setSummaryOpen] = useState(false);
  const draft = useAssistantAttachments(id, revision, ledger, access); const attachments = draft.attachments;
  const messages = usePage<Message>(`/sessions/${enc(id)}/messages/page?branchId=${enc(branchId)}`, access, row => row.id, revision, true);
  const runs = usePage<Run>(status.executionAvailable ? `/sessions/${enc(id)}/runs/page?branchId=${enc(branchId)}` : null, access, row => row.id, revision);
  const active = usePage<Run>(status.executionAvailable ? `/sessions/${enc(id)}/runs/page?activeOnly=true` : null, access, row => row.id, revision + activityTick, false, true);
  const summaries = usePage<Summary>(status.executionAvailable && summaryOpen ? `/sessions/${enc(id)}/summaries/page?branchId=${enc(branchId)}` : null, access, row => row.id, revision);
  const timeline = usePage<Timeline>(status.executionAvailable && timelineOpen ? `/sessions/${enc(id)}/timeline/page?branchId=${enc(branchId)}` : null, access, row => row.messageId, revision, true);
  const speech = useBrowserSpeech(value => setText(current => `${current}${current ? '\n' : ''}${value}`), setError);
  const availableModels = registry?.models.filter(item => item.enabled && item.configured && item.capabilities.streaming) || [];
  const selectedModel = registry?.models.find(item => item.id === model);
  const generationAvailable = assistantGenerationAvailable(status);
  const requireGeneration = () => { if (!generationAvailable) throw new Error(assistantGenerationNotice(status.generationState)); };
  useEffect(() => { if (!model && registry?.models.length) setModel(registry.models.find(item => item.enabled && item.configured && item.capabilities.streaming)?.id || ''); }, [registry, model]);
  useEffect(() => { let alive = true; void request((token, signal) => assistantRequest<Branch>(`/sessions/${enc(id)}/branches/${enc(branchId)}`, token, signal)).then(value => { if (alive) setBranch(value); }).catch(error => { if (alive) report(error); }); return () => { alive = false; }; }, [id, branchId, revision, request, report]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let recovered = false;
      for (const [scope, record] of ledger.entries()) {
        const [operation, sessionId] = scope.split(':'); if (sessionId !== id || operation === 'UPLOAD_ATTACHMENT') continue;
        const result = await request((token, signal) => assistantRequest<{ status: string; resultType?: string; resultId?: string }>('/requests/resolve', token, signal, 'POST', { operation, requestKey: record.key, sessionId: id }));
        if (!alive) return;
        if (result.status === 'FOUND') {
          if (result.resultType === 'BRANCH' && result.resultId) branchRef.current(result.resultId);
          if (result.resultType === 'RUN' && result.resultId) {
            const recoveredRun = await request((token, signal) => assistantRequest<Run>(`/runs/${enc(result.resultId!)}`, token, signal));
            if (!alive) return; setLive(recoveredRun); if (recoveredRun.branchId !== branchId) branchRef.current(recoveredRun.branchId);
          }
          ledger.resolved(scope); recovered = true;
        }
      }
      if (alive && recovered) { setNotice('已找回上次请求的持久记录；没有再次发起生成。'); reload(); }
    })().catch(error => { if (alive) report(error); });
    return () => { alive = false; };
  }, [id, branchId, ledger, request, report, reload, revision]);
  useEffect(() => {
    if (!activityTick) return; let alive = true;
    void request((token, signal) => assistantRequest<AssistantSession>(`/sessions/${enc(id)}`, token, signal)).then(current => { if (alive && current.version !== session.version) reload(); }).catch(error => {
      if (alive && error instanceof ApiError && [404, 410].includes(error.status)) revokedRef.current();
    });
    return () => { alive = false; };
  }, [activityTick, id, request, session.version, reload]);
  const running = active.items.find(item => !terminal(item.status)); const pendingChat = active.items.find(item => item.kind === 'CHAT' && !terminal(item.status)); const runningId = running?.id;
  useEffect(() => {
    if (!runningId || !token) return;
    const controller = new AbortController(); const identity = sessionIdentity; let current: Run | null = null;
    const currentAccount = () => !controller.signal.aborted && isCurrentSession(identity);
    const delay = (milliseconds: number) => new Promise<void>(resolve => { const timeout = setTimeout(resolve, milliseconds); controller.signal.addEventListener('abort', () => { clearTimeout(timeout); resolve(); }, { once: true }); });
    void (async () => {
      while (currentAccount()) {
        try {
          current = await assistantRequest<Run>(`/runs/${enc(runningId)}`, token, controller.signal);
          if (!currentAccount()) return; setLive(current);
          if (terminal(current.status)) { setConnection(''); reload(); return; }
          setConnection('正在接收已保存的回复');
          current = await subscribeAssistant(current, token, controller.signal, value => { if (currentAccount()) setLive(value); });
          if (!currentAccount()) return;
          // The next loop always confirms the saved server state, including after EOF.
          setConnection('正在确认服务端状态…'); await delay(350);
        } catch (error) {
          if (!currentAccount() || isAbortError(error)) return;
          if (error instanceof ApiError && error.status === 401) { signOutIfCurrent(identity); return; }
          if (error instanceof ApiError && [403, 404, 410].includes(error.status)) { setLive(null); revokedRef.current(); return; }
          setConnection('连接中断，正在恢复已保存状态；没有重新提交生成。'); await delay(1500);
        }
      }
    })();
    return () => controller.abort();
  }, [runningId, token, sessionIdentity, isCurrentSession, signOutIfCurrent, reload]);
  const act = async (action: () => Promise<void>) => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); try { await action(); } catch (error) { report(error); } finally { busyRef.current = false; setBusy(false); } };
  const command = (value: string, ids: string[]) => ({ branchId, expectedVersion: branch?.version, text: value, attachmentIds: ids, modelKey: model, retrieval: assistantRetrievalRequest(registry, selectedArtworks.length > 0, ragflow), artworkRefs: selectedArtworkReferences(selectedArtworks) });
  const submitCommand = async (path: string, payload: ReturnType<typeof command>, scope: string, operation: string) => {
    const requestKey = await ledger.key(scope, payload);
    try {
      const result = await request((token, signal) => assistantRequest<{ run: Run; replay: boolean }>(path, token, signal, 'POST', { ...payload, requestKey }));
      setNotice('');
      return result;
    } catch (error) {
      const reconciled = await reconcileRejectedArtworkSubmission(error, ledger, scope, requestKey, () => request((token, signal) => assistantRequest<{ status: string }>('/requests/resolve', token, signal, 'POST', { operation, requestKey, sessionId: id })));
      if (reconciled) setNotice('作品校验未通过；已核对这次请求未创建执行。可调整作品选择后主动发送，不会自动重试。');
      throw error;
    }
  };
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault(); if (!generationAvailable || (!text.trim() && !attachments.length) || !branch || !selectedModel || pendingChat || busyRef.current || messages.loading || messages.error || draft.loading || draft.error || draft.hasMore || attachments.length > 4) return;
    await act(async () => { const payload = command(text, attachments.map(image => image.id)); const scope = `CHAT_EXECUTION:${id}`; const result = await submitCommand(`/sessions/${enc(id)}/runs`, payload, scope, 'CHAT_EXECUTION'); ledger.resolved(scope); setLive(result.run); setText(''); setSelectedArtworks([]); reload(); });
  };
  const upload = async (file: File | undefined) => { if (file) await act(() => draft.upload(file)); };
  const cancel = async (run: Run) => act(async () => { const value = await request((token, signal) => assistantRequest<Run>(`/runs/${enc(run.id)}/cancel`, token, signal, 'POST')); setLive(value); reload(); });
  const retry = async (run: Run) => act(async () => { requireGeneration(); if (!branch) return; const scope = `RETRY_EXECUTION:${id}:${run.id}`; const payload = { expectedVersion: branch.version, acknowledgePossiblePriorCharge: true }; const key = await ledger.key(scope, payload); const result = await request((token, signal) => assistantRequest<{ run: Run }>(`/runs/${enc(run.id)}/retry`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); onBranch(result.run.branchId); setLive(result.run); reload(); });
  const choose = async (run: Run, cardId: string, optionId: string) => act(async () => { requireGeneration(); if (!branch) return; const payload = { branchId, expectedVersion: branch.version, modelKey: model, cardId, optionId }; const scope = `CHAT_EXECUTION:${id}`; const key = await ledger.key(scope, payload); const result = await request((token, signal) => assistantRequest<{ run: Run }>(`/runs/${enc(run.id)}/choices`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); setLive(result.run); reload(); });
  const saveEdit = async (event: React.FormEvent) => { event.preventDefault(); await act(async () => { if (!editing || !branch) return; const payload = { branchId, expectedVersion: branch.version, text: editText }; const scope = `REVISE_MESSAGE:${id}:${editing.id}`; const key = await ledger.key(scope, payload); const next = await request((token, signal) => assistantRequest<Branch>(`/sessions/${enc(id)}/messages/${enc(editing.id)}/revisions`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); setEditing(null); onBranch(next.id); }); };
  const editedHead = messages.items.find(message => message.id === branch?.headMessageId && message.role === 'USER' && message.supersedesId && !message.runId);
  const executeEdit = async () => act(async () => { requireGeneration(); if (!editedHead) return; const payload = command(editedHead.body, []); const scope = `EDITED_EXECUTION:${id}`; const result = await submitCommand(`/sessions/${enc(id)}/edited-runs`, payload, scope, 'EDITED_EXECUTION'); ledger.resolved(scope); setLive(result.run); reload(); });
  const summary = async () => act(async () => { requireGeneration(); const payload = { branchId }; const scope = `SUMMARY_EXECUTION:${id}`; const key = await ledger.key(scope, payload); const run = await request((token, signal) => assistantRequest<Run>(`/sessions/${enc(id)}/summaries`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); setLive(run); setSummaryOpen(true); reload(); });
  const classify = async (row: Timeline, label: string) => act(async () => { const payload = { expectedVersion: row.classificationVersion, label }; const scope = `CLASSIFY_MESSAGE:${id}:${row.messageId}`; const key = await ledger.key(scope, payload); await request((token, signal) => assistantRequest(`/sessions/${enc(id)}/messages/${enc(row.messageId)}/classification`, token, signal, 'POST', { ...payload, requestKey: key })); ledger.resolved(scope); reload(); });
  const currentLive = live && live.branchId === branchId ? live : null;
  return <>
    {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}<button className={styles.small} onClick={() => { setError(''); reload(); }}>重新读取</button></div> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    <AssistantStorage access={access} revision={revision + draft.storageRevision} />
    <section aria-label="对话历史" className={styles.messages}>
      <LoadMore page={messages} label="加载更早消息" />
      {messages.error ? <StatePanel compact kind="error" title="历史暂未读取成功" description="这不表示会话为空，已保存的消息和图片尚未核对。" actionLabel="重新读取历史" onAction={reload} /> : messages.loading && !messages.items.length ? <p role="status">正在读取历史…</p> : !messages.items.length ? <StatePanel compact kind="empty" title="写下想聊的画题" description="可询问笔墨、构图或作品资料，也可以附上 JPEG／PNG 图片。" /> : null}
      {messages.items.map(message => <article className={styles.message} data-role={message.role} data-testid="assistant-message" key={message.id}><header><strong>{message.role === 'USER' ? '我' : '国画助手'}</strong><span>{stateLabel(message.state)} · {assistantDate(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></header><p className={styles.body}>{message.body}</p>{message.attachmentIds.map(image => <PrivateAttachment key={image} id={image} />)}
        <div className={styles.messageActions}>{message.role === 'USER' && status.executionAvailable ? <button disabled={busy || !!running} onClick={() => { setEditing(message); setEditText(message.body); }}>编辑消息</button> : null}{speech.readable && message.body ? <button onClick={() => speech.read(message.body)}>朗读消息</button> : null}</div>
        {message.runId && message.role === 'ASSISTANT' && status.executionAvailable ? <RunDetails key={`${message.runId}:${revision}`} id={message.runId} known={runs.items.find(run => run.id === message.runId)} access={access} choose={choose} retry={retry} disabled={busy || !!pendingChat || !model || !generationAvailable} /> : null}
      </article>)}
      {currentLive && !messages.items.some(message => message.role === 'ASSISTANT' && message.runId === currentLive.id) ? <article className={styles.message} data-testid="assistant-live"><header><strong>{currentLive.kind === 'SUMMARY' ? '摘要' : '国画助手'}</strong><span role="status" data-testid="run-status">{stateLabel(currentLive.status)}</span></header><p className={styles.body}>{currentLive.checkpoint || '请求已保存，等待回复…'}</p><p className={styles.meta} role="status">{connection}</p>{currentLive.executionUncertain ? <p>已保存部分内容；上游结果不确定，不会自动重新收费执行。</p> : null}</article> : null}
    </section>
    {status.executionAvailable ? <form className={`glass-panel ${styles.composer}`} onSubmit={event => void submit(event)} aria-label="发送消息">
      <div className={styles.inline}><label>模型<select aria-label="模型" value={model} onChange={event => setModel(event.target.value)} disabled={busy}>{!availableModels.length ? <option value="">暂无可执行模型</option> : null}{registry?.models.map(item => <option value={item.id} key={item.id} disabled={!item.enabled || !item.configured || !item.capabilities.streaming}>{item.label}{item.capabilities.images ? ' · 图片' : ' · 文字'}{!item.configured ? ' · 未配置' : !item.enabled ? ' · 停用' : ''}</option>)}</select></label><span className={`${styles.meta} ${styles.capabilityEvidence}`}>能力声明：{selectedModel?.evidence || '尚无实际提供商验证'}</span></div>
      {ragflowAvailable(registry) ? <div className={styles.inline}><label><input type="checkbox" checked={ragflow} onChange={event => setRagflow(event.target.checked)} />RAG 文档检索</label></div> : null}
      <ArtworkSelection selected={selectedArtworks} onChange={setSelectedArtworks} disabled={busy || !!pendingChat} />
      <label>消息<textarea aria-label="消息" value={text} maxLength={32000} placeholder="例如：我想画一幅雨后山水，怎样安排远近与留白？" onChange={event => setText(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void submit(); } }} /></label>
      {draft.loading ? <p role="status">正在核对待发送图片…</p> : null}
      {draft.error ? <p role="alert" className={styles.error}>{draft.error}<button type="button" className={styles.small} onClick={() => void draft.refresh()}>核对上传状态</button></p> : null}
      {draft.notice ? <p role="status">{draft.notice}</p> : null}
      {draft.pending.map(item => <p key={item.scope} role="status">{item.state === 'uploading' ? '上次上传仍未完成。可核对状态，或明确移除后重新选择图片。' : '上次图片尚未获服务器确认。请重新选择原文件；若文件从未被接受，刷新后无法恢复本地字节。'}<button type="button" className={styles.small} disabled={busy || draft.loading} onClick={() => void draft.refresh()}>核对上传状态</button>{item.id ? <button type="button" className={styles.small} disabled={busy} onClick={() => void act(() => draft.remove(item.id!, item.scope))}>移除未完成上传</button> : null}</p>)}
      {attachments.length ? <p className={styles.meta}>已保存的会话待发送图片；刷新不会移除。草稿有效期内可恢复，发送后随消息保留。</p> : null}
      {attachments.map(image => <div key={image.id}><PrivateAttachment id={image.id} />{image.draftExpiresAt ? <small className={styles.meta}>未发送草稿有效期至 {assistantDate(image.draftExpiresAt).toLocaleString('zh-CN')}</small> : null}<button type="button" className={styles.small} disabled={busy || draft.loading} onClick={() => void act(() => draft.remove(image.id))}>移除待发送图片</button></div>)}
      {draft.hasMore ? <button type="button" className="button" disabled={draft.loading} onClick={() => void draft.more()}>加载更多待发送图片</button> : null}
      {attachments.length > 4 || draft.hasMore ? <p role="alert">当前会话有超过四张待发送图片。请读取并移除多余图片后再发送；不会静默遗漏或自动删除。</p> : null}
      {attachments.length && !selectedModel?.capabilities.images ? <p role="alert">所选模型不支持图片，请明确选择支持图片的模型；不会丢弃图片或自动切换模型。</p> : null}
      {editedHead ? <div className={styles.notice}>编辑已保存为新分支；原分支保留。<button type="button" className="button" disabled={busy || !!pendingChat || !model || !generationAvailable} onClick={() => void executeEdit()}>生成编辑后的回复</button></div> : null}
      <div className={styles.inline}><label>添加图片<input type="file" aria-label="添加图片" accept="image/jpeg,image/png" disabled={busy || draft.loading || attachments.length >= 4 || draft.hasMore || !!pendingChat} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} /></label>{speech.supported ? <button type="button" className="button" onClick={speech.listen}>{speech.listening ? '停止语音输入' : '语音输入'}</button> : <span className={styles.meta}>当前浏览器不支持语音输入</span>}{speech.speaking ? <button type="button" className="button" onClick={speech.stop}>停止朗读</button> : null}{running ? <button type="button" className="button" disabled={busy} onClick={() => void cancel(pendingChat || running)}>取消生成</button> : null}{!pendingChat ? <button type="submit" className="button button-primary" disabled={busy || !generationAvailable || !model || !branch || messages.loading || !!messages.error || draft.loading || !!draft.error || draft.hasMore || attachments.length > 4 || (!text.trim() && !attachments.length) || (!!attachments.length && !selectedModel?.capabilities.images)}>发送</button> : null}</div>
      <p>Enter 发送，Shift + Enter 换行。语音识别文字会先放入输入框，由你确认；语音能力由浏览器提供，可能使用其在线服务。图片仅支持 JPEG／PNG，最多 4 张。离开页面不会取消已受理的生成。</p>
    </form> : null}
    {status.executionAvailable ? <>
      <details className={`glass-panel ${styles.tools}`} open={summaryOpen} onToggle={event => setSummaryOpen(event.currentTarget.open)}><summary>会话摘要</summary><p>摘要继承本分支最近成功对话的模型。同一上下文会去重；不会每轮无条件调用。</p><div className={styles.inline}><button className="button" disabled={busy || !!running || !generationAvailable} onClick={() => void summary()}>生成摘要</button><label><input type="checkbox" checked={session.summaryAutoEnabled} disabled={busy || !status.automaticSummaryAvailable || !generationAvailable} onChange={event => void act(() => onAuto(event.target.checked))} />自动摘要</label></div><p className={styles.meta}>{status.automaticSummaryAvailable ? `服务器条件：新增 ${status.summaryTurnThreshold} 轮、空闲 ${status.summaryIdleSeconds} 秒，每小时最多 ${status.maxSummaryPerHour} 次；仅此会话主动开启后生效。` : '服务器未开放自动摘要；会话设置不会绕过全局限制。'}</p>{summaries.items.map(item => <article key={item.id}><strong>{stateLabel(item.status)}{item.stale ? ' · 历史摘要（已过时）' : ''}</strong><p className={styles.body}>{item.body || '暂无已保存摘要内容'}</p><span className={styles.meta}>模型 {item.model_id} · 摘要独立记录调用与用量</span></article>)}{!summaries.loading && !summaries.items.length ? <p>当前分支暂无摘要。</p> : null}<LoadMore page={summaries} label="更多摘要" /></details>
      <details className={`glass-panel ${styles.tools}`} open={timelineOpen} onToggle={event => setTimelineOpen(event.currentTarget.open)}><summary>创作记录</summary><p>仅记录助手中的交流；阶段分类不代表平台工作坊或现实创作行为。</p><LoadMore page={timeline} label="加载更早记录" />{timeline.items.map(row => <article key={row.messageId}><span className={styles.meta}>{assistantDate(row.createdAt).toLocaleString('zh-CN')} · {row.role === 'USER' ? '我' : '助手'} · {stateLabel(row.state)}</span><p className={styles.body}>{row.body}</p><label>阶段分类<select aria-label={`阶段分类 ${row.messageId}`} value={row.classification || ''} disabled={busy} onChange={event => void classify(row, event.target.value)}><option value="" disabled>未分类</option>{stageLabels.map(label => <option key={label}>{label}</option>)}</select></label><small>来源：{row.classificationSource === 'USER' ? '用户分类' : '规则分类'} · 版本 {row.classificationVersion}</small></article>)}{!timeline.loading && !timeline.items.length ? <p>当前分支暂无创作记录。</p> : null}</details>
      <details className={`glass-panel ${styles.tools}`}><summary>执行状态与恢复</summary><p>刷新与重连只读取同一任务。结果不确定时不会自动重新执行；明确重试使用该执行的原模型与配置，是新的尝试；上一次仍可能产生费用。</p>{runs.items.map(run => <article key={run.id}><p>{run.kind} · {stateLabel(run.status)} · 尝试 {run.attempt} · {run.modelKey}</p>{run.errorCode ? <p>{run.errorCode}</p> : null}{['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status) ? <button className="button" disabled={busy || !!running || !generationAvailable} onClick={() => void retry(run)}>明确重试</button> : null}</article>)}<LoadMore page={runs} label="更多执行记录" /></details>
    </> : null}
    {editing ? <Dialog title="编辑消息并保留原分支" close={() => setEditing(null)}><form onSubmit={event => void saveEdit(event)}>{error ? <p role="alert" className={styles.error}>{error}</p> : null}<label>新的消息内容<textarea autoFocus aria-label="新的消息内容" required value={editText} maxLength={32000} onChange={event => setEditText(event.target.value)} /></label><p>保存只创建历史分支，不自动生成回复。</p><footer><button type="button" className="button" onClick={() => setEditing(null)}>返回</button><button className="button button-primary" disabled={busy}>保存为新分支</button></footer></form></Dialog> : null}
  </>;
}
function RunDetails({ id, known, access, choose, retry, disabled }: { id: string; known?: Run; access: Access; choose: (run: Run, card: string, option: string) => Promise<void>; retry: (run: Run) => Promise<void>; disabled: boolean }) {
  const [data, setData] = useState<{ run: Run; citations: Citation[]; choices: Choice[] } | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0); const { request, report } = access;
  useEffect(() => { let alive = true; void request(async (token, signal) => { const [run, citations, choices] = await Promise.all([known ? Promise.resolve(known) : assistantRequest<Run>(`/runs/${enc(id)}`, token, signal), assistantRequest<Citation[]>(`/runs/${enc(id)}/citations`, token, signal), assistantRequest<Choice[]>(`/runs/${enc(id)}/choices`, token, signal)]); return { run, citations, choices }; }).then(value => { if (alive) setData(value); }).catch(error => { if (alive && !isAbortError(error)) { setError('引用或选择卡未能读取。'); report(error); } }); return () => { alive = false; }; }, [id, known, request, report, attempt]);
  if (error) return <p>{error}<button className={styles.small} onClick={() => { setError(''); setAttempt(value => value + 1); }}>重新读取来源</button></p>;
  if (!data) return null;
  return <>
    <p className={styles.meta}>模型 {data.run.modelKey} · 尝试 {data.run.attempt}</p>
    {artworkRunFailureNotice(data.run.errorCode) ? <p className={styles.notice} role="alert">{artworkRunFailureNotice(data.run.errorCode)}</p> : null}
    {Object.entries(data.run.retrieval || {}).map(([source, result]) => <p className={styles.meta} key={source}>{source === 'artworks' ? '平台作品' : source === 'ragflow' ? 'RAG 文档' : source}：{retrievalLabel(result && typeof result === 'object' && 'state' in result ? result.state : result)}</p>)}
    {data.choices.map(card => <section key={card.id} className={styles.choices} data-testid="choice-card"><h4>{card.title}</h4><p className={styles.meta}>选择卡使用当前模型继续对话，不附加输入框中的图片或重新检索。</p><div className={styles.inline}>{card.options.map(option => <button key={option.id} className="button" disabled={disabled} onClick={() => void choose(data.run, card.id, option.id)}>{option.label}</button>)}</div></section>)}
    {data.citations.length ? <details className={styles.tools}><summary>参考来源 · {data.citations.length}</summary>{data.citations.map(citation => <CitationView key={citation.id} citation={citation} />)}</details> : null}
    {['FAILED', 'INTERRUPTED', 'CANCELLED'].includes(data.run.status) ? <div className={styles.notice}><p>{stateLabel(data.run.status)}。已保存的部分回复仍保留；明确重试使用原模型，可能产生新的费用。</p><button className="button" disabled={disabled} onClick={() => void retry(data.run)}>明确重试</button></div> : null}
  </>;
}
function CitationView({ citation }: { citation: Citation }) {
  const artworkId = citation.provenance.artworkId;
  const deliveryObserved = citation.provenance.deliveryEvidence === 'MODEL_STREAM_OBSERVED';
  const safeArtwork = citation.sourceType === 'PLATFORM_ARTWORK' && typeof artworkId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artworkId);
  const fields = citation.sourceType === 'PLATFORM_ARTWORK' ? platformCitationFields(citation.excerpt) : null;
  return <article className={styles.citation}><strong>{citation.sourceType === 'PLATFORM_ARTWORK' ? (deliveryObserved ? '平台作品 · 本次回答的文字快照' : '平台作品 · 已保存来源快照') : 'RAG 文档'} [{citation.ordinal}]</strong>
    {fields?.length ? fields.map((field, index) => <p key={index}>{field.label}：{field.value} <small>（{field.uncertainty || '未独立核验'}）{field.raw ? `原始文本：${field.raw}` : ''}</small></p>) : <p className={styles.body}>{citation.excerpt}</p>}
    {citation.sourceType === 'PLATFORM_ARTWORK' ? <p className={styles.meta}>{deliveryObserved ? '已向模型提供以下公开文字并观察到响应；这不证明模型采用了每个字段，也不代表模型查看了原画。' : '这是已保存的来源记录；历史记录未核验是否实际提供给模型。'}当前详情可能已更新或不再可访问。记录事实与模型解释应分别理解。</p> : null}
    {citation.provenance.contextTruncated === true ? <p className={styles.meta}>为控制上下文长度，仅提供了所记录字段的有界摘录；未提供的细节不应视为已核实。</p> : null}
    {safeArtwork ? <Link href={`/gallery/${artworkId}`}>查看当前受控作品详情</Link> : null}
    <details><summary>引用与版本</summary><small>引用 {citation.id}<br />来源 {citation.sourceId}<br />版本 {citation.sourceVersion || '上游未提供版本'}<br />公开投影 {citation.projectionVersion || '不适用'}<br />摘录 SHA-256 {citation.excerptSha256}</small><small>{deliveryObserved ? '投递证据：已观察到模型流响应。' : citation.provenance.deliveryEvidence === 'LOOKUP_ONLY' ? '本次仅查询，未提交模型。' : '历史投递状态未核验。'}正文中的其他编号或链接不自动视为可信来源。</small></details>
  </article>;
}
