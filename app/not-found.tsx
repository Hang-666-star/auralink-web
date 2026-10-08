import { StatePanel } from "@/components/state-panel";

export default function NotFound() {
  return (
    <main className="page-shell">
      <StatePanel kind="empty" title="没有找到这页画卷" description="地址可能已变化，返回画廊继续浏览吧。" actionLabel="返回画廊" actionHref="/gallery" />
    </main>
  );
}
