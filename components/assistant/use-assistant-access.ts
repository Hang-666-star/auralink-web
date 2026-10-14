'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '@/components/session-provider';
import { ApiError, isAbortError } from '@/lib/api';
import { assistantGenerationNotice } from '@/lib/assistant-contracts';
/** Every operation captures login generation. Stale successes are rejected as well as 401s. */
export function useAssistantAccess(onError: (message: string) => void) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());
  const errorRef = useRef(onError); errorRef.current = onError;
  useEffect(() => { mounted.current = true; const active = requests.current; return () => { mounted.current = false; active.forEach(controller => controller.abort()); active.clear(); }; }, [sessionIdentity]);
  const request = useCallback(async <T,>(action: (token: string, signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (!token || !mounted.current || !isCurrentSession(sessionIdentity)) throw new DOMException('Stale session', 'AbortError');
    const identity = sessionIdentity; const controller = new AbortController(); requests.current.add(controller);
    try {
      const result = await action(token, controller.signal);
      if (controller.signal.aborted || !isCurrentSession(identity)) throw new DOMException('Stale account', 'AbortError');
      return result;
    } catch (error) {
      if (controller.signal.aborted || !isCurrentSession(identity)) throw new DOMException('Stale account', 'AbortError');
      if (error instanceof ApiError && error.status === 401) signOutIfCurrent(identity);
      throw error;
    } finally { requests.current.delete(controller); }
  }, [token, sessionIdentity, isCurrentSession, signOutIfCurrent]);
  const report = useCallback((error: unknown) => {
    if (isAbortError(error)) return;
    if (error instanceof ApiError && ['ASSISTANT_GENERATION_SUSPENDED', 'ASSISTANT_GENERATION_CONTROL_UNAVAILABLE'].includes(error.code || '')) { errorRef.current(assistantGenerationNotice(error.code)); return; }
    errorRef.current(error instanceof Error ? error.message : '操作未完成，请重试。');
  }, []);
  return { request, report, token, sessionIdentity, isCurrentSession, signOutIfCurrent };
}
