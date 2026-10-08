"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body>
        <main className="fatal-error">
          <h1>ArtLIVE 画智体暂时无法启动</h1>
          <p>请稍后重试。</p>
          <button type="button" onClick={reset}>重新加载</button>
        </main>
      </body>
    </html>
  );
}
