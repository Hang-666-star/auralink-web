"use client";

import { useEffect, useState } from "react";

const ALLOWED_BACK_PATHS = new Set([
  "/pages/index/index",
  "/pages/gallery/gallery",
  "/pages/knowledge/knowledge",
  "/pages/assistant/assistant",
  "/pages/account/account",
]);

type MiniProgramBridge = {
  switchTab: (options: { url: string; fail?: () => void }) => void;
};

type WeChatWindow = Window & {
  wx?: {
    miniProgram?: MiniProgramBridge;
  };
};

export function MiniAppBackButton() {
  const [backPath, setBackPath] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("source") !== "miniapp") return;
    const requestedBackPath = query.get("back") ?? "";
    setBackPath(ALLOWED_BACK_PATHS.has(requestedBackPath) ? requestedBackPath : "/pages/index/index");
    document.body.classList.add("miniapp-webview");
    return () => document.body.classList.remove("miniapp-webview");
  }, []);

  if (!backPath) return null;

  const goBack = () => {
    const bridge = (window as WeChatWindow).wx?.miniProgram;
    if (bridge) {
      bridge.switchTab({ url: backPath, fail: () => window.history.back() });
      return;
    }
    window.history.back();
  };

  return (
    <button className="miniapp-back" type="button" aria-label="返回上一页" onClick={goBack}>
      <span aria-hidden="true">‹</span>
      返回
    </button>
  );
}

