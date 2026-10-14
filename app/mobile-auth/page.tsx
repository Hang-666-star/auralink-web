"use client";

import { useEffect, useState } from "react";

const TOKEN_KEY = "artlive.session.token.v1";
const ALLOWED_DESTINATIONS = new Set(["/knowledge", "/studio"]);

export default function MobileAuthPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = fragment.get("token")?.trim() ?? "";
    const requestedDestination = fragment.get("next") ?? "";

    // Remove the credential-bearing fragment before any further navigation.
    window.history.replaceState(null, "", "/mobile-auth");

    if (!token || token.length > 4096) {
      setError("未收到有效的小程序登录凭据，请返回小程序后重试。");
      return;
    }
    if (!ALLOWED_DESTINATIONS.has(requestedDestination)) {
      setError("目标页面无效，请返回小程序后重试。");
      return;
    }

    window.localStorage.setItem(TOKEN_KEY, token);
    window.location.replace(requestedDestination);
  }, []);

  return (
    <main className="page-shell availability-page">
      <section className="state-panel glass-panel state-loading">
        <span className="state-symbol">墨</span>
        <div>
          <h1>{error ? "无法同步登录状态" : "正在同步小程序登录状态"}</h1>
          <p>{error ?? "即将进入 ArtLIVE 功能页面，无需再次输入账号密码。"}</p>
        </div>
      </section>
    </main>
  );
}
