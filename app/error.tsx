"use client";

import { useEffect } from "react";

import { StatePanel } from "@/components/state-panel";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("ArtLIVE route error", error);
  }, [error]);

  return (
    <main className="page-shell">
      <StatePanel kind="error" title="页面暂时无法显示" description="请重试；如果问题持续，请稍后再访问。" actionLabel="重试" onAction={reset} />
    </main>
  );
}
