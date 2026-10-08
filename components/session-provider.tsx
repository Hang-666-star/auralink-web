"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api, ApiError } from "@/lib/api";
import type { AuthResponse, UserProfile } from "@/lib/types";

const TOKEN_KEY = "artlive.session.token.v1";

type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

type SessionContextValue = {
  status: SessionStatus;
  token: string | null;
  user: UserProfile | null;
  establish: (auth: AuthResponse) => void;
  signOut: () => void;
  restore: () => Promise<void>;
  isCurrentSession: (candidateToken: string | null) => boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function profileFromAuth(auth: AuthResponse): UserProfile {
  return {
    id: auth.userId,
    username: auth.username,
    fullName: auth.fullName,
    email: "",
    createdAt: null,
    updatedAt: null,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const currentTokenRef = useRef<string | null>(null);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    currentTokenRef.current = null;
    setToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const restore = useCallback(async () => {
    const storedToken = window.localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      currentTokenRef.current = null;
      setToken(null);
      setUser(null);
      setStatus("anonymous");
      return;
    }

    currentTokenRef.current = storedToken;
    setToken(storedToken);
    setStatus("loading");
    try {
      const profile = await api.profile(storedToken);
      if (currentTokenRef.current !== storedToken) return;
      setUser(profile);
      setStatus("authenticated");
    } catch (error) {
      if (currentTokenRef.current !== storedToken) return;
      if (error instanceof ApiError && error.kind === "unauthorized") {
        signOut();
        return;
      }
      setUser(null);
      setStatus("error");
    }
  }, [signOut]);

  const establish = useCallback((auth: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, auth.token);
    currentTokenRef.current = auth.token;
    setToken(auth.token);
    setUser(profileFromAuth(auth));
    setStatus("authenticated");
  }, []);

  const isCurrentSession = useCallback(
    (candidateToken: string | null) => currentTokenRef.current === candidateToken,
    [],
  );

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key === TOKEN_KEY) void restore();
    };
    window.addEventListener("storage", syncSession);
    return () => window.removeEventListener("storage", syncSession);
  }, [restore]);

  const value = useMemo(
    () => ({ status, token, user, establish, signOut, restore, isCurrentSession }),
    [establish, isCurrentSession, restore, signOut, status, token, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession 必须在 SessionProvider 内使用");
  return context;
}
